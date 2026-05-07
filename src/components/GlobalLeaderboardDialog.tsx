import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Trophy, Medal, Coins, PlayCircle, FileCheck2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';

type Row = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
  xp: number;
  coins: number;
  videos: number;
  tests: number;
};

type SortKey = 'xp' | 'coins' | 'videos' | 'tests';

const TTL_MS = 60_000; // 1 minute
const cache = new Map<string, { ts: number; rows: Row[] }>();

const sortRows = (rows: Row[], key: SortKey) =>
  [...rows].sort((a, b) => {
    if (key === 'xp') return (b.xp - a.xp) || (b.coins - a.coins);
    if (key === 'coins') return (b.coins - a.coins) || (b.xp - a.xp);
    if (key === 'videos') return (b.videos - a.videos) || (b.xp - a.xp);
    return (b.tests - a.tests) || (b.xp - a.xp);
  }).slice(0, 100);

export default function GlobalLeaderboardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('xp');
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!open || courses.length) return;
    supabase.from('courses').select('id, title, slug').eq('is_published', true).then(({ data }) => setCourses(data || []));
  }, [open, courses.length]);

  useEffect(() => {
    if (!open) return;
    const cached = cache.get(courseId);
    if (cached && Date.now() - cached.ts < TTL_MS) {
      setRawRows(cached.rows);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      let q = supabase
        .from('coin_ledger')
        .select('user_id, xp, coins, source, profiles!inner(display_name, avatar_url, level)');
      if (courseId !== 'all') q = q.eq('course_id', courseId);
      const { data } = await q;
      const agg: Record<string, Row> = {};
      for (const r of (data || []) as any[]) {
        if (!agg[r.user_id]) agg[r.user_id] = {
          user_id: r.user_id,
          display_name: r.profiles?.display_name ?? null,
          avatar_url: r.profiles?.avatar_url ?? null,
          level: r.profiles?.level ?? 1,
          xp: 0, coins: 0, videos: 0, tests: 0,
        };
        agg[r.user_id].xp += r.xp || 0;
        agg[r.user_id].coins += r.coins || 0;
        if (r.source === 'video') agg[r.user_id].videos += 1;
        if (r.source === 'test_attempt') agg[r.user_id].tests += 1;
      }
      const rows = Object.values(agg);
      cache.set(courseId, { ts: Date.now(), rows });
      setRawRows(rows);
      setLoading(false);
    })();
  }, [open, courseId, refreshNonce]);

  const rows = useMemo(() => sortRows(rawRows, sortKey), [rawRows, sortKey]);
  const selectedCourse = courses.find(c => c.id === courseId);
  const courseLabel = selectedCourse?.title || 'All courses';

  const refresh = () => {
    cache.delete(courseId);
    setRefreshNonce(n => n + 1);
  };

  const sortMeta: { key: SortKey; label: string }[] = [
    { key: 'xp', label: 'Top XP' },
    { key: 'coins', label: 'Top Coins' },
    { key: 'videos', label: 'Most Videos' },
    { key: 'tests', label: 'Most Tests' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="text-primary" /> Leaderboard — Top 100</DialogTitle>
          <DialogDescription>Top learners ranked by activity. Cached for 1 minute.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1 mb-1">
          {sortMeta.map(s => (
            <Button key={s.key} size="sm" variant={sortKey === s.key ? 'default' : 'outline'} onClick={() => setSortKey(s.key)} className="h-7 text-xs">
              {s.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={refresh} className="h-7 text-xs ml-auto">
            Refresh
          </Button>
        </div>

        <Tabs value={courseId} onValueChange={setCourseId} className="flex flex-col flex-1 overflow-hidden">
          <TabsList className="flex flex-wrap h-auto justify-start">
            <TabsTrigger value="all">All courses</TabsTrigger>
            {courses.map(c => (
              <TabsTrigger key={c.id} value={c.id} className="max-w-[140px] truncate">{c.title}</TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value={courseId} className="flex-1 overflow-y-auto mt-3 -mx-2 px-2">
            <p className="text-xs text-muted-foreground mb-2">{courseLabel} · {rows.length} learner{rows.length === 1 ? '' : 's'} · sorted by {sortMeta.find(s => s.key === sortKey)?.label}</p>
            {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> :
              rows.length === 0 ? <p className="text-sm text-muted-foreground text-center py-10">No activity yet — be the first!</p> :
                <div className="divide-y divide-border rounded border border-border">
                  {rows.map((r, i) => (
                    <div key={r.user_id} className="flex items-center gap-3 p-2.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-gray-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-secondary text-muted-foreground'}`}>
                        {i < 3 ? <Medal className="w-3.5 h-3.5" /> : i + 1}
                      </div>
                      {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" /> : <div className="w-8 h-8 rounded-full bg-secondary shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{r.display_name || 'Anonymous'}</div>
                        <div className="text-[11px] text-muted-foreground flex gap-2 flex-wrap">
                          <span>Lvl {r.level}</span>
                          <span className="flex items-center gap-0.5"><PlayCircle className="w-3 h-3" /> {r.videos}</span>
                          <span className="flex items-center gap-0.5"><FileCheck2 className="w-3 h-3" /> {r.tests}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-bold ${sortKey === 'coins' ? 'text-[hsl(var(--coin))]' : 'text-[hsl(var(--xp))]'}`}>
                          {sortKey === 'coins' ? r.coins.toLocaleString() : sortKey === 'videos' ? `${r.videos} videos` : sortKey === 'tests' ? `${r.tests} tests` : `${r.xp.toLocaleString()} XP`}
                        </div>
                        <div className="text-[11px] flex items-center justify-end gap-2 text-muted-foreground">
                          <span className="flex items-center gap-0.5"><Coins className="w-3 h-3" />{r.coins.toLocaleString()}</span>
                          <span>{r.xp.toLocaleString()} XP</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            }
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
