import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Users, BookOpen, ShoppingCart, Wallet, TrendingUp, Loader2, Crown, CalendarDays, ListChecks, CheckCircle2, XCircle, X } from 'lucide-react';
import { useSEO } from '@/lib/seo';
import { formatPriceINR } from '@/lib/format';
import { format, isToday, isYesterday, startOfDay, endOfDay } from 'date-fns';

// --- STRICT TYPESCRIPT TYPES ---
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
  payload: ActivityPayload;
};

const AdminOverview = () => {
  useSEO({ title: 'Admin Dashboard' });

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ users: 0, courses: 0, enrollments: 0, revenue: 0 });
  const [rawActivities, setRawActivities] = useState<ActivityItem[]>([]);
  const [topCourses, setTopCourses] = useState<{ title: string; count: number }[]>([]);

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [detailPopup, setDetailPopup] = useState<{ open: boolean; item: ActivityItem | null }>({ open: false, item: null });

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [usersRes, coursesRes, ensRes, profilesRes, fnRes, testsRes] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('courses').select('id', { count: 'exact', head: true }),
          supabase.from('enrollments').select('id, enrolled_at, amount_paid_inr, promocode, user_id, courses(title)').order('enrolled_at', { ascending: false }).limit(2000),
          supabase.from('profiles').select('user_id, display_name, avatar_url, phone'),
          supabase.functions.invoke('admin-users'),
          supabase.from('test_attempts').select('id, finished_at, score, total, passed, user_id, tests(title)').order('finished_at', { ascending: false }).limit(2000),
        ]);

        const enrollList = (ensRes.data || []) as any[];
        const actualRevenue = enrollList.filter((e: any) => (e.amount_paid_inr || 0) > 0 && e.promocode !== 'ADMIN_GRANT').reduce((s: number, x: any) => s + (x.amount_paid_inr || 0), 0);

        setStats({
          users: usersRes.count || 0,
          courses: coursesRes.count || 0,
          enrollments: enrollList.length,
          revenue: actualRevenue,
        });

        const pMap: Record<string, any> = {};
        (profilesRes.data || []).forEach((p: any) => { pMap[p.user_id] = p; });
        const eMap: Record<string, string> = {};
        (((fnRes.data as any)?.users) || []).forEach((u: any) => { eMap[u.id] = u.email; });

        const courseMap = new Map<string, { title: string; count: number }>();
        enrollList.forEach((e: any) => {
          if (!e.courses?.title) return;
          const existing = courseMap.get(e.courses.title) || { title: e.courses.title, count: 0 };
          existing.count += 1;
          courseMap.set(e.courses.title, existing);
        });
        setTopCourses([...courseMap.values()].sort((a, b) => b.count - a.count).slice(0, 5));

        const activities: ActivityItem[] = [
          ...enrollList.map((e: any) => ({
            id: `en-${e.id}`,
            date: e.enrolled_at,
            userName: pMap[e.user_id]?.display_name || null,
            userAvatar: pMap[e.user_id]?.avatar_url || null,
            userEmail: eMap[e.user_id] || null,
            payload: { type: 'enrollment' as const, course: e.courses?.title || null, amount: e.amount_paid_inr || 0, promo: e.promocode || null },
          })),
          ...((testsRes.data || []) as any[]).map((t: any) => ({
            id: `test-${t.id}`,
            date: t.finished_at,
            userName: pMap[t.user_id]?.display_name || null,
            userAvatar: pMap[t.user_id]?.avatar_url || null,
            userEmail: eMap[t.user_id] || null,
            payload: { type: 'test' as const, test: t.tests?.title || null, score: t.score || 0, total: t.total || 0, passed: t.passed || false },
          })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setRawActivities(activities);
      } catch (err) {
        console.error("Dashboard load error:", err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  // --- FILTERING & MATH LOGIC (Zero TS Errors) ---
  const filteredActivities = useMemo(() => {
    if (!date) return rawActivities.slice(0, 50);
    const start = startOfDay(date).getTime();
    const end = endOfDay(date).getTime();
    return rawActivities.filter(a => {
      const time = new Date(a.date).getTime();
      return time >= start && time <= end;
    });
  }, [rawActivities, date]);

  const dynamicStats = useMemo(() => {
    if (!date) return stats;
    const start = startOfDay(date).getTime();
    const end = endOfDay(date).getTime();
    
    const dayEns = rawActivities.filter(a => 
      a.payload.type === 'enrollment' && 
      new Date(a.date).getTime() >= start && 
      new Date(a.date).getTime() <= end
    );
    
    // FIX: Explicit cast inside reduce satisfies TS union types perfectly
    const dayRevenue = dayEns.reduce((sum, a) => {
      if (a.payload.type !== 'enrollment') return sum;
      const p = a.payload as EnrollmentPayload; 
      if (p.amount > 0 && p.promo !== 'ADMIN_GRANT') return sum + p.amount;
      return sum;
    }, 0);

    return { ...stats, enrollments: dayEns.length, revenue: dayRevenue };
  }, [stats, rawActivities, date]);

  // FIX: Native TS Type Predicate to filter and map strictly
  const aov = useMemo(() => {
    const paidEns = rawActivities.filter((a): a is ActivityItem & { payload: EnrollmentPayload } => 
      a.payload.type === 'enrollment' && a.payload.amount > 0 && a.payload.promo !== 'ADMIN_GRANT'
    );
    if (paidEns.length === 0) return 0;
    const totalRev = paidEns.reduce((s, a) => s + a.payload.amount, 0);
    return Math.round(totalRev / paidEns.length);
  }, [rawActivities]);

  const avgTestScore = useMemo(() => {
    const tests = rawActivities.filter((a): a is ActivityItem & { payload: TestPayload } => 
      a.payload.type === 'test' && a.payload.total > 0
    );
    if (tests.length === 0) return 0;
    const totalPercentage = tests.reduce((sum, a) => sum + ((a.payload.score / a.payload.total) * 100), 0);
    return Math.round(totalPercentage / tests.length);
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

  const statCards = [
    { icon: Users, label: 'Total Users', value: stats.users.toLocaleString(), color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { icon: BookOpen, label: 'Active Courses', value: stats.courses.toLocaleString(), color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { icon: ShoppingCart, label: date ? 'Day Enrollments' : 'Total Enrollments', value: dynamicStats.enrollments.toLocaleString(), color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { icon: Wallet, label: date ? 'Day Revenue' : 'Actual Revenue', value: formatPriceINR(dynamicStats.revenue), color: 'text-green-500', bg: 'bg-green-500/10' },
    { icon: TrendingUp, label: 'Avg Order Value', value: formatPriceINR(aov), color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
    { icon: Crown, label: 'Avg Test Score', value: `${avgTestScore}%`, color: 'text-pink-500', bg: 'bg-pink-500/10' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center py-20 h-full">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-sm text-muted-foreground">Loading dashboard…</span>
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <Badge variant="secondary" className="bg-green-500/10 text-green-500 border-green-500/20 text-[10px] px-2">LIVE</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Real-time platform growth and user activity.</p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-6 pr-1 pb-10">
        
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {statCards.map(({ icon: Icon, label, value, color, bg }) => (
            <Card key={label} className="p-4 bg-card border-border shadow-sm hover:shadow-md transition-shadow group">
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <div className="text-xl font-bold tracking-tight truncate">{value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <Card className="lg:col-span-2 bg-card border-border shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30 shrink-0 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-sm">
                  <ListChecks className="w-4 h-4 text-primary" />
                  Growth Activity Feed
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">Latest user signups and course purchases.</p>
              </div>
              
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs">
                    <CalendarDays className="w-3.5 h-3.5 mr-1.5" />
                    {date ? format(date, 'MMM d') : 'Pick Date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-card border-border" align="end">
                  <Calendar mode="single" selected={date} onSelect={(d) => { setDate(d); setCalOpen(false); }} className="p-3" />
                  <div className="border-t p-2 flex justify-center">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setDate(undefined); setCalOpen(false); }}>
                      <X className="w-3 h-3 mr-1" /> Clear Filter
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto max-h-[600px] space-y-6">
              {Object.keys(groupedActivities).length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-10 border border-dashed rounded-lg">No activity found for this date.</div>
              ) : (
                Object.entries(groupedActivities).map(([dateKey, items]) => (
                  <div key={dateKey}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-px bg-border flex-1" />
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider bg-muted px-2 py-1 rounded-md">{dateKey}</span>
                      <div className="h-px bg-border flex-1" />
                    </div>
                    
                    <div className="space-y-3 pl-2">
                      {items.map((item) => (
                        <div 
                          key={item.id} 
                          className="flex gap-3 items-start group cursor-pointer hover:bg-muted/20 p-2 -m-2 rounded-lg transition-colors"
                          onClick={() => setDetailPopup({ open: true, item })}
                        >
                          <Avatar className="w-8 h-8 border-2 border-background shadow-sm shrink-0">
                            <AvatarImage src={item.userAvatar || ''} />
                            <AvatarFallback className="text-[10px] bg-muted">{(item.userName || '?')[0].toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 mb-0.5">
                              <span className="text-xs font-semibold truncate">{item.userName || 'Unknown User'}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(item.date), 'h:mm a')}</span>
                            </div>
                            
                            <div className={`text-xs p-2.5 rounded-xl max-w-[90%] shadow-sm border transition-shadow group-hover:shadow-md ${
                              item.payload.type === 'enrollment' ? 'bg-primary/5 border-primary/20' : 
                              item.payload.type === 'test' ? 'bg-blue-500/5 border-blue-500/20' : 'bg-muted/80 border-border'
                            }`}>
                              {item.payload.type === 'enrollment' && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate">Enrolled in <span className="font-semibold text-foreground">{item.payload.course}</span></span>
                                  <span className="font-bold text-primary shrink-0">
                                    {item.payload.promo === 'ADMIN_GRANT' ? <span className="text-muted-foreground font-normal text-[10px]">Granted</span> : 
                                     item.payload.amount > 0 ? formatPriceINR(item.payload.amount) : 
                                     <span className="text-green-500 text-[10px]">FREE</span>}
                                  </span>
                                </div>
                              )}
                              {item.payload.type === 'test' && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate">Took test: <span className="font-semibold text-foreground">{item.payload.test}</span></span>
                                  <span className={`font-bold shrink-0 text-[10px] px-1.5 py-0.5 rounded ${item.payload.passed ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
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
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="bg-card border-border shadow-sm flex flex-col overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30 shrink-0">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <BookOpen className="w-4 h-4 text-primary" />
                Top Courses
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">By total enrollments.</p>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto max-h-[600px]">
              {topCourses.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-10">No enrollments yet.</div>
              ) : (
                <div className="space-y-4">
                  {topCourses.map((course, index) => (
                    <div key={course.title} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                        index === 0 ? 'bg-yellow-500/20 text-yellow-600' : 
                        index === 1 ? 'bg-gray-200 text-gray-600' : 
                        index === 2 ? 'bg-orange-100 text-orange-600' : 
                        'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{course.title}</div>
                        <div className="w-full h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                          <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${topCourses[0] ? (course.count / topCourses[0].count) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold">{course.count}</div>
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

      {/* --- DETAIL POPUP --- */}
      <Dialog open={detailPopup.open} onOpenChange={(v) => setDetailPopup({ ...detailPopup, open: v })}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Avatar className="w-10 h-10 border">
                <AvatarImage src={detailPopup.item?.userAvatar || ''} />
                <AvatarFallback className="bg-muted">{(detailPopup.item?.userName || '?')[0]}</AvatarFallback>
              </Avatar>
              <div className="text-left">
                <div>{detailPopup.item?.userName || 'Unknown User'}</div>
                <DialogDescription className="text-xs font-normal">{detailPopup.item?.userEmail || 'Email hidden'}</DialogDescription>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {detailPopup.item && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center justify-between text-xs border-b pb-2 mb-2">
                <span className="text-muted-foreground">Exact Timestamp</span>
                <span className="font-mono font-medium">
                  {format(new Date(detailPopup.item.date), 'MMM d, yyyy')} at {format(new Date(detailPopup.item.date), 'h:mm:ss a')}
                </span>
              </div>

              <div className={`p-4 rounded-lg border ${
                detailPopup.item.payload.type === 'enrollment' ? 'bg-primary/5 border-primary/20' : 
                detailPopup.item.payload.type === 'test' ? 'bg-blue-500/5 border-blue-500/20' : 'bg-muted/50 border-border'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {detailPopup.item.payload.type === 'enrollment' ? <ShoppingCart className="w-4 h-4 text-primary" /> : <ListChecks className="w-4 h-4 text-blue-500" />}
                  <span className="font-bold text-sm">{detailPopup.item.payload.type === 'enrollment' ? 'Course Enrollment' : 'Test Attempt'}</span>
                </div>

                {detailPopup.item.payload.type === 'enrollment' && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Course</span><span className="font-medium">{detailPopup.item.payload.course}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount Paid</span><span className="font-bold text-primary">{formatPriceINR(detailPopup.item.payload.amount)}</span></div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Payment Type</span>
                      {detailPopup.item.payload.promo === 'ADMIN_GRANT' ? (
                        <Badge variant="secondary" className="bg-muted">Admin Granted</Badge>
                      ) : detailPopup.item.payload.amount > 0 && detailPopup.item.payload.promo ? (
                        <Badge variant="secondary" className="bg-orange-500/10 text-orange-500">Promo: {detailPopup.item.payload.promo}</Badge>
                      ) : detailPopup.item.payload.amount > 0 ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-500">Standard Paid</Badge>
                      ) : (
                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-500">Free Access</Badge>
                      )}
                    </div>
                  </div>
                )}

                {detailPopup.item.payload.type === 'test' && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Test Name</span><span className="font-medium">{detailPopup.item.payload.test}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Score Achieved</span><span className="font-bold">{detailPopup.item.payload.score} / {detailPopup.item.payload.total}</span></div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Result</span>
                      {detailPopup.item.payload.passed ? (
                        <div className="flex items-center gap-1 text-green-500 font-bold"><CheckCircle2 className="w-4 h-4" /> PASSED</div>
                      ) : (
                        <div className="flex items-center gap-1 text-red-500 font-bold"><XCircle className="w-4 h-4" /> FAILED</div>
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