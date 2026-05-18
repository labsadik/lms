import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Shield, ShieldOff, ChevronDown, ChevronRight, Search, Plus, Loader2, Trash2, AlertTriangle, CheckCircle2, Lock, Coins } from 'lucide-react';

const AdminUsers = () => {
  const ADMIN_PASS = import.meta.env.VITE_ADMIN_ASSIGN_PASS;

  const [rows, setRows] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, any>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());
  const [allCourses, setAllCourses] = useState<any[]>([]);
  const [grantCourse, setGrantCourse] = useState<Record<string, string>>({});
  const [granting, setGranting] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Admin Dialog State
  const [adminDialog, setAdminDialog] = useState<{ open: boolean; userId: string | null; currentIsAdmin: boolean }>({ open: false, userId: null, currentIsAdmin: false });
  const [adminPassInput, setAdminPassInput] = useState('');
  const [adminActionLoading, setAdminActionLoading] = useState(false);

  const detailsRef = useRef(details);
  detailsRef.current = details;
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  const load = useCallback(async () => {
    setInitialLoading(true);
    try {
      const [profilesRes, rolesRes, usersRes, coursesRes] = await Promise.all([
        supabase.from('profiles').select('user_id, display_name, avatar_url, phone, bio, xp, coins, level, current_streak, longest_streak, created_at').order('created_at', { ascending: false }).limit(500),
        supabase.from('user_roles').select('user_id, role'),
        supabase.functions.invoke('admin-users'),
        supabase.from('courses').select('id, title').order('title'),
      ]);

      const profiles = profilesRes.data || [];
      const roles = rolesRes.data || [];
      const cs = coursesRes.data || [];

      let authUsers: any[] = [];
      const ud: any = usersRes.data;
      if (ud?.error) toast.error('Auth users: ' + (ud.error.message || 'unknown'), { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      else authUsers = ud?.users || [];

      const adminSet = new Set(roles.filter((r: any) => r.role === 'admin').map((r: any) => r.user_id));
      const emails: Record<string, string> = {};
      authUsers.forEach((u: any) => { emails[u.id] = u.email; });

      const profileIds = new Set(profiles.map((p: any) => p.user_id));
      const merged = [
        ...profiles.map((p: any) => ({ ...p, isAdmin: adminSet.has(p.user_id), email: emails[p.user_id] })),
        ...authUsers.filter((u: any) => !profileIds.has(u.id)).map((u: any) => ({
          user_id: u.id, display_name: null, avatar_url: null, phone: null, bio: null,
          xp: 0, coins: 0, level: 1, current_streak: 0, longest_streak: 0,
          created_at: u.created_at, isAdmin: adminSet.has(u.id), email: u.email,
        })),
      ];

      setRows(merged);
      setAllCourses(cs);
    } catch {
      toast.error('Failed to load users', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
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
      const [ensRes, attemptsRes, redemptionsRes] = await Promise.all([
        supabase.from('enrollments').select('id, enrolled_at, amount_paid_inr, promocode, courses(id, title, slug)').eq('user_id', uid),
        supabase.from('test_attempts').select('id, score, total, passed, finished_at, tests(title)').eq('user_id', uid).order('finished_at', { ascending: false }).limit(20),
        supabase.from('promocode_redemptions').select('id, redeemed_at, promocodes(code), courses(title)').eq('user_id', uid).order('redeemed_at', { ascending: false }),
      ]);

      const enrollments = ensRes.data || [];
      const courseIds = [...new Set(enrollments.map((e: any) => e.courses?.id).filter(Boolean))];

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

      const items = enrollments.map((e: any) => {
        const totalParts = partIdMap[e.courses?.id] || [];
        const doneParts = totalParts.filter((pid) => completedPartIds.has(pid)).length;
        const pct = totalParts.length ? Math.round((doneParts / totalParts.length) * 100) : 0;
        return { ...e, pct, totalParts: totalParts.length, doneParts };
      });

      const totalSpent = items.reduce((s: number, e: any) => s + (e.amount_paid_inr || 0), 0);

      setDetails((prev) => ({
        ...prev,
        [uid]: { enrollments: items, attempts: attemptsRes.data || [], totalSpent, redemptions: redemptionsRes.data || [] },
      }));
    } catch {
      toast.error('Failed to load details', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } finally {
      setLoadingDetails((p) => { const n = new Set(p); n.delete(uid); return n; });
    }
  }, []);

  const grant = async (uid: string) => {
    const cid = grantCourse[uid];
    if (!cid) { toast.error('Pick a course', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); return; }
    setGranting(uid);
    try {
      const { error } = await supabase.from('enrollments').upsert(
        { user_id: uid, course_id: cid, amount_paid_inr: 0, promocode: 'ADMIN_GRANT' },
        { onConflict: 'user_id,course_id' }
      );
      
      if (error) throw error;
      toast.success('Course granted', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
      setGrantCourse((p) => { const n = { ...p }; delete n[uid]; return n; });
      
      const course = allCourses.find((c) => c.id === cid);
      setDetails((prev) => {
        const d = prev[uid];
        if (!d || d.enrollments.some((e: any) => e.courses?.id === cid)) return prev;
        return { 
          ...prev, 
          [uid]: { 
            ...d, 
            enrollments: [...d.enrollments, { 
              id: crypto.randomUUID(), 
              enrolled_at: new Date().toISOString(), 
              amount_paid_inr: 0, 
              promocode: 'ADMIN_GRANT', 
              courses: { id: cid, title: course?.title || cid, slug: '' }, 
              pct: 0, 
              totalParts: 0, 
              doneParts: 0 
            }] 
          } 
        };
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to grant course', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } finally { 
      setGranting(null); 
    }
  };

  const revoke = async (uid: string, enrollmentId: string) => {
    const { error } = await supabase.from('enrollments').delete().eq('id', enrollmentId);
    if (error) { toast.error('Failed to revoke', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); return; }
    toast.success('Course access removed', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
    
    setDetails((prev) => {
      const d = prev[uid];
      if (!d) return prev;
      return { ...prev, [uid]: { ...d, enrollments: d.enrollments.filter((e: any) => e.id !== enrollmentId) } };
    });
  };

  const openAdminDialog = (uid: string, isAdmin: boolean) => {
    setAdminDialog({ open: true, userId: uid, currentIsAdmin: isAdmin });
    setAdminPassInput('');
  };

  const handleAdminAction = async () => {
    if (!adminDialog.userId) return;
    if (adminPassInput !== ADMIN_PASS) {
      toast.error('Incorrect Admin Password', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      return;
    }

    setAdminActionLoading(true);
    const uid = adminDialog.userId;
    const isCurrentlyAdmin = adminDialog.currentIsAdmin;

    setRows((prev) => prev.map((u) => u.user_id === uid ? { ...u, isAdmin: !isCurrentlyAdmin } : u));

    try {
      if (isCurrentlyAdmin) {
        const { error } = await supabase.from('user_roles').delete().eq('user_id', uid).eq('role', 'admin');
        if (error) throw error;
        toast.success('Admin privileges removed', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
      } else {
        const { error } = await supabase.from('user_roles').upsert(
          { user_id: uid, role: 'admin' }, 
          { onConflict: 'user_id,role' }
        );
        if (error) throw error;
        toast.success('User assigned as Admin', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
      }
      setAdminDialog({ open: false, userId: null, currentIsAdmin: false });
    } catch (err: any) {
      toast.error(err.message || 'Action failed', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      setRows((prev) => prev.map((u) => u.user_id === uid ? { ...u, isAdmin: isCurrentlyAdmin } : u));
    } finally {
      setAdminActionLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) =>
      (u.display_name || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.phone || '').toLowerCase().includes(q)
    );
  }, [rows, query]);

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-20 h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading users…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-border bg-background z-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Users ({filtered.length})</h1>
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email, or phone…" className="pl-9 h-10 bg-muted/50" />
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/30">
        <div className="space-y-3 max-w-5xl mx-auto">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
              No users found matching "{query}"
            </div>
          )}

          {filtered.map((u) => (
            <Card key={u.user_id} className="bg-card border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              {/* Main Row */}
              <div className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4">
                <button onClick={() => toggleExpand(u.user_id)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {expanded.has(u.user_id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                
                <div className="w-9 h-9 rounded-full bg-secondary shrink-0 flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    (u.display_name || u.email || '?')[0].toUpperCase()
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate flex items-center gap-2">
                    {u.display_name || 'unnamed'}
                    {u.isAdmin && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">ADMIN</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                    {u.email || '—'} {u.phone ? `· ${u.phone}` : ''} · Lvl {u.level} · {u.xp} XP · <Coins className="w-3 h-3 inline text-yellow-500" />{u.coins.toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button 
                    size="sm" 
                    variant={u.isAdmin ? "destructive" : "default"} 
                    className="h-8 text-xs"
                    onClick={() => openAdminDialog(u.user_id, u.isAdmin)}
                  >
                    {u.isAdmin ? <><ShieldOff className="w-3.5 h-3.5 mr-1" />Revoke</> : <><Shield className="w-3.5 h-3.5 mr-1" />Make Admin</>}
                  </Button>
                </div>
              </div>

              {/* Expanded Details */}
              {expanded.has(u.user_id) && (
                loadingDetails.has(u.user_id) ? (
                  <div className="border-t border-border p-6 flex items-center justify-center bg-muted/20">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-xs text-muted-foreground">Loading full details…</span>
                  </div>
                ) : details[u.user_id] ? (
                  <div className="border-t border-border p-4 sm:p-5 space-y-5 bg-muted/20">
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-background rounded-lg border">
                      <div><div className="text-[11px] text-muted-foreground uppercase tracking-wider">Joined</div><div className="font-bold text-sm mt-0.5">{new Date(u.created_at).toLocaleDateString()}</div></div>
                      <div><div className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Spent</div><div className="font-bold text-sm mt-0.5 text-green-500">₹{details[u.user_id].totalSpent.toLocaleString()}</div></div>
                      <div><div className="text-[11px] text-muted-foreground uppercase tracking-wider">Promocodes</div><div className="font-bold text-sm mt-0.5">{details[u.user_id].redemptions.length}</div></div>
                      <div><div className="text-[11px] text-muted-foreground uppercase tracking-wider">Tests Taken</div><div className="font-bold text-sm mt-0.5">{details[u.user_id].attempts.length}</div></div>
                    </div>

                    {/* Courses */}
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2 tracking-wider">Enrolled Courses</h4>
                      {details[u.user_id].enrollments.length === 0 ? (
                        <p className="text-xs text-muted-foreground bg-background p-3 rounded-md border border-dashed text-center">No courses enrolled</p>
                      ) : (
                        <div className="space-y-2">
                          {details[u.user_id].enrollments.map((e: any) => (
                            <div key={e.id} className="p-2.5 bg-background rounded-md border group">
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <span className="font-medium text-xs truncate block">{e.courses?.title || 'Unknown Course'}</span>
                                  <span className="text-[11px] text-muted-foreground">
                                    ₹{(e.amount_paid_inr || 0).toLocaleString()} 
                                    {e.promocode === 'ADMIN_GRANT' ? <span className="text-primary font-bold ml-1">· Granted</span> : e.promocode ? ` · ${e.promocode}` : ''}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-2 shrink-0">
                                  <div className="text-right">
                                    <span className="text-xs font-bold text-primary">{e.pct}%</span>
                                    <span className="text-[10px] text-muted-foreground block leading-none">({e.doneParts}/{e.totalParts})</span>
                                  </div>
                                  
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => revoke(u.user_id, e.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                              
                              <div className="w-full h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                                <div 
                                  className={`h-full rounded-full transition-all duration-300 ${e.pct === 100 ? 'bg-green-500' : 'bg-primary'}`} 
                                  style={{ width: `${e.pct}%` }} 
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <div className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                        <div className="flex-1 min-w-0">
                          <Select value={grantCourse[u.user_id] || undefined} onValueChange={(v) => setGrantCourse({ ...grantCourse, [u.user_id]: v })}>
                            <SelectTrigger className="h-9 text-xs bg-background"><SelectValue placeholder="Select course to grant access…" /></SelectTrigger>
                            <SelectContent className="bg-card">
                              {allCourses
                                .filter((c) => !details[u.user_id].enrollments.some((e: any) => e.courses?.id === c.id))
                                .map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)
                              }
                            </SelectContent>
                          </Select>
                        </div>
                        <Button size="sm" onClick={() => grant(u.user_id)} disabled={!grantCourse[u.user_id] || granting === u.user_id} className="h-9">
                          <Plus className="w-3.5 h-3.5 mr-1" />{granting === u.user_id ? 'Granting…' : 'Grant Access'}
                        </Button>
                      </div>
                    </div>

                    {/* Tests */}
                    <div>
                      <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2 tracking-wider">Recent Tests</h4>
                      {details[u.user_id].attempts.length === 0 ? (
                        <p className="text-xs text-muted-foreground bg-background p-3 rounded-md border border-dashed text-center">No tests taken</p>
                      ) : (
                        <div className="space-y-1.5">
                          {details[u.user_id].attempts.map((a: any) => {
                            const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
                            return (
                              <div key={a.id} className="text-xs flex items-center justify-between p-2 bg-background rounded-md border">
                                <span className="truncate font-medium">{a.tests?.title} <span className="text-muted-foreground font-normal">· {a.finished_at ? new Date(a.finished_at).toLocaleDateString() : '—'}</span></span>
                                <span className={`shrink-0 ml-2 font-bold ${a.passed ? 'text-green-500' : 'text-destructive'}`}>{a.score}/{a.total} ({pct}%) {a.passed ? '✓' : '✗'}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null
              )}
            </Card>
          ))}
          <div className="h-6" />
        </div>
      </div>

      {/* --- ADMIN ASSIGN DIALOG --- */}
      <Dialog open={adminDialog.open} onOpenChange={(v) => setAdminDialog({ ...adminDialog, open: v })}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-destructive" />
              {adminDialog.currentIsAdmin ? 'Revoke Admin Access' : 'Assign Admin Role'}
            </DialogTitle>
            <DialogDescription>This action requires the secure admin password to proceed.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label>Admin Password</Label>
            <Input 
              type="password" 
              value={adminPassInput} 
              onChange={(e) => setAdminPassInput(e.target.value)}
              placeholder="Enter VITE_ADMIN_ASSIGN_PASS"
              className="mt-1.5 h-11"
              onKeyDown={(e) => e.key === 'Enter' && handleAdminAction()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdminDialog({ open: false, userId: null, currentIsAdmin: false })}>Cancel</Button>
            <Button variant={adminDialog.currentIsAdmin ? "destructive" : "default"} onClick={handleAdminAction} disabled={adminActionLoading || !adminPassInput}>
              {adminActionLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {adminDialog.currentIsAdmin ? 'Confirm Revoke' : 'Confirm Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsers;