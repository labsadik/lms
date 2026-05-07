import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Shield, ShieldOff, ChevronDown, ChevronRight, Search, Plus, Loader2 } from 'lucide-react';

const AdminUsers = () => {
  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [grantCourse, setGrantCourse] = useState<Record<string, string>>({});
  const [granting, setGranting] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const detailsRef = useRef(details);
  detailsRef.current = details;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const load = useCallback(async () => {
    setInitialLoading(true);
    try {
      const [profilesRes, rolesRes, usersRes, coursesRes] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, avatar_url, phone, xp, coins, level, current_streak, longest_streak, created_at').order('created_at', { ascending: false }).limit(500),
        supabase.from('user_roles').select('user_id, role'),
        supabase.functions.invoke('admin-users'),
        supabase.from('courses').select('id, title').order('title'),
      ]);

      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const cs = coursesRes.data || [];

      let authUsers: any[] = [];
      const ud: any = usersRes.data;
      if (ud?.error) toast.error('Auth users: ' + (ud.error.message || 'unknown'));
      else authUsers = ud?.users || [];

      const adminSet = new Set(roles.filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));
      const emails: Record<string, string> = {};
      authUsers.forEach((u: any) => { emails[u.id] = u.email; });

      const profileIds = new Set(profiles.map((p: any) => p.user_id));
      const merged = [
        ...profiles.map((p: any) => ({ ...p, isAdmin: adminSet.has(p.user_id), email: emails[p.user_id] })),
        ...authUsers.filter((u: any) => !profileIds.has(u.id)).map((u: any) => ({
          user_id: u.id, display_name: null, avatar_url: null, phone: null,
          xp: 0, coins: 0, level: 1, current_streak: 0, longest_streak: 0,
          created_at: u.created_at, isAdmin: adminSet.has(u.id), email: u.email,
        })),
      ];

      setRows(merged);
      setAllCourses(cs);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = useCallback(async (uid: string) => {
    const next = new Set(expandedRef.current);
    if (next.has(uid)) {
      next.delete(uid);
      setExpanded(next);
      return;
    }
    next.add(uid);
    setExpanded(next);

    if (detailsRef.current[uid]) return;

    setLoadingDetails((p) => new Set(p).add(uid));
    try {
      // ALL 3 independent queries fire in parallel
      const [ensRes, attemptsRes, redemptionsRes] = await Promise.all([
        supabase.from('enrollments').select('id, enrolled_at, amount_paid_inr, promocode, courses(id, title, slug)').eq('user_id', uid),
        supabase.from('test_attempts').select('id, score, total, passed, finished_at, tests(title)').eq('user_id', uid).order('finished_at', { ascending: false }).limit(20),
        supabase.from('promocode_redemptions').select('id, redeemed_at, promocodes(code), courses(title)').eq('user_id', uid).order('redeemed_at', { ascending: false }),
      ]);

      const enrollments = ensRes.data || [];
      const courseIds = [...new Set(enrollments.map((e: any) => e.courses?.id).filter(Boolean))];

      // Batch: ALL course structures + ALL progress in just 2 queries (not N)
      let partIdMap: Record<string, string[]> = {};
      let completedPartIds = new Set<string>();

      if (courseIds.length > 0) {
        const [subsRes, progressRes] = await Promise.all([
          supabase.from('subjects').select('id, course_id, chapters(id, parts(id))').in('course_id', courseIds),
          supabase.from('progress').select('part_id').eq('user_id', uid).eq('completed', true),
        ]);

        for (const s of subsRes.data || []) {
          const parts: string[] = (s.chapters || []).flatMap((ch: any) => (ch.parts || []).map((p: any) => p.id));
          if (parts.length) partIdMap[s.course_id] = parts;
        }
        for (const p of progressRes.data || []) completedPartIds.add(p.part_id);
      }

      // Compute percentages in JS — zero extra queries
      const items = enrollments.map((e: any) => {
        const total = partIdMap[e.courses?.id] || [];
        const done = total.filter((pid) => completedPartIds.has(pid)).length;
        return { ...e, pct: total.length ? Math.round((done / total.length) * 100) : 0 };
      });

      const totalSpent = items.reduce((s: number, e: any) => s + (e.amount_paid_inr || 0), 0);

      setDetails((prev) => ({
        ...prev,
        [uid]: { enrollments: items, attempts: attemptsRes.data || [], totalSpent, redemptions: redemptionsRes.data || [] },
      }));
    } catch {
      toast.error('Failed to load details');
    } finally {
      setLoadingDetails((p) => { const n = new Set(p); n.delete(uid); return n; });
    }
  }, []);

  const grant = async (uid: string) => {
    const cid = grantCourse[uid];
    if (!cid) { toast.error('Pick a course'); return; }
    setGranting(uid);
    try {
      const { data: existing } = await supabase.from('enrollments').select('id').eq('user_id', uid).eq('course_id', cid).maybeSingle();
      if (existing) { toast.info('Already enrolled'); return; }
      const { error } = await supabase.from('enrollments').insert({ user_id: uid, course_id: cid, amount_paid_inr: 0, promocode: null });
      if (error) { toast.error(error.message); return; }
      toast.success('Course granted');
      setGrantCourse((p) => { const n = { ...p }; delete n[uid]; return n; });
      // Optimistic append to existing details
      const course = allCourses.find((c) => c.id === cid);
      setDetails((prev) => {
        const d = prev[uid];
        if (!d) { delete prev[uid]; return { ...prev }; }
        return { ...prev, [uid]: { ...d, enrollments: [...d.enrollments, { id: crypto.randomUUID(), enrolled_at: new Date().toISOString(), amount_paid_inr: 0, promocode: 'ADMIN_GRANT', courses: { id: cid, title: course?.title || cid, slug: '' }, pct: 0 }] } };
      });
    } finally { setGranting(null); }
  };

  const toggleAdmin = async (uid: string, isAdmin: boolean) => {
    // Optimistic update — no re-fetch
    setRows((prev) => prev.map((u) => u.user_id === uid ? { ...u, isAdmin: !isAdmin } : u));
    try {
      if (isAdmin) await supabase.from('user_roles').delete().eq('user_id', uid).eq('role', 'admin');
      else await supabase.from('user_roles').insert({ user_id: uid, role: 'admin' });
      toast.success(isAdmin ? 'Admin removed' : 'Admin granted');
    } catch {
      toast.error('Failed to toggle admin');
      setRows((prev) => prev.map((u) => u.user_id === uid ? { ...u, isAdmin } : u));
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) =>
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading users…</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">Users ({filtered.length})</h1>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email…" className="pl-9" />
        </div>
      </div>
      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">No users found.</p>
        )}
        {filtered.map((u) => (
          <Card key={u.user_id} className="bg-card border-border">
            <div className="p-3 flex items-center gap-3">
              <button onClick={() => toggleExpand(u.user_id)} className="text-muted-foreground hover:text-foreground transition-colors">
                {expanded.has(u.user_id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {u.avatar_url
                ? <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" loading="lazy" />
                : <div className="w-8 h-8 rounded-full bg-secondary shrink-0 flex items-center justify-center text-xs font-bold text-muted-foreground">{(u.display_name || u.email || '?')[0].toUpperCase()}</div>
              }
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{u.display_name || 'unnamed'}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {u.email || '—'}{u.phone ? ` · ${u.phone}` : ''} · L{u.level} · {u.xp} XP · {u.coins.toLocaleString()} coins · {u.current_streak}d streak
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {u.isAdmin ? <Shield className="w-4 h-4 text-primary" /> : <ShieldOff className="w-4 h-4 text-muted-foreground" />}
                <Switch checked={u.isAdmin} onCheckedChange={() => toggleAdmin(u.user_id, u.isAdmin)} />
              </div>
            </div>

            {expanded.has(u.user_id) && (
              loadingDetails.has(u.user_id) ? (
                <div className="border-t border-border p-4 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">Loading details…</span>
                </div>
              ) : details[u.user_id] ? (
                <div className="border-t border-border p-3 space-y-3 bg-background/30">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div><div className="text-muted-foreground">Joined</div><div className="font-semibold">{new Date(u.created_at).toLocaleDateString()}</div></div>
                    <div><div className="text-muted-foreground">Total spent</div><div className="font-semibold">₹{details[u.user_id].totalSpent.toLocaleString()}</div></div>
                    <div><div className="text-muted-foreground">Promocodes</div><div className="font-semibold">{details[u.user_id].redemptions.length}</div></div>
                    <div><div className="text-muted-foreground">Tests taken</div><div className="font-semibold">{details[u.user_id].attempts.length}</div></div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Enrolled courses</h4>
                    {details[u.user_id].enrollments.length === 0
                      ? <p className="text-xs text-muted-foreground">None</p>
                      : details[u.user_id].enrollments.map((e: any) => (
                        <div key={e.id} className="text-xs flex justify-between py-1 border-b border-border/30 gap-2">
                          <span className="truncate">{e.courses.title} <span className="text-muted-foreground">· ₹{(e.amount_paid_inr || 0).toLocaleString()}{e.promocode === 'ADMIN_GRANT' ? ' · Granted' : e.promocode ? ` · ${e.promocode}` : ''}</span></span>
                          <span className="text-primary font-bold shrink-0">{e.pct}%</span>
                        </div>
                      ))
                    }
                    <div className="mt-2 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                      <div className="flex-1 min-w-0">
                        <Select value={grantCourse[u.user_id] || undefined} onValueChange={(v) => setGrantCourse({ ...grantCourse, [u.user_id]: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Grant course access…" /></SelectTrigger>
                          <SelectContent className="bg-card">
                            {allCourses
                              .filter((c) => !details[u.user_id].enrollments.some((e: any) => e.courses?.id === c.id))
                              .map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)
                            }
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="sm" onClick={() => grant(u.user_id)} disabled={!grantCourse[u.user_id] || granting === u.user_id}>
                        <Plus className="w-3 h-3 mr-1" />{granting === u.user_id ? '…' : 'Grant'}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Recent test attempts</h4>
                    {details[u.user_id].attempts.length === 0
                      ? <p className="text-xs text-muted-foreground">None</p>
                      : details[u.user_id].attempts.map((a: any) => {
                        const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
                        return (
                          <div key={a.id} className="text-xs flex justify-between py-1 border-b border-border/30 gap-2">
                            <span className="truncate">{a.tests?.title} <span className="text-muted-foreground">· {a.finished_at ? new Date(a.finished_at).toLocaleDateString() : '—'}</span></span>
                            <span className={`shrink-0 ${a.passed ? 'text-green-500' : 'text-destructive'}`}>{a.score}/{a.total} ({pct}%) {a.passed ? '✓' : '✗'}</span>
                          </div>
                        );
                      })
                    }
                  </div>

                  {details[u.user_id].redemptions.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-1">Promocodes used</h4>
                      {details[u.user_id].redemptions.map((r: any) => (
                        <div key={r.id} className="text-xs flex justify-between py-1 border-b border-border/30">
                          <span><span className="font-mono text-primary">{r.promocodes?.code}</span> · {r.courses?.title}</span>
                          <span className="text-muted-foreground">{new Date(r.redeemed_at).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminUsers;