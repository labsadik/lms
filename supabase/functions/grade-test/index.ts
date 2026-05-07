import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Gamification: +5 coins per correct, -5 per wrong, 0 for skipped.
// XP = max(0, net coins).
const COIN_CORRECT = 5;
const COIN_WRONG = -5;

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

    const body = await req.json();
    const { test_id, answers } = body as { test_id: string; answers: Record<string, string> };
    if (!test_id || typeof answers !== 'object' || answers === null) {
      return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: test } = await admin.from('tests').select('*').eq('id', test_id).maybeSingle();
    if (!test || !test.is_published) {
      return new Response(JSON.stringify({ error: 'Test not found' }), { status: 404, headers: corsHeaders });
    }

    const { data: enrolled } = await admin.from('enrollments').select('id').eq('user_id', userId).eq('course_id', test.course_id).maybeSingle();
    if (!enrolled) return new Response(JSON.stringify({ error: 'Not enrolled' }), { status: 403, headers: corsHeaders });

    const { data: questions } = await admin
      .from('questions')
      .select('id, marks, question_options(id, is_correct)')
      .eq('test_id', test_id);

    const { data: attempt, error: aErr } = await admin.from('test_attempts').insert({
      user_id: userId, test_id, total: 0, score: 0,
    }).select().single();
    if (aErr || !attempt) {
      return new Response(JSON.stringify({ error: 'Could not start attempt' }), { status: 500, headers: corsHeaders });
    }

    let score = 0; let total = 0;
    let coinsDelta = 0;
    let correctCount = 0; let wrongCount = 0;
    const answerRows: any[] = [];

    for (const q of questions || []) {
      total += q.marks;
      const sel = answers[q.id] || null;
      const correct = (q.question_options || []).find((o: any) => o.is_correct);
      const isCorrect = !!(sel && correct && sel === correct.id);
      if (isCorrect) { score += q.marks; coinsDelta += COIN_CORRECT; correctCount++; }
      else if (sel) { coinsDelta += COIN_WRONG; wrongCount++; }
      answerRows.push({ attempt_id: attempt.id, question_id: q.id, selected_option_id: sel, is_correct: isCorrect });
    }
    if (answerRows.length) await admin.from('test_answers').insert(answerRows);

    const pct = total > 0 ? Math.round((score / total) * 100) : 0;
    const passed = pct >= (test.pass_score || 40);
    const xpDelta = Math.max(0, coinsDelta);

    await admin.from('test_attempts').update({
      score, total, passed, finished_at: new Date().toISOString(),
    }).eq('id', attempt.id);

    // Ledger entry (one per attempt)
    await admin.from('coin_ledger').insert({
      user_id: userId,
      source: 'test_attempt',
      ref_id: attempt.id,
      course_id: test.course_id,
      xp: xpDelta,
      coins: coinsDelta,
    });

    // Update profile totals (coins can go negative? clamp at 0)
    const { data: profile } = await admin.from('profiles').select('xp, coins').eq('user_id', userId).maybeSingle();
    if (profile) {
      const newXp = (profile.xp || 0) + xpDelta;
      const newCoins = Math.max(0, (profile.coins || 0) + coinsDelta);
      const newLevel = Math.max(1, Math.floor(Math.sqrt(newXp / 100)) + 1);
      await admin.from('profiles').update({ xp: newXp, coins: newCoins, level: newLevel }).eq('user_id', userId);
    }

    return new Response(JSON.stringify({
      score, total, pct, passed, attempt_id: attempt.id,
      coins_delta: coinsDelta, xp_delta: xpDelta,
      correct: correctCount, wrong: wrongCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || 'Server error' }), { status: 500, headers: corsHeaders });
  }
});
