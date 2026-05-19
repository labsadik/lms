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
  if (!stripeKey || !webhookSecret) return new Response(JSON.stringify({ error: 'Server config error' }), { status: 500, headers: corsHeaders });

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new Response('Missing signature', { status: 400, headers: corsHeaders });

  const raw = await req.text();
  let event: Stripe.Event;
  
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, webhookSecret);
  } catch (e: any) {
    console.error('Webhook signature verification failed', e?.message);
    return new Response(`Bad signature`, { status: 400, headers: corsHeaders });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    
    const userId = session.metadata?.user_id || session.client_reference_id;
    const courseId = session.metadata?.course_id;
    const promoId = session.metadata?.promocode_id; // The ID we passed in Step 2
    const promoCode = session.metadata?.promo_code;
    const amountInr = Math.round((session.amount_total || 0) / 100);

    if (!userId || !courseId) {
      console.error('Missing metadata in webhook', session.id);
      return new Response('ok', { headers: corsHeaders });
    }

    // 1. Check if we already processed this session (Idempotency)
    const { data: existingSession } = await admin.from('enrollments').select('id').eq('stripe_session_id', session.id).maybeSingle();
    if (existingSession) return new Response('ok', { headers: corsHeaders });

    // 2. Check if user is already enrolled
    const { data: enrollment } = await admin.from('enrollments').select('*').eq('user_id', userId).eq('course_id', courseId).maybeSingle();

    const cleanPromoId = (promoId && promoId !== '') ? promoId : null;

    if (enrollment) {
      // Update existing enrollment if it was missing the stripe session
      if (!enrollment.stripe_session_id) {
        await admin.from('enrollments').update({ 
          stripe_session_id: session.id,
          amount_paid_inr: amountInr,
          // Fix missing promo if the first enrollment attempt failed to save it
          promocode_id: cleanPromoId || enrollment.promocode_id, 
          promocode: promoCode || enrollment.promocode
        }).eq('id', enrollment.id);
      }
      return new Response('ok', { headers: corsHeaders });
    }

    // 3. Create New Enrollment
    const { error: insErr } = await admin.from('enrollments').insert({
      user_id: userId,
      course_id: courseId,
      amount_paid_inr: amountInr,
      stripe_session_id: session.id,
      promocode: promoCode,
      promocode_id: cleanPromoId, // <--- This fires the DB Trigger!
    });

    if (insErr) {
      console.error('Enrollment insert failed', insErr);
      return new Response(JSON.stringify({ error: 'Insert failed' }), { status: 500, headers: corsHeaders });
    }

    // NOTE: We do NOT manually insert into promocode_redemptions here anymore.
    // The Database Trigger (Step 1) handles that automatically.
  }

  return new Response('ok', { headers: corsHeaders });
});