import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // 1. Auth Check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: ce } = await userClient.auth.getUser();
    if (ce || !userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    
    const userId = userData.user.id;
    const userEmail = userData.user.email || undefined;
    const body = await req.json();
    
    const course_id = body.course_id || body.courseId;
    const promocode_id = body.promocode_id || body.promocodeId; // Expecting UUID

    if (!course_id) return new Response(JSON.stringify({ error: 'course_id required' }), { status: 400, headers: corsHeaders });

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    // 2. Check Enrollment
    const { data: existing } = await admin.from('enrollments').select('id').eq('user_id', userId).eq('course_id', course_id).maybeSingle();
    if (existing) return new Response(JSON.stringify({ already_enrolled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    // 3. Fetch Course
    const { data: course } = await admin.from('courses').select('id, title, slug, price_inr, is_published').eq('id', course_id).maybeSingle();
    if (!course || !course.is_published) return new Response(JSON.stringify({ error: 'Course not available' }), { status: 404, headers: corsHeaders });

    // 4. Validate & Calculate Discount
    let discount = 0;
    let finalPromoId: string | null = null;
    let finalPromoCode: string | null = null;

    if (promocode_id) {
      const { data: pc } = await admin.from('promocodes').select('*').eq('id', promocode_id).eq('is_active', true).maybeSingle();
      
      if (pc) {
        const expired = pc.expires_at && new Date(pc.expires_at) < new Date();
        const exhausted = pc.max_uses && pc.uses_count >= pc.max_uses;
        const wrongCourse = pc.course_id && pc.course_id !== course.id;

        if (!expired && !exhausted && !wrongCourse) {
          // Valid Code
          discount = pc.discount_type === 'percent' 
            ? Math.round((course.price_inr * pc.discount_value) / 100) 
            : pc.discount_value;
          discount = Math.min(discount, course.price_inr);
          
          finalPromoId = pc.id;
          finalPromoCode = pc.code;
        }
      }
    }

    const finalPrice = Math.max(0, course.price_inr - discount);

    // 5. Handle Free Enrollments (Trigger handles redemption)
    if (finalPrice === 0) {
      const { error: insErr } = await admin.from('enrollments').insert({
        user_id: userId,
        course_id: course.id,
        amount_paid_inr: 0,
        promocode: finalPromoCode,
        promocode_id: finalPromoId, // <--- CRITICAL: Pass ID so Trigger fires
        enrolled_at: new Date().toISOString(),
      });

      if (insErr) {
        console.error('Free enrollment failed:', insErr);
        return new Response(JSON.stringify({ error: 'Enrollment failed' }), { status: 500, headers: corsHeaders });
      }

      // No need to manually update promocodes or redemptions here!
      return new Response(JSON.stringify({ free: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // 6. Handle Paid Enrollments (Stripe)
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: corsHeaders });
    
    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    const origin = req.headers.get('origin') || 'https://example.com';
    
    const successUrl = body.success_url || `${origin}/courses/${course.slug}?paid=1`;
    const finalSuccessUrl = successUrl.includes('{CHECKOUT_SESSION_ID}') 
      ? successUrl 
      : `${successUrl}&session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: userEmail,
      client_reference_id: userId,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'inr',
          unit_amount: finalPrice * 100,
          product_data: { 
            name: course.title, 
            description: finalPromoCode ? `Promo: ${finalPromoCode}` : undefined 
          },
        },
      }],
      metadata: {
        user_id: userId,
        course_id: course.id,
        // Pass ID to Webhook
        promocode_id: finalPromoId || '',
        promo_code: finalPromoCode || '',
      },
      success_url: finalSuccessUrl,
      cancel_url: body.cancel_url || `${origin}/courses/${course.slug}?canceled=1`,
    });

    return new Response(JSON.stringify({ url: session.url, id: session.id }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('create-checkout-session error', e);
    return new Response(JSON.stringify({ error: e?.message || 'Server error' }), { status: 500, headers: corsHeaders });
  }
});