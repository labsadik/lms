import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders });

  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!stripeKey || !webhookSecret) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), { status: 500, headers: corsHeaders });
  }
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', { status: 400, headers: corsHeaders });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret);
  } catch (e: any) {
    console.error('Signature verification failed', e?.message);
    return new Response(`Bad signature: ${e?.message}`, { status: 400, headers: corsHeaders });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id || session.client_reference_id;
    const courseId = session.metadata?.course_id;
    const promoId = session.metadata?.promocode_id || null;
    const promoCode = session.metadata?.promo_code || null;
    const amountInr = Math.round((session.amount_total || 0) / 100);

    if (!userId || !courseId) {
      console.error('Missing metadata', session.id);
      return new Response('ok', { headers: corsHeaders });
    }

    // Idempotency: skip if a row with this stripe_session_id exists.
    const { data: existing } = await admin
      .from('enrollments').select('id').eq('stripe_session_id', session.id).maybeSingle();
    if (existing) return new Response('ok', { headers: corsHeaders });

    // Also skip if user is already enrolled via another path.
    const { data: alreadyEnrolled } = await admin
      .from('enrollments').select('id').eq('user_id', userId).eq('course_id', courseId).maybeSingle();
    if (alreadyEnrolled) {
      await admin.from('enrollments').update({ stripe_session_id: session.id }).eq('id', alreadyEnrolled.id);
      return new Response('ok', { headers: corsHeaders });
    }

    const { error: insErr } = await admin.from('enrollments').insert({
      user_id: userId,
      course_id: courseId,
      amount_paid_inr: amountInr,
      promocode: promoCode || null,
      stripe_session_id: session.id,
    });
    if (insErr) console.error('enrollment insert failed', insErr);

    if (promoId) {
      await admin.from('promocode_redemptions').insert({
        user_id: userId, course_id: courseId, promocode_id: promoId,
      });
      const { data: pc } = await admin.from('promocodes').select('uses_count').eq('id', promoId).maybeSingle();
      if (pc) await admin.from('promocodes').update({ uses_count: (pc.uses_count || 0) + 1 }).eq('id', promoId);
    }
  }

  return new Response('ok', { headers: corsHeaders });
});
