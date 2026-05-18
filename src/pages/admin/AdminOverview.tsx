import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  Users, BookOpen, ShoppingCart, Wallet, TrendingUp, Loader2, Crown,
  CalendarDays, ListChecks, CheckCircle2, XCircle, X, RefreshCw,
  Phone, Mail, Trophy, Medal
} from 'lucide-react';
import { useSEO } from '@/lib/seo';
import { formatPriceINR } from '@/lib/format';
import { format, isToday, isYesterday, startOfDay, endOfDay } from 'date-fns';

// ──────────────────────────── STRICT TYPES ────────────────────────────
type EnrollmentPayload = { type: 'enrollment'; course: string | null; amount: number; promo: string | null };
type TestPayload = { type: 'test'; test: string | null; score: number; total: number; passed: boolean };
type SignupPayload = { type: 'signup' };
type ActivityPayload = EnrollmentPayload | TestPayload | SignupPayload;

type ActivityItem = {
  id: string;
  date: string;
  userName: string | null;
  userAvatar: string | null;
  userEmail: string | null;
  userPhone: string | null;
  payload: ActivityPayload;
};

type CourseRanked = {
  id: string;
  title: string;
  count: number;
};

// ──────────────────────────── HELPERS ─────────────────────────────────
const formatPhone = (phone: string | null): string | null => {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return phone;
};

// ──────────────────────────── COMPONENT ───────────────────────────────
const AdminOverview = () => {
  useSEO({ title: 'Admin Dashboard' });

  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [timeAgo, setTimeAgo] = useState('');

  const [stats, setStats] = useState({ users: 0, courses: 0, enrollments: 0, revenue: 0 });
  const [rawActivities, setRawActivities] = useState<ActivityItem[]>([]);
  const [allCoursesRanked, setAllCoursesRanked] = useState<CourseRanked[]>([]);

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [detailPopup, setDetailPopup] = useState<{ open: boolean; item: ActivityItem | null }>({ open: false, item: null });

  // Stable ref so subscriptions never go stale
  const loadRef = useRef<() => void>();

  // ──────────── DATA FETCHER ────────────
  const loadDashboard = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setIsRefreshing(true);

    try {
      const [
        usersRes,
        coursesRes,
        ensRes,
        profilesRes,
        fnRes,
        testsRes,
        allCoursesRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('courses').select('id', { count: 'exact', head: true }),
        supabase
          .from('enrollments')
          .select('id, enrolled_at, amount_paid_inr, promocode, user_id, courses(id, title)')
          .order('enrolled_at', { ascending: false })
          .limit(5000),
        supabase.from('profiles').select('user_id, display_name, avatar_url, phone'),
        supabase.functions.invoke('admin-users'),
        supabase
          .from('test_attempts')
          .select('id, finished_at, score, total, passed, user_id, tests(title)')
          .order('finished_at', { ascending: false })
          .limit(5000),
        supabase.from('courses').select('id, title').order('title'),
      ]);

      const enrollList = (ensRes.data || []) as any[];
      const actualRevenue = enrollList
        .filter((e: any) => (e.amount_paid_inr || 0) > 0 && e.promocode !== 'ADMIN_GRANT')
        .reduce((s: number, x: any) => s + (x.amount_paid_inr || 0), 0);

      setStats({
        users: usersRes.count || 0,
        courses: coursesRes.count || 0,
        enrollments: enrollList.length,
        revenue: actualRevenue,
      });

      // Profile & email maps
      const pMap: Record<string, any> = {};
      (profilesRes.data || []).forEach((p: any) => { pMap[p.user_id] = p; });
      const eMap: Record<string, string> = {};
      (((fnRes.data as any)?.users) || []).forEach((u: any) => { eMap[u.id] = u.email; });

      // ── All courses ranked by enrollment count ──
      const courseCountMap = new Map<string, number>();
      enrollList.forEach((e: any) => {
        const cid = e.courses?.id;
        if (!cid) return;
        courseCountMap.set(cid, (courseCountMap.get(cid) || 0) + 1);
      });

      const ranked: CourseRanked[] = ((allCoursesRes.data || []) as any[])
        .map((c: any) => ({
          id: c.id,
          title: c.title,
          count: courseCountMap.get(c.id) || 0,
        }))
        .sort((a, b) => b.count - a.count);
      setAllCoursesRanked(ranked);

      // ── Activity items with full user info ──
      const activities: ActivityItem[] = [
        ...enrollList.map((e: any) => ({
          id: `en-${e.id}`,
          date: e.enrolled_at,
          userName: pMap[e.user_id]?.display_name || null,
          userAvatar: pMap[e.user_id]?.avatar_url || null,
          userEmail: eMap[e.user_id] || null,
          userPhone: formatPhone(pMap[e.user_id]?.phone || null),
          payload: {
            type: 'enrollment' as const,
            course: e.courses?.title || null,
            amount: e.amount_paid_inr || 0,
            promo: e.promocode || null,
          },
        })),
        ...((testsRes.data || []) as any[]).map((t: any) => ({
          id: `test-${t.id}`,
          date: t.finished_at,
          userName: pMap[t.user_id]?.display_name || null,
          userAvatar: pMap[t.user_id]?.avatar_url || null,
          userEmail: eMap[t.user_id] || null,
          userPhone: formatPhone(pMap[t.user_id]?.phone || null),
          payload: {
            type: 'test' as const,
            test: t.tests?.title || null,
            score: t.score || 0,
            total: t.total || 0,
            passed: t.passed || false,
          },
        })),
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setRawActivities(activities);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  loadRef.current = loadDashboard;

  // ──────────── INITIAL LOAD + REAL-TIME + AUTO-REFRESH ────────────
  useEffect(() => {
    loadDashboard(true);

    // Fallback: auto-refresh every 30s
    const interval = setInterval(() => {
      loadRef.current?.();
    }, 30000);

    // Supabase real-time: instant on new inserts
    const channel = supabase
      .channel('admin-dashboard-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'enrollments' },
        () => loadRef.current?.(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'test_attempts' },
        () => loadRef.current?.(),
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  // ──────────── "Updated X ago" TICKER ────────────
  useEffect(() => {
    const tick = setInterval(() => {
      if (!lastRefreshed) { setTimeAgo(''); return; }
      const s = Math.floor((Date.now() - lastRefreshed.getTime()) / 1000);
      if (s < 5) setTimeAgo('just now');
      else if (s < 60) setTimeAgo(`${s}s ago`);
      else if (s < 3600) setTimeAgo(`${Math.floor(s / 60)}m ago`);
      else setTimeAgo(`${Math.floor(s / 3600)}h ago`);
    }, 1000);
    return () => clearInterval(tick);
  }, [lastRefreshed]);

  // ──────────── FILTERING & MATH ────────────
  const filteredActivities = useMemo(() => {
    if (!date) return rawActivities.slice(0, 50);
    const start = startOfDay(date).getTime();
    const end = endOfDay(date).getTime();
    return rawActivities.filter(a => {
      const t = new Date(a.date).getTime();
      return t >= start && t <= end;
    });
  }, [rawActivities, date]);

  const dynamicStats = useMemo(() => {
    if (!date) return stats;
    const start = startOfDay(date).getTime();
    const end = endOfDay(date).getTime();
    const dayEns = rawActivities.filter(
      a => a.payload.type === 'enrollment' && new Date(a.date).getTime() >= start && new Date(a.date).getTime() <= end,
    );
    const dayRevenue = dayEns.reduce((sum, a) => {
      if (a.payload.type !== 'enrollment') return sum;
      const p = a.payload as EnrollmentPayload;
      if (p.amount > 0 && p.promo !== 'ADMIN_GRANT') return sum + p.amount;
      return sum;
    }, 0);
    return { ...stats, enrollments: dayEns.length, revenue: dayRevenue };
  }, [stats, rawActivities, date]);

  const aov = useMemo(() => {
    const paid = rawActivities.filter(
      (a): a is ActivityItem & { payload: EnrollmentPayload } =>
        a.payload.type === 'enrollment' && a.payload.amount > 0 && a.payload.promo !== 'ADMIN_GRANT',
    );
    if (paid.length === 0) return 0;
    return Math.round(paid.reduce((s, a) => s + a.payload.amount, 0) / paid.length);
  }, [rawActivities]);

  const avgTestScore = useMemo(() => {
    const tests = rawActivities.filter(
      (a): a is ActivityItem & { payload: TestPayload } =>
        a.payload.type === 'test' && a.payload.total > 0,
    );
    if (tests.length === 0) return 0;
    return Math.round(
      tests.reduce((sum, a) => sum + ((a.payload.score / a.payload.total) * 100), 0) / tests.length,
    );
  }, [rawActivities]);

  const groupedActivities = useMemo(() => {
    const groups: Record<string, ActivityItem[]> = {};
    filteredActivities.forEach(a => {
      const d = new Date(a.date);
      const key = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMM d, yyyy');
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return groups;
  }, [filteredActivities]);

  const maxCourseCount = allCoursesRanked.length > 0 ? Math.max(allCoursesRanked[0].count, 1) : 1;

  // ──────────── STAT CARDS ────────────
  const statCards = [
    { icon: Users, label: 'Total Users', value: stats.users.toLocaleString(), color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { icon: BookOpen, label: 'Active Courses', value: stats.courses.toLocaleString(), color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { icon: ShoppingCart, label: date ? 'Day Enrollments' : 'Total Enrollments', value: dynamicStats.enrollments.toLocaleString(), color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { icon: Wallet, label: date ? 'Day Revenue' : 'Actual Revenue', value: formatPriceINR(dynamicStats.revenue), color: 'text-green-500', bg: 'bg-green-500/10' },
    { icon: TrendingUp, label: 'Avg Order Value', value: formatPriceINR(aov), color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { icon: Crown, label: 'Avg Test Score', value: `${avgTestScore}%`, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  ];

  // ──────────── RANK BADGE RENDERER ────────────
  const renderRank = (i: number) => {
    if (i === 0)
      return (
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-yellow-500/15 text-yellow-500 shadow-sm shadow-yellow-500/10 ring-1 ring-yellow-500/20">
          <Trophy className="w-4 h-4" />
        </div>
      );
    if (i === 1)
      return (
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-300 ring-1 ring-gray-300 dark:ring-gray-600">
          <Medal className="w-4 h-4" />
        </div>
      );
    if (i === 2)
      return (
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-orange-100 dark:bg-orange-900/30 text-orange-500 ring-1 ring-orange-300 dark:ring-orange-700">
          <Medal className="w-4 h-4" />
        </div>
      );
    return (
      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-muted text-muted-foreground text-xs font-bold">
        {i + 1}
      </div>
    );
  };

  const barColor = (i: number) =>
    i === 0
      ? 'bg-yellow-500'
      : i === 1
        ? 'bg-gray-400 dark:bg-gray-500'
        : i === 2
          ? 'bg-orange-400'
          : 'bg-primary/50';

  // ──────────── LOADING ────────────
  if (loading)
    return (
      <div className="flex items-center justify-center py-20 h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading dashboard…</span>
      </div>
    );

  // ──────────── RENDER ────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── HEADER ── */}
      <div className="shrink-0 mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <Badge
              variant="secondary"
              className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] px-2 py-0.5"
            >
              <span className="relative flex h-2 w-2 mr-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              LIVE
            </Badge>
          </div>

          <div className="flex items-center gap-3">
            {timeAgo && (
              <span className="text-[11px] text-muted-foreground hidden sm:inline-flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-muted-foreground/40" />
                Updated {timeAgo}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => loadRef.current?.()}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-3.5 h-3.5 transition-transform ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Syncing…' : 'Refresh'}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Real-time platform growth and user activity.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-1 pb-10">
        {/* ── STAT CARDS ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {statCards.map(({ icon: Icon, label, value, color, bg }) => (
            <Card
              key={label}
              className="p-4 bg-card border-border shadow-sm hover:shadow-md transition-shadow group"
            >
              <div
                className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}
              >
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="text-xl font-bold tracking-tight truncate">{value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ════════════ ACTIVITY FEED ════════════ */}
          <Card className="lg:col-span-2 bg-card border-border shadow-sm flex flex-col overflow-hidden">
            {/* Feed header */}
            <div className="p-4 border-b border-border bg-muted/30 shrink-0 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <ListChecks className="w-4 h-4 text-primary" />
                  Growth Activity Feed
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Latest enrollments &amp; test attempts with user details.
                </p>
              </div>

              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                    {date ? format(date, 'MMM d') : 'Pick Date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-border" align="end">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={d => {
                      setDate(d);
                      setCalOpen(false);
                    }}
                    className="p-3"
                  />
                  <div className="border-t p-2 flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setDate(undefined);
                        setCalOpen(false);
                      }}
                    >
                      <X className="w-3 h-3 mr-1" /> Clear Filter
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Feed list */}
            <div className="flex-1 p-4 overflow-y-auto max-h-[600px] space-y-6">
              {Object.keys(groupedActivities).length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-10 border border-dashed rounded-lg">
                  No activity found for this date.
                </div>
              ) : (
                Object.entries(groupedActivities).map(([dateKey, items]) => (
                  <div key={dateKey}>
                    {/* Date separator */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px bg-border flex-1" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted px-2 py-1 rounded-md">
                        {dateKey}
                      </span>
                      <div className="h-px bg-border flex-1" />
                    </div>

                    <div className="space-y-3 pl-2">
                      {items.map(item => {
                        const contactParts = [item.userEmail, item.userPhone].filter(Boolean);
                        return (
                          <div
                            key={item.id}
                            className="flex gap-3 items-start group cursor-pointer hover:bg-muted/20 p-2.5 -m-2.5 rounded-xl transition-colors"
                            onClick={() => setDetailPopup({ open: true, item })}
                          >
                            {/* Avatar */}
                            <Avatar className="w-9 h-9 border-2 border-background shadow-sm shrink-0">
                              <AvatarImage src={item.userAvatar || ''} />
                              <AvatarFallback className="text-[10px] bg-muted font-semibold">
                                {(item.userName || '?')[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>

                            <div className="flex-1 min-w-0">
                              {/* Name + time */}
                              <div className="flex items-baseline gap-2">
                                <span className="text-xs font-semibold truncate">
                                  {item.userName || 'Unknown User'}
                                </span>
                                <span className="text-[10px] text-muted-foreground shrink-0">
                                  {format(new Date(item.date), 'h:mm a')}
                                </span>
                              </div>

                              {/* Email + Phone */}
                              {contactParts.length > 0 && (
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                                  {item.userEmail && (
                                    <span className="inline-flex items-center gap-1 truncate max-w-[200px]">
                                      <Mail className="w-2.5 h-2.5 shrink-0 opacity-50" />
                                      <span className="truncate">{item.userEmail}</span>
                                    </span>
                                  )}
                                  {item.userEmail && item.userPhone && (
                                    <span className="text-muted-foreground/30">·</span>
                                  )}
                                  {item.userPhone && (
                                    <span className="inline-flex items-center gap-1 shrink-0">
                                      <Phone className="w-2.5 h-2.5 shrink-0 opacity-50" />
                                      <span>{item.userPhone}</span>
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Activity bubble */}
                              <div
                                className={`text-xs p-2.5 rounded-xl max-w-[95%] shadow-sm border mt-1.5 transition-shadow group-hover:shadow-md ${
                                  item.payload.type === 'enrollment'
                                    ? 'bg-primary/5 border-primary/20'
                                    : item.payload.type === 'test'
                                      ? 'bg-blue-500/5 border-blue-500/20'
                                      : 'bg-muted/80 border-border'
                                }`}
                              >
                                {item.payload.type === 'enrollment' && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate">
                                      Enrolled in{' '}
                                      <span className="font-semibold text-foreground">
                                        {item.payload.course}
                                      </span>
                                    </span>
                                    <span className="font-bold text-primary shrink-0">
                                      {item.payload.promo === 'ADMIN_GRANT' ? (
                                        <span className="text-muted-foreground font-normal text-[10px]">
                                          Granted
                                        </span>
                                      ) : item.payload.amount > 0 ? (
                                        formatPriceINR(item.payload.amount)
                                      ) : (
                                        <span className="text-green-500 text-[10px]">FREE</span>
                                      )}
                                    </span>
                                  </div>
                                )}
                                {item.payload.type === 'test' && (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="truncate">
                                      Took test:{' '}
                                      <span className="font-semibold text-foreground">
                                        {item.payload.test}
                                      </span>
                                    </span>
                                    <span
                                      className={`font-bold shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                                        item.payload.passed
                                          ? 'bg-green-500/10 text-green-500'
                                          : 'bg-red-500/10 text-red-500'
                                      }`}
                                    >
                                      {item.payload.score}/{item.payload.total}
                                    </span>
                                  </div>
                                )}
                                {item.payload.type === 'signup' && (
                                  <span className="text-muted-foreground">Created an account 🎉</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* ════════════ ALL COURSES RANKED ════════════ */}
          <Card className="bg-card border-border shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30 shrink-0">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <BookOpen className="w-4 h-4 text-primary" />
                    All Courses Ranked
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Real-time student enrollment position.
                  </p>
                </div>
                <Badge variant="secondary" className="text-[10px] px-1.5">
                  {allCoursesRanked.length}
                </Badge>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto max-h-[600px]">
              {allCoursesRanked.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-10">
                  No courses found.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {allCoursesRanked.map((course, i) => (
                    <div
                      key={course.id}
                      className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                        i < 3
                          ? i === 0
                            ? 'bg-yellow-500/5 ring-1 ring-yellow-500/10'
                            : i === 1
                              ? 'bg-gray-100 dark:bg-gray-800/50 ring-1 ring-gray-200 dark:ring-gray-700'
                              : 'bg-orange-500/5 ring-1 ring-orange-500/10'
                          : 'hover:bg-muted/40'
                      }`}
                    >
                      {renderRank(i)}

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{course.title}</div>
                        <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-out ${barColor(i)}`}
                            style={{
                              width: `${(course.count / maxCourseCount) * 100}%`,
                            }}
                          />
                        </div>
                      </div>

                      <div className="text-right shrink-0 min-w-[44px]">
                        <div className="text-sm font-bold tabular-nums">{course.count}</div>
                        <div className="text-[10px] text-muted-foreground">students</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* ════════════ DETAIL POPUP ════════════ */}
      <Dialog
        open={detailPopup.open}
        onOpenChange={v => setDetailPopup({ ...detailPopup, open: v })}
      >
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="w-10 h-10 border">
                <AvatarImage src={detailPopup.item?.userAvatar || ''} />
                <AvatarFallback className="bg-muted">
                  {(detailPopup.item?.userName || '?')[0]}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div>{detailPopup.item?.userName || 'Unknown User'}</div>
                <DialogDescription className="text-xs font-normal">
                  {detailPopup.item?.userEmail || 'Email hidden'}
                </DialogDescription>
              </div>
            </DialogTitle>
          </DialogHeader>

          {detailPopup.item && (
            <div className="space-y-4 mt-2">
              {/* Contact cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {detailPopup.item.userEmail && (
                  <div className="flex items-center gap-2.5 text-xs border rounded-lg p-2.5 bg-muted/20">
                    <div className="w-7 h-7 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                      <Mail className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <span className="truncate">{detailPopup.item.userEmail}</span>
                  </div>
                )}
                {detailPopup.item.userPhone && (
                  <div className="flex items-center gap-2.5 text-xs border rounded-lg p-2.5 bg-muted/20">
                    <div className="w-7 h-7 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
                      <Phone className="w-3.5 h-3.5 text-green-500" />
                    </div>
                    <span className="truncate">{detailPopup.item.userPhone}</span>
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <div className="flex items-center justify-between text-xs border-b pb-2 mb-2">
                <span className="text-muted-foreground">Exact Timestamp</span>
                <span className="font-mono font-medium">
                  {format(new Date(detailPopup.item.date), 'MMM d, yyyy')} at{' '}
                  {format(new Date(detailPopup.item.date), 'h:mm:ss a')}
                </span>
              </div>

              {/* Activity details */}
              <div
                className={`p-4 rounded-xl border ${
                  detailPopup.item.payload.type === 'enrollment'
                    ? 'bg-primary/5 border-primary/20'
                    : detailPopup.item.payload.type === 'test'
                      ? 'bg-blue-500/5 border-blue-500/20'
                      : 'bg-muted/50 border-border'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  {detailPopup.item.payload.type === 'enrollment' ? (
                    <ShoppingCart className="w-4 h-4 text-primary" />
                  ) : (
                    <ListChecks className="w-4 h-4 text-blue-500" />
                  )}
                  <span className="font-bold text-sm">
                    {detailPopup.item.payload.type === 'enrollment'
                      ? 'Course Enrollment'
                      : 'Test Attempt'}
                  </span>
                </div>

                {detailPopup.item.payload.type === 'enrollment' && (
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Course</span>
                      <span className="font-medium text-right max-w-[60%] truncate">
                        {detailPopup.item.payload.course}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount Paid</span>
                      <span className="font-bold text-primary">
                        {formatPriceINR(detailPopup.item.payload.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Payment Type</span>
                      {detailPopup.item.payload.promo === 'ADMIN_GRANT' ? (
                        <Badge variant="secondary" className="bg-muted">
                          Admin Granted
                        </Badge>
                      ) : detailPopup.item.payload.amount > 0 &&
                        detailPopup.item.payload.promo ? (
                        <Badge
                          variant="secondary"
                          className="bg-orange-500/10 text-orange-500"
                        >
                          Promo: {detailPopup.item.payload.promo}
                        </Badge>
                      ) : detailPopup.item.payload.amount > 0 ? (
                        <Badge
                          variant="secondary"
                          className="bg-green-500/10 text-green-500"
                        >
                          Standard Paid
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-blue-500/10 text-blue-500"
                        >
                          Free Access
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {detailPopup.item.payload.type === 'test' && (
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Test Name</span>
                      <span className="font-medium text-right max-w-[60%] truncate">
                        {detailPopup.item.payload.test}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Score Achieved</span>
                      <span className="font-bold">
                        {detailPopup.item.payload.score} / {detailPopup.item.payload.total}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Result</span>
                      {detailPopup.item.payload.passed ? (
                        <div className="flex items-center gap-1 text-green-500 font-bold">
                          <CheckCircle2 className="w-4 h-4" /> PASSED
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-red-500 font-bold">
                          <XCircle className="w-4 h-4" /> FAILED
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOverview;