import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Wallet, ShoppingCart, Tag, Search, Loader2, CalendarDays, X } from 'lucide-react';
import { useSEO } from '@/lib/seo';
import { formatPriceINR } from '@/lib/format';
import { toast } from 'sonner';

type Enrollment = {
  id: string;
  user_id: string;
  amount_paid_inr: number;
  promocode: string | null;
  enrolled_at: string;
  course_id: string;
  courses: { title: string } | null;
};

type DateMode = 'all' | 'year' | 'month' | 'day';
type DateFilter = { mode: DateMode; year: number; month: number; day: number };

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const AdminRevenue = () => {
  useSEO({ title: 'Admin Revenue' });
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [phones, setPhones] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [df, setDf] = useState<DateFilter>({ mode: 'all', year: new Date().getFullYear(), month: new Date().getMonth() + 1, day: new Date().getDate() });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ensRes, profilesRes, fnRes] = await Promise.all([
        supabase.from('enrollments').select('id, user_id, amount_paid_inr, promocode, enrolled_at, course_id, courses(title)').order('enrolled_at', { ascending: false }),
        supabase.from('profiles').select('user_id, display_name, phone'),
        supabase.functions.invoke('admin-users'),
      ]);
      setRows((ensRes.data || []) as Enrollment[]);
      const nm: Record<string, string> = {};
      const ph: Record<string, string> = {};
      (profilesRes.data || []).forEach((p: any) => { nm[p.user_id] = p.display_name || ''; if (p.phone) ph[p.user_id] = p.phone; });
      setNames(nm);
      setPhones(ph);
      const em: Record<string, string> = {};
      (((fnRes.data as any)?.users) || []).forEach((u: any) => { em[u.id] = u.email; });
      setEmails(em);
    } catch { toast.error('Failed to load revenue'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const availableYears = useMemo(() => {
    const s = new Set<number>();
    rows.forEach(r => s.add(new Date(r.enrolled_at).getFullYear()));
    if (s.size === 0) s.add(new Date().getFullYear());
    return [...s].sort((a, b) => b - a);
  }, [rows]);

  const maxDays = useMemo(() => new Date(df.year, df.month, 0).getDate(), [df.year, df.month]);

  const setMode = useCallback((mode: DateMode) => {
    setDf(p => {
      const clamped = { ...p, mode, day: Math.min(p.day, new Date(p.year, p.month, 0).getDate()) };
      return clamped;
    });
  }, []);

  const setYear = useCallback((y: number) => setDf(p => ({ ...p, year: y, day: Math.min(p.day, new Date(y, p.month, 0).getDate()) })), []);
  const setMonth = useCallback((m: number) => setDf(p => ({ ...p, month: m, day: Math.min(p.day, new Date(p.year, m, 0).getDate()) })), []);
  const setDay = useCallback((d: number) => setDf(p => ({ ...p, day: d })), []);
  const clearFilter = useCallback(() => setDf(p => ({ ...p, mode: 'all' })), []);

  const filterLabel = useMemo(() => {
    if (df.mode === 'all') return null;
    if (df.mode === 'year') return `Showing: ${df.year}`;
    if (df.mode === 'month') return `Showing: ${MONTH_SHORT[df.month - 1]} ${df.year}`;
    return `Showing: ${df.day} ${MONTH_SHORT[df.month - 1]} ${df.year}`;
  }, [df]);

  const dateFiltered = useMemo(() => {
    if (df.mode === 'all') return rows;
    return rows.filter(r => {
      const d = new Date(r.enrolled_at);
      if (df.mode === 'year') return d.getFullYear() === df.year;
      if (df.mode === 'month') return d.getFullYear() === df.year && d.getMonth() + 1 === df.month;
      return d.getFullYear() === df.year && d.getMonth() + 1 === df.month && d.getDate() === df.day;
    });
  }, [rows, df]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dateFiltered;
    return dateFiltered.filter(r => {
      const hay = `${names[r.user_id] || ''} ${emails[r.user_id] || ''} ${phones[r.user_id] || ''} ${r.courses?.title || ''} ${r.promocode || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [dateFiltered, search, names, emails, phones]);

  const totals = useMemo(() => {
    const total = dateFiltered.reduce((s, r) => s + (r.amount_paid_inr || 0), 0);
    const paid = dateFiltered.filter(r => (r.amount_paid_inr || 0) > 0).length;
    return { total, paid, free: dateFiltered.length - paid, count: dateFiltered.length };
  }, [dateFiltered]);

  const byCourse = useMemo(() => {
    const m = new Map<string, { title: string; revenue: number; count: number }>();
    for (const r of dateFiltered) {
      const e = m.get(r.course_id) || { title: r.courses?.title || '—', revenue: 0, count: 0 };
      e.revenue += r.amount_paid_inr || 0;
      e.count += 1;
      m.set(r.course_id, e);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue);
  }, [dateFiltered]);

  const bucket = useCallback((data: Enrollment[], fmt: (d: Date) => string) => {
    const m = new Map<string, { revenue: number; count: number }>();
    for (const r of data) {
      const k = fmt(new Date(r.enrolled_at));
      const e = m.get(k) || { revenue: 0, count: 0 };
      e.revenue += r.amount_paid_inr || 0;
      e.count += 1;
      m.set(k, e);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => a.key < b.key ? 1 : -1);
  }, []);

  const byYear = useMemo(() => bucket(dateFiltered, d => String(d.getFullYear())), [bucket, dateFiltered]);
  const byMonth = useMemo(() => bucket(dateFiltered, d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`), [bucket, dateFiltered]);
  const byDay = useMemo(() => bucket(dateFiltered, d => d.toISOString().slice(0, 10)), [bucket, dateFiltered]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading revenue…</span></div>;

  const BucketCard = ({ label, data }: { label: string; data: { key: string; revenue: number; count: number }[] }) => (
    <Card className="p-3 bg-card border-border">
      {data.length === 0 ? <p className="text-xs text-muted-foreground">No data</p> : (
        <div className="text-sm divide-y divide-border">
          <div className="grid grid-cols-3 gap-2 py-2 font-bold text-xs uppercase text-muted-foreground">
            <span>{label}</span><span className="text-right">Enrollments</span><span className="text-right">Revenue</span>
          </div>
          {data.map(b => (
            <div key={b.key} className="grid grid-cols-3 gap-2 py-2">
              <span className="font-mono">{b.key}</span>
              <span className="text-right">{b.count}</span>
              <span className="text-right font-bold text-primary">{formatPriceINR(b.revenue)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const modeBtn = (m: DateMode, label: string) => (
    <Button size="sm" variant={df.mode === m ? 'default' : 'outline'} className="h-7 text-xs px-2.5" onClick={() => setMode(m)}>{label}</Button>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Revenue</h1>

      {/* Calendar filter bar */}
      <Card className="p-3 bg-card border-border mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary shrink-0" />
          {modeBtn('all', 'All')}
          {modeBtn('year', 'Year')}
          {modeBtn('month', 'Month')}
          {modeBtn('day', 'Day')}

          {df.mode !== 'all' && (
            <>
              <div className="w-px h-5 bg-border mx-1" />
              <Select value={String(df.year)} onValueChange={v => setYear(Number(v))}>
                <SelectTrigger className="h-7 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card">{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>

              {(df.mode === 'month' || df.mode === 'day') && (
                <Select value={String(df.month)} onValueChange={v => setMonth(Number(v))}>
                  <SelectTrigger className="h-7 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card">{MONTH_NAMES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
                </Select>
              )}

              {df.mode === 'day' && (
                <Select value={String(df.day)} onValueChange={v => setDay(Number(v))}>
                  <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card max-h-52">{Array.from({ length: maxDays }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
                </Select>
              )}

              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={clearFilter}><X className="w-3.5 h-3.5" /></Button>
            </>
          )}

          {filterLabel && (
            <span className="text-xs font-semibold text-primary ml-auto">{filterLabel}</span>
          )}
        </div>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card className="p-4 bg-card border-border">
          <Wallet className="w-5 h-5 text-primary mb-2" />
          <div className="text-2xl font-bold">{formatPriceINR(totals.total)}</div>
          <div className="text-xs text-muted-foreground">Total revenue</div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <ShoppingCart className="w-5 h-5 text-primary mb-2" />
          <div className="text-2xl font-bold">{totals.count}</div>
          <div className="text-xs text-muted-foreground">All enrollments</div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <Tag className="w-5 h-5 text-primary mb-2" />
          <div className="text-2xl font-bold">{totals.paid}</div>
          <div className="text-xs text-muted-foreground">Paid enrollments</div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <Tag className="w-5 h-5 text-muted-foreground mb-2" />
          <div className="text-2xl font-bold">{totals.free}</div>
          <div className="text-xs text-muted-foreground">Free / promo</div>
        </Card>
      </div>

      {/* Breakdown tabs */}
      <Tabs defaultValue="course" className="mb-6">
        <TabsList>
          <TabsTrigger value="course">By course</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="day">Day</TabsTrigger>
        </TabsList>
        <TabsContent value="course">
          <Card className="p-3 bg-card border-border">
            {byCourse.length === 0 ? <p className="text-xs text-muted-foreground">No data</p> : (
              <div className="text-sm divide-y divide-border">
                <div className="grid grid-cols-3 gap-2 py-2 font-bold text-xs uppercase text-muted-foreground">
                  <span>Course</span><span className="text-right">Enrollments</span><span className="text-right">Revenue</span>
                </div>
                {byCourse.map((c, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 py-2">
                    <span className="truncate">{c.title}</span>
                    <span className="text-right">{c.count}</span>
                    <span className="text-right font-bold text-primary">{formatPriceINR(c.revenue)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="year"><BucketCard label="Year" data={byYear} /></TabsContent>
        <TabsContent value="month"><BucketCard label="Month" data={byMonth} /></TabsContent>
        <TabsContent value="day"><BucketCard label="Day" data={byDay} /></TabsContent>
      </Tabs>

      {/* Enrollments table */}
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h2 className="font-bold">Enrollments ({filteredRows.length})</h2>
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone, course…" className="pl-9" />
        </div>
      </div>
      <Card className="bg-card border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground border-b border-border">
            <tr>
              <th className="text-left p-2">Date</th>
              <th className="text-left p-2">User</th>
              <th className="text-left p-2">Email</th>
              <th className="text-left p-2">Phone</th>
              <th className="text-left p-2">Course</th>
              <th className="text-left p-2">Promo</th>
              <th className="text-right p-2">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredRows.map(r => (
              <tr key={r.id} className="hover:bg-background/50 transition-colors">
                <td className="p-2 whitespace-nowrap">{new Date(r.enrolled_at).toLocaleDateString()}</td>
                <td className="p-2 font-medium">{names[r.user_id] || '—'}</td>
                <td className="p-2 text-muted-foreground">{emails[r.user_id] || '—'}</td>
                <td className="p-2 text-muted-foreground whitespace-nowrap">{phones[r.user_id] || '—'}</td>
                <td className="p-2">{r.courses?.title || '—'}</td>
                <td className="p-2 font-mono text-primary">{r.promocode && r.promocode !== 'ADMIN_GRANT' ? r.promocode : (r.promocode === 'ADMIN_GRANT' ? <span className="text-muted-foreground font-sans not-italic">Granted</span> : '—')}</td>
                <td className="p-2 text-right font-bold">{formatPriceINR(r.amount_paid_inr || 0)}</td>
              </tr>
            ))}
            {filteredRows.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No enrollments found</td></tr>}
          </tbody>
          {/* Footer total */}
          {filteredRows.length > 0 && (
            <tfoot className="border-t-2 border-border font-bold">
              <tr>
                <td colSpan={6} className="p-2 text-right">Total</td>
                <td className="p-2 text-right text-primary">{formatPriceINR(filteredRows.reduce((s, r) => s + (r.amount_paid_inr || 0), 0))}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
};

export default AdminRevenue;