import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: auth } } });
    const admin = createClient(supabaseUrl, service);

    const { data: ud } = await userClient.auth.getUser(auth.replace('Bearer ', ''));
    const userId = ud?.user?.id;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({} as any));
    const partId = body?.part_id;
    const minute = Number(body?.minute);
    const courseId = body?.course_id ?? null;
    if (!partId || typeof partId !== 'string') return json({ error: 'part_id required' }, 400);
    if (!Number.isFinite(minute) || minute < 1 || minute > 600) return json({ error: 'invalid minute' }, 400);

    // Verify the user is enrolled in the course (or part is preview)
    const { data: part, error: partErr } = await admin
      .from('parts')
      .select('id, is_preview, kind, chapters!inner(subject_id, subjects!inner(course_id))')
      .eq('id', partId)
      .maybeSingle();
    if (partErr || !part) return json({ error: 'Part not found' }, 404);
    if ((part as any).kind === 'live') return json({ error: 'Live parts do not award coins' }, 400);

    const partCourseId = (part as any).chapters?.subjects?.course_id;
    if (!(part as any).is_preview) {
      const { data: enr } = await admin
        .from('enrollments').select('id').eq('user_id', userId).eq('course_id', partCourseId).maybeSingle();
      if (!enr) return json({ error: 'Not enrolled' }, 403);
    }

    const refId = `${partId}:m${minute}`;
    const { data: existing } = await admin
      .from('coin_ledger').select('id')
      .eq('user_id', userId).eq('source', 'video').eq('ref_id', refId).maybeSingle();
    if (existing) return json({ awarded: false, reason: 'already' });

    const { error: insErr } = await admin.from('coin_ledger').insert({
      user_id: userId, source: 'video', ref_id: refId,
      course_id: courseId || partCourseId || null, xp: 1, coins: 1,
    });
    if (insErr) return json({ error: insErr.message }, 500);

    // Update profile totals + streak
    const { data: prof } = await admin.from('profiles')
      .select('xp, coins, current_streak, longest_streak, last_activity_date')
      .eq('user_id', userId).maybeSingle();
    if (prof) {
      const newXp = (prof.xp || 0) + 1;
      const newCoins = (prof.coins || 0) + 1;
      const newLevel = Math.max(1, Math.floor(Math.sqrt(newXp / 100)) + 1);
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      let curStreak = prof.current_streak || 0;
      let longest = prof.longest_streak || 0;
      let lastDate = prof.last_activity_date as string | null;
      if (lastDate !== today) {
        curStreak = lastDate === yesterday ? curStreak + 1 : 1;
        longest = Math.max(longest, curStreak);
        lastDate = today;
      }
      await admin.from('profiles').update({
        xp: newXp, coins: newCoins, level: newLevel,
        current_streak: curStreak, longest_streak: longest, last_activity_date: lastDate,
      }).eq('user_id', userId);
      return json({ awarded: true, xp: newXp, coins: newCoins, level: newLevel });
    }
    return json({ awarded: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
