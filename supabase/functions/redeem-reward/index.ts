import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(supabaseUrl, service);
    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: auth } } });

    const token = auth.replace('Bearer ', '');
    const { data: ud } = await userClient.auth.getUser(token);
    const userId = ud?.user?.id;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const rewardId = body?.reward_id;
    if (!rewardId || typeof rewardId !== 'string') return json({ error: 'reward_id required' }, 400);

    const { data: reward, error: rwErr } = await admin.from('rewards').select('*').eq('id', rewardId).maybeSingle();
    if (rwErr) return json({ error: rwErr.message }, 500);
    if (!reward) return json({ error: 'Reward not found' }, 404);
    if (!reward.is_active) return json({ error: 'Reward is not active' }, 410);
    if (reward.stock !== null && reward.stock !== undefined && reward.stock <= 0) {
      return json({ error: 'Reward is out of stock' }, 410);
    }

    // Check already redeemed
    const { data: existing } = await admin.from('reward_redemptions').select('id').eq('user_id', userId).eq('reward_id', rewardId).maybeSingle();
    if (existing) return json({ error: 'You have already redeemed this reward' }, 409);

    // Check coins
    const { data: profile, error: pErr } = await admin.from('profiles').select('coins').eq('user_id', userId).maybeSingle();
    if (pErr) return json({ error: pErr.message }, 500);
    if (!profile) return json({ error: 'Profile missing' }, 404);
    const need = reward.cost_coins || 0;
    if ((profile.coins || 0) < need) {
      return json({ error: `Not enough coins (need ${need}, have ${profile.coins || 0})` }, 402);
    }

    const code = `RWD-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    const discountValue = parseInt(reward.reward_value || '0') || 0;
    if (discountValue <= 0 || discountValue > 100) {
      return json({ error: 'Reward misconfigured: invalid discount_value' }, 422);
    }

    const { error: insPromo } = await admin.from('promocodes').insert({
      code, discount_type: 'percent', discount_value: discountValue, max_uses: 1, is_active: true,
    });
    if (insPromo) return json({ error: insPromo.message }, 500);

    const { error: insRed } = await admin.from('reward_redemptions').insert({
      user_id: userId, reward_id: rewardId, cost_paid: reward.cost_coins, code_granted: code,
    });
    if (insRed) return json({ error: insRed.message }, 500);

    await admin.from('profiles').update({ coins: (profile.coins || 0) - reward.cost_coins }).eq('user_id', userId);

    return json({ code, discount: discountValue });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
