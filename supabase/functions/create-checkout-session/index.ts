import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: ce } = await userClient.auth.getUser();
    if (ce || !userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    const userId = userData.user.id;
    const userEmail = userData.user.email || undefined;

    const body = await req.json();
    const { course_id, promocode_id, success_url, cancel_url } = body as {
      course_id: string; promocode_id?: string; success_url?: string; cancel_url?: string;
    };
    if (!course_id) return new Response(JSON.stringify({ error: 'course_id required' }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // Already enrolled?
    const { data: existing } = await admin.from('enrollments').select('id').eq('user_id', userId).eq('course_id', course_id).maybeSingle();
    if (existing) return new Response(JSON.stringify({ already_enrolled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: course } = await admin.from('courses').select('id, title, slug, price_inr, is_published').eq('id', course_id).maybeSingle();
    if (!course || !course.is_published) return new Response(JSON.stringify({ error: 'Course not available' }), { status: 404, headers: corsHeaders });

    let discount = 0;
    let promoCode: string | null = null;
    if (promocode_id) {
      const { data: pc } = await admin.from('promocodes').select('*').eq('id', promocode_id).eq('is_active', true).maybeSingle();
      if (pc) {
        const expired = pc.expires_at && new Date(pc.expires_at) < new Date();
        const exhausted = pc.max_uses && pc.uses_count >= pc.max_uses;
        const wrongCourse = pc.course_id && pc.course_id !== course.id;
        if (!expired && !exhausted && !wrongCourse) {
          discount = pc.discount_type === 'percent' ? Math.round((course.price_inr * pc.discount_value) / 100) : pc.discount_value;
          discount = Math.min(discount, course.price_inr);
          promoCode = pc.code;
        }
      }
    }
    const finalPrice = Math.max(0, course.price_inr - discount);

    // Free path: enroll directly.
    if (finalPrice === 0) {
      await admin.from('enrollments').insert({
        user_id: userId, course_id: course.id, amount_paid_inr: 0, promocode: promoCode,
      });
      if (promocode_id && promoCode) {
        await admin.from('promocode_redemptions').insert({ user_id: userId, course_id: course.id, promocode_id });
        const { data: pc } = await admin.from('promocodes').select('uses_count').eq('id', promocode_id).maybeSingle();
        if (pc) await admin.from('promocodes').update({ uses_count: (pc.uses_count || 0) + 1 }).eq('id', promocode_id);
      }
      return new Response(JSON.stringify({ free: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: corsHeaders });
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

    const origin = req.headers.get('origin') || 'https://example.com';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: userEmail,
      client_reference_id: userId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'inr',
          unit_amount: finalPrice * 100, // paise
          product_data: { name: course.title, description: promoCode ? `Promo: ${promoCode}` : undefined },
        },
      }],
      metadata: {
        user_id: userId,
        course_id: course.id,
        promocode_id: promocode_id || '',
        promo_code: promoCode || '',
      },
      success_url: success_url || `${origin}/courses/${course.slug}?paid=1`,
      cancel_url: cancel_url || `${origin}/courses/${course.slug}?canceled=1`,
    });

    return new Response(JSON.stringify({ url: session.url, id: session.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('create-checkout-session error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Server error' }), { status: 500, headers: corsHeaders });
  }
});
