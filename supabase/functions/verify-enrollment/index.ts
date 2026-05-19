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
    if (!authHeader?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !stripeKey) {
      return new Response(JSON.stringify({ error: 'Server missing env vars' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    
    const userId = userData.user.id;
    const body = await req.json();
    const courseId = body?.course_id;
    const sessionId = body?.session_id; // Now receives the exact session ID

    if (!courseId) return new Response(JSON.stringify({ error: 'course_id required' }), { status: 400, headers: corsHeaders });

    const admin = createClient(supabaseUrl, serviceRoleKey);
    
    // 1. Check if already enrolled
    const { data: existing } = await admin.from('enrollments').select('id').eq('user_id', userId).eq('course_id', courseId).maybeSingle();
    if (existing) return new Response(JSON.stringify({ enrolled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
    let session;

    if (sessionId) {
      // 2A. BULLETPROOF PATH: Retrieve the exact session Stripe redirected with
      try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
      } catch (err: any) {
        console.error('❌ Stripe Retrieve error:', err.message);
        return new Response(JSON.stringify({ error: `Stripe retrieve failed: ${err.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } else {
      // 2B. Fallback scanning (if session_id is missing from URL)
      const userEmail = userData.user.email;
      try {
        const listParams: any = { limit: 50 };
        if (userEmail) listParams.customer_email = userEmail;
        const sessions = await stripe.checkout.sessions.list(listParams);
        session = sessions.data.find(s => 
          s.payment_status === 'paid' && 
          s.metadata?.course_id === courseId &&
          (s.metadata?.user_id === userId || s.client_reference_id === userId)
        );
      } catch (err: any) {
        return new Response(JSON.stringify({ error: `Stripe list failed: ${err.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // 3. If the session is valid and paid, FORCE the enrollment
    if (session && session.payment_status === 'paid' && session.metadata?.course_id === courseId) {
      const { error: insErr } = await admin.from('enrollments').insert({
        user_id: userId,
        course_id: courseId,
        amount_paid_inr: Math.round((session.amount_total || 0) / 100),
        promocode: session.metadata?.promo_code && session.metadata.promo_code !== '' ? session.metadata.promo_code : null,
        stripe_session_id: session.id,
      });
      
      if (insErr && insErr.code !== '23505') { // Ignore unique constraint (already enrolled)
        console.error('❌ Force enrollment failed:', JSON.stringify(insErr));
        return new Response(JSON.stringify({ error: `DB Insert failed: ${insErr.message}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ enrolled: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ enrolled: false, error: 'No successful payment found on Stripe' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('❌ verify-enrollment unexpected error:', e);
    return new Response(JSON.stringify({ error: e?.message || 'Internal Server Error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});