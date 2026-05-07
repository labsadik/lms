import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(supabaseUrl, service);
    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: auth } } });
    const token = auth.replace('Bearer ', '');
    let userId: string | null = null;
    try {
      const { data: claims } = await (userClient.auth as any).getClaims(token);
      userId = claims?.claims?.sub ?? null;
    } catch (_) { /* fall back below */ }
    if (!userId) {
      const { data: ud } = await userClient.auth.getUser(token);
      userId = ud?.user?.id ?? null;
    }
    if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

    const { data: roleRow } = await admin.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders });

    const { data: list, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (error) throw error;

    const users = list.users.map((u: any) => ({ id: u.id, email: u.email, created_at: u.created_at }));
    return new Response(JSON.stringify({ users }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
