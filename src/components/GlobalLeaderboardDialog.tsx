import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Trophy, Medal, Coins, FileCheck2, BookOpen, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

type Row = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  level: number;
  xp: number;
  coins: number;
  tests: number;
};

type SortKey = 'xp' | 'coins' | 'tests';

const TTL_MS = 60_000; // 1 minute
const INITIAL_SHOW = 7; // Show 7 users initially
const cache = new Map<string, { ts: number; rows: Row[] }>();

const sortRows = (rows: Row[], key: SortKey) =>
  [...rows].sort((a, b) => {
    if (key === 'xp') return (b.xp - a.xp) || (b.coins - a.coins);
    if (key === 'coins') return (b.coins - a.coins) || (b.xp - a.xp);
    return (b.tests - a.tests) || (b.xp - a.xp);
  }).slice(0, 100);

export default function GlobalLeaderboardDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<any[]>([]);
  const [courseId, setCourseId] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('xp');
  const [rawRows, setRawRows] = useState<Row[]>([]);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);

  useEffect(() => {
    if (!open || courses.length) return;
    supabase.from('courses').select('id, title, slug').eq('is_published', true).then(({ data }) => setCourses(data || []));
  }, [open, courses.length]);

  // Reset to 7 users when changing course or sort
  useEffect(() => {
    setShowAll(false);
  }, [courseId, sortKey]);

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
          xp: 0, coins: 0, tests: 0,
        };
        agg[r.user_id].xp += r.xp || 0;
        agg[r.user_id].coins += r.coins || 0;
        if (r.source === 'test_attempt') agg[r.user_id].tests += 1;
      }
      const rows = Object.values(agg);
      cache.set(courseId, { ts: Date.now(), rows });
      setRawRows(rows);
      setLoading(false);
    })();
  }, [open, courseId, refreshNonce]);

  const rows = useMemo(() => sortRows(rawRows, sortKey), [rawRows, sortKey]);
  
  // Handle showing only 7 users initially
  const visibleRows = useMemo(() => {
    if (showAll || rows.length <= INITIAL_SHOW) return rows;
    return rows.slice(0, INITIAL_SHOW);
  }, [rows, showAll]);

  const selectedCourse = courses.find(c => c.id === courseId);
  const courseLabel = selectedCourse?.title || 'All courses';

  const refresh = () => {
    cache.delete(courseId);
    setRefreshNonce(n => n + 1);
  };

  const handleSelectCourse = (id: string) => {
    setCourseId(id);
    setCourseOpen(false); // Close popup on select
  };

  const sortMeta: { key: SortKey; label: string }[] = [
    { key: 'xp', label: 'Top XP' },
    { key: 'coins', label: 'Top Coins' },
    { key: 'tests', label: 'Most Tests' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="text-primary" /> Leaderboard — Top 100</DialogTitle>
          <DialogDescription>Top learners ranked by activity. Cached for 1 minute.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1 items-center mb-1">
          {/* Course Selector Popup */}
          <Popover open={courseOpen} onOpenChange={setCourseOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5 font-normal">
                <BookOpen className="w-3.5 h-3.5 text-primary" />
                <span className="truncate max-w-[150px]">{courseLabel}</span>
                <ChevronDown className="w-3 h-3 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-1 max-h-[250px] overflow-y-auto" align="start">
              <Button
                variant={courseId === 'all' ? 'secondary' : 'ghost'}
                className="w-full justify-start h-8 text-xs font-normal"
                onClick={() => handleSelectCourse('all')}
              >
                <BookOpen className="w-3.5 h-3.5 mr-2 text-primary" />
                All courses
              </Button>
              <div className="my-1 h-px bg-border" />
              {courses.map(c => (
                <Button
                  key={c.id}
                  variant={courseId === c.id ? 'secondary' : 'ghost'}
                  className="w-full justify-start h-8 text-xs font-normal truncate px-2"
                  onClick={() => handleSelectCourse(c.id)}
                >
                  {c.title}
                </Button>
              ))}
            </PopoverContent>
          </Popover>

          <div className="flex-1" />

          {sortMeta.map(s => (
            <Button key={s.key} size="sm" variant={sortKey === s.key ? 'default' : 'outline'} onClick={() => setSortKey(s.key)} className="h-7 text-xs">
              {s.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={refresh} className="h-7 text-xs">
            Refresh
          </Button>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden mt-2 -mx-2 px-2">
          <div className="flex-1 overflow-y-auto">
            <p className="text-xs text-muted-foreground mb-2 sticky top-0 bg-card pt-1 pb-2 border-b border-border/50 z-10">
              {courseLabel} · {rows.length} learner{rows.length === 1 ? '' : 's'} · sorted by {sortMeta.find(s => s.key === sortKey)?.label}
            </p>
            
            {loading ? <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> :
              rows.length === 0 ? <p className="text-sm text-muted-foreground text-center py-10">No activity yet — be the first!</p> : (
                <>
                  <div className="divide-y divide-border rounded border border-border">
                    {visibleRows.map((r, i) => (
                      <div key={r.user_id} className="flex items-center gap-3 p-2.5">
                        <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-gray-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-secondary text-muted-foreground'}`}>
                          {i < 3 ? <Medal className="w-3.5 h-3.5" /> : i + 1}
                        </div>
                        {r.avatar_url ? <img src={r.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" /> : <div className="w-8 h-8 rounded-full bg-secondary shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{r.display_name || 'Anonymous'}</div>
                          <div className="text-[11px] text-muted-foreground flex gap-2 flex-wrap">
                            <span>Lvl {r.level}</span>
                            <span className="flex items-center gap-0.5"><FileCheck2 className="w-3 h-3" /> {r.tests}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`text-sm font-bold ${sortKey === 'coins' ? 'text-[hsl(var(--coin))]' : 'text-[hsl(var(--xp))]'}`}>
                            {sortKey === 'coins' ? r.coins.toLocaleString() : sortKey === 'tests' ? `${r.tests} tests` : `${r.xp.toLocaleString()} XP`}
                          </div>
                          <div className="text-[11px] flex items-center justify-end gap-2 text-muted-foreground">
                            <span className="flex items-center gap-0.5"><Coins className="w-3 h-3" />{r.coins.toLocaleString()}</span>
                            <span>{r.xp.toLocaleString()} XP</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Show More / Show Less Button */}
                  {rows.length > INITIAL_SHOW && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setShowAll(prev => !prev)} 
                      className="w-full mt-2 h-8 text-xs"
                    >
                      {showAll ? 'Show Less' : `Show All ${rows.length} Learners`}
                    </Button>
                  )}
                </>
              )
            }
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}