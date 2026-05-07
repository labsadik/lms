// Idempotent endpoint to "start" a new test attempt.
// - Validates the user owns a JWT and is enrolled in the test's course.
// - Returns { ok: true, test_id } so the client can safely clear local state and
//   render a fresh attempt UI. The actual attempt row is created by grade-test
//   on submit (one row per submission), so calling this multiple times is safe
//   and never produces duplicate attempts.
// - Old attempts remain in the database with their finished_at intact, so the
//   "locked" view still works if the user navigates away and comes back.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
    if (ce || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }
    const userId = userData.user.id;

    const { test_id } = await req.json();
    if (!test_id) {
      return new Response(JSON.stringify({ error: 'test_id required' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: test } = await admin.from('tests').select('id, course_id, is_published').eq('id', test_id).maybeSingle();
    if (!test || !test.is_published) {
      return new Response(JSON.stringify({ error: 'Test not available' }), { status: 404, headers: corsHeaders });
    }
    const { data: enrolled } = await admin.from('enrollments').select('id')
      .eq('user_id', userId).eq('course_id', test.course_id).maybeSingle();
    if (!enrolled) {
      return new Response(JSON.stringify({ error: 'Not enrolled' }), { status: 403, headers: corsHeaders });
    }

    // Count finished attempts so the client can show "Attempt #N" if needed.
    const { count } = await admin.from('test_attempts').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('test_id', test_id).not('finished_at', 'is', null);

    return new Response(JSON.stringify({ ok: true, test_id, previous_attempts: count || 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Server error' }), { status: 500, headers: corsHeaders });
  }
});
