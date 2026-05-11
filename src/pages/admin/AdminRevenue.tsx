import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Wallet, ShoppingCart, Search, Loader2, CalendarDays, X, Download, FileText, TrendingUp, BadgePercent } from 'lucide-react';
import { useSEO } from '@/lib/seo';
import { formatPriceINR } from '@/lib/format';
import { toast } from 'sonner';
import { format } from 'date-fns';

// @ts-ignore - PDF Library imports
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  
  // Calendar state
  const [calDate, setCalDate] = useState<Date | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);

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
    setDf(p => ({ ...p, mode, day: Math.min(p.day, new Date(p.year, p.month, 0).getDate()) }));
    if (mode !== 'all') setCalOpen(false);
  }, []);
  const setYear = useCallback((y: number) => setDf(p => ({ ...p, year: y, day: Math.min(p.day, new Date(y, p.month, 0).getDate()) })), []);
  const setMonth = useCallback((m: number) => setDf(p => ({ ...p, month: m, day: Math.min(p.day, new Date(p.year, m, 0).getDate()) })), []);
  const setDay = useCallback((d: number) => setDf(p => ({ ...p, day: d })), []);
  const clearFilter = useCallback(() => { setDf(p => ({ ...p, mode: 'all' })); setCalDate(undefined); }, []);

  // Handle Calendar Date Pick
  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setCalDate(date);
    setDf({ mode: 'day', year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() });
    setCalOpen(false);
  };

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
      const hay = `${names[r.user_id] || ''} ${emails[r.user_id] || ''} ${phones[r.user_id] || ''} ${r.courses?.title || ''} ${(r.amount_paid_inr || 0)}`.toLowerCase();
      return hay.includes(q);
    });
  }, [dateFiltered, search, names, emails, phones]);

  // Advanced Math Logic
  const totals = useMemo(() => {
    const total = dateFiltered.reduce((s, r) => s + (r.amount_paid_inr || 0), 0);
    const paid = dateFiltered.filter(r => (r.amount_paid_inr || 0) > 0 && r.promocode !== 'ADMIN_GRANT').length;
    const free = dateFiltered.filter(r => (r.amount_paid_inr || 0) === 0 && r.promocode !== 'ADMIN_GRANT').length;
    const promos = dateFiltered.filter(r => (r.amount_paid_inr || 0) > 0 && r.promocode && r.promocode !== 'ADMIN_GRANT').length;
    const granted = dateFiltered.filter(r => r.promocode === 'ADMIN_GRANT').length;
    const aov = paid > 0 ? total / paid : 0; // Average Order Value (only actual paying users)
    return { total, paid, free, promos, granted, count: dateFiltered.length, aov };
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

  const byMonth = useMemo(() => bucket(dateFiltered, d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`), [bucket, dateFiltered]);
  const byDay = useMemo(() => bucket(dateFiltered, d => d.toISOString().slice(0, 10)), [bucket, dateFiltered]);

  // --- EXPORT FUNCTIONS ---
  const getExportData = () => filteredRows.map(r => ({
    Date: new Date(r.enrolled_at).toLocaleDateString(),
    Name: names[r.user_id] || 'Unknown',
    Email: emails[r.user_id] || 'Unknown',
    Phone: phones[r.user_id] || 'N/A',
    Course: r.courses?.title || 'Unknown',
    Type: r.promocode === 'ADMIN_GRANT' ? 'Granted' : (r.amount_paid_inr === 0 ? 'Free' : (r.promocode ? 'Promo' : 'Paid')),
    Promo_Code: r.promocode === 'ADMIN_GRANT' ? 'ADMIN' : (r.promocode || 'N/A'),
    Amount: r.amount_paid_inr || 0
  }));

  const downloadExcel = () => {
    const data = getExportData();
    if (data.length === 0) return toast.error("No data to export");
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row => headers.map(h => `"${row[h as keyof typeof row]}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvRows], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Revenue_${filterLabel || 'All'}.csv`;
    link.click();
    toast.success("Excel/CSV Downloaded");
  };

  const downloadPDF = () => {
    const data = getExportData();
    if (data.length === 0) return toast.error("No data to export");
    
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`LearnHub Revenue Report`, 14, 20);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Filter: ${filterLabel || 'All Time'} | Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Total Revenue: ${formatPriceINR(totals.total)}`, 14, 34);
    
    autoTable(doc, {
      startY: 40,
      head: [Object.keys(data[0])],
      body: data.map(row => Object.values(row)),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] }
    });
    
    doc.save(`Revenue_${filterLabel || 'All'}.pdf`);
    toast.success("PDF Downloaded");
  };

  if (loading) return <div className="flex items-center justify-center py-20 h-full"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading revenue…</span></div>;

  const BucketCard = ({ label, data }: { label: string; data: { key: string; revenue: number; count: number }[] }) => (
    <Card className="p-3 bg-card border-border">
      {data.length === 0 ? <p className="text-xs text-muted-foreground">No data</p> : (
        <div className="text-sm divide-y divide-border">
          <div className="grid grid-cols-3 gap-2 py-2 font-bold text-xs uppercase text-muted-foreground">
            <span>{label}</span><span className="text-right">Enrollments</span><span className="text-right">Revenue</span>
          </div>
          {data.map(b => (
            <div key={b.key} className="grid grid-cols-3 gap-2 py-2">
              <span className="font-mono text-xs">{b.key}</span>
              <span className="text-right text-xs">{b.count}</span>
              <span className="text-right font-bold text-xs text-primary">{formatPriceINR(b.revenue)}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  const modeBtn = (m: DateMode, label: string) => (
    <Button size="sm" variant={df.mode === m ? 'default' : 'outline'} className="h-8 text-xs px-3" onClick={() => setMode(m)}>{label}</Button>
  );

  return (
    // Layout wrapper to fit perfectly inside fixed AdminLayout
    <div className="flex flex-col h-full overflow-hidden">
      
      {/* Header & Exports */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Revenue Analytics</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadExcel} className="h-9 text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5 text-green-500" /> Excel / CSV
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPDF} className="h-9 text-xs">
            <FileText className="w-3.5 h-3.5 mr-1.5 text-red-500" /> Download PDF
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-10 space-y-4 pr-1">
        
        {/* Calendar filter bar */}
        <Card className="p-3 bg-card border-border shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary shrink-0" />
            
            {/* Popover Calendar UI */}
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline" className="h-8 text-xs">
                  <CalendarDays className="w-3.5 h-3.5 mr-1.5" /> Pick Date
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                <Calendar
                  mode="single"
                  selected={calDate}
                  onSelect={handleDateSelect}
                  className="p-3"
                />
              </PopoverContent>
            </Popover>

            <div className="w-px h-5 bg-border mx-1" />
            
            {modeBtn('all', 'All Time')}
            {modeBtn('year', 'Year')}
            {modeBtn('month', 'Month')}
            {modeBtn('day', 'Day')}

            {df.mode !== 'all' && (
              <>
                <div className="w-px h-5 bg-border mx-1" />
                <Select value={String(df.year)} onValueChange={v => setYear(Number(v))}>
                  <SelectTrigger className="h-8 w-[90px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card">{availableYears.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>

                {(df.mode === 'month' || df.mode === 'day') && (
                  <Select value={String(df.month)} onValueChange={v => setMonth(Number(v))}>
                    <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card">{MONTH_NAMES.map((n, i) => <SelectItem key={i} value={String(i + 1)}>{n}</SelectItem>)}</SelectContent>
                  </Select>
                )}

                {df.mode === 'day' && (
                  <Select value={String(df.day)} onValueChange={v => setDay(Number(v))}>
                    <SelectTrigger className="h-8 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card max-h-52">{Array.from({ length: maxDays }, (_, i) => i + 1).map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                )}

                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={clearFilter}><X className="w-4 h-4" /></Button>
              </>
            )}

            {filterLabel && (
              <span className="text-xs font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-md ml-auto">{filterLabel}</span>
            )}
          </div>
        </Card>

        {/* Stat cards - Advanced Math */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Card className="p-4 bg-card border-border shadow-sm">
            <Wallet className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-bold">{formatPriceINR(totals.total)}</div>
            <div className="text-xs text-muted-foreground">Total Revenue</div>
          </Card>
          <Card className="p-4 bg-card border-border shadow-sm">
            <ShoppingCart className="w-5 h-5 text-blue-500 mb-2" />
            <div className="text-2xl font-bold">{totals.count}</div>
            <div className="text-xs text-muted-foreground">Total Enrollments</div>
          </Card>
          <Card className="p-4 bg-card border-border shadow-sm">
            <TrendingUp className="w-5 h-5 text-green-500 mb-2" />
            <div className="text-2xl font-bold">{formatPriceINR(totals.aov)}</div>
            <div className="text-xs text-muted-foreground">Avg Order Value (Paid)</div>
          </Card>
          <Card className="p-4 bg-card border-border shadow-sm">
            <BadgePercent className="w-5 h-5 text-orange-500 mb-2" />
            <div className="text-2xl font-bold">{totals.promos}</div>
            <div className="text-xs text-muted-foreground">Promo Used (Paid)</div>
          </Card>
          <Card className="p-4 bg-card border-border shadow-sm col-span-2 lg:col-span-1">
            <div className="w-5 h-5 text-muted-foreground mb-2 text-center font-bold text-xs border rounded">Free</div>
            <div className="text-2xl font-bold">{totals.free + totals.granted}</div>
            <div className="text-xs text-muted-foreground">Free ({totals.free}) & Granted ({totals.granted})</div>
          </Card>
        </div>

        {/* Breakdown tabs */}
        <Tabs defaultValue="course">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="course" className="text-xs">By Course</TabsTrigger>
            <TabsTrigger value="month" className="text-xs">By Month</TabsTrigger>
            <TabsTrigger value="day" className="text-xs">By Day</TabsTrigger>
          </TabsList>
          <TabsContent value="course">
            <BucketCard label="Course" data={byCourse.map(c => ({ key: c.title, revenue: c.revenue, count: c.count }))} />
          </TabsContent>
          <TabsContent value="month"><BucketCard label="Month" data={byMonth} /></TabsContent>
          <TabsContent value="day"><BucketCard label="Day" data={byDay} /></TabsContent>
        </Tabs>

        {/* Table Section */}
        <Card className="bg-card border-border shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-muted/30">
            <h2 className="font-bold text-sm">Enrollment Ledger ({filteredRows.length})</h2>
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, phone, amount…" className="pl-9 h-9 bg-background text-xs" />
            </div>
          </div>
          
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground bg-muted/50 border-b border-border sticky top-0">
                <tr>
                  <th className="text-left p-2.5 font-semibold">Date</th>
                  <th className="text-left p-2.5 font-semibold">Student Name</th>
                  <th className="text-left p-2.5 font-semibold">Email</th>
                  <th className="text-left p-2.5 font-semibold">Phone</th>
                  <th className="text-left p-2.5 font-semibold">Course</th>
                  <th className="text-left p-2.5 font-semibold">Status</th>
                  <th className="text-right p-2.5 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredRows.map(r => {
                  // Strict Logic Math
                  const isGranted = r.promocode === 'ADMIN_GRANT';
                  const isFree = !isGranted && (r.amount_paid_inr || 0) === 0;
                  const isPromo = !isGranted && !isFree && !!r.promocode;
                  const isPaid = !isGranted && !isFree && !isPromo;

                  let statusUI = <span className="text-blue-500 font-semibold bg-blue-500/10 px-1.5 py-0.5 rounded">Paid</span>;
                  if (isGranted) statusUI = <span className="text-muted-foreground font-semibold bg-muted px-1.5 py-0.5 rounded">Granted</span>;
                  else if (isFree) statusUI = <span className="text-green-500 font-semibold bg-green-500/10 px-1.5 py-0.5 rounded">Free</span>;
                  else if (isPromo) statusUI = <span className="text-orange-500 font-semibold bg-orange-500/10 px-1.5 py-0.5 rounded">Promo</span>;

                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2.5 whitespace-nowrap text-muted-foreground">{new Date(r.enrolled_at).toLocaleDateString()}</td>
                      <td className="p-2.5 font-medium">{names[r.user_id] || '—'}</td>
                      <td className="p-2.5 text-muted-foreground">{emails[r.user_id] || '—'}</td>
                      <td className="p-2.5 text-muted-foreground whitespace-nowrap">{phones[r.user_id] || '—'}</td>
                      <td className="p-2.5 max-w-[200px] truncate">{r.courses?.title || '—'}</td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-1.5">
                          {statusUI}
                          {isPromo && <span className="text-[10px] text-orange-500 font-mono truncate max-w-[60px]">({r.promocode})</span>}
                        </div>
                      </td>
                      <td className="p-2.5 text-right font-bold whitespace-nowrap">
                        {isGranted || isFree ? <span className="text-muted-foreground font-normal">₹0</span> : formatPriceINR(r.amount_paid_inr || 0)}
                      </td>
                    </tr>
                  );
                })}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No enrollments found for this filter.</td></tr>
                )}
              </tbody>
              {/* Footer Total */}
              {filteredRows.length > 0 && (
                <tfoot className="border-t-2 border-primary font-bold bg-primary/5">
                  <tr>
                    <td colSpan={6} className="p-3 text-right text-sm">Calculated Total ({filteredRows.length} rows)</td>
                    <td className="p-3 text-right text-sm text-primary">{formatPriceINR(filteredRows.reduce((s, r) => s + (r.amount_paid_inr || 0), 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

      </div>
    </div>
  );
};

export default AdminRevenue;