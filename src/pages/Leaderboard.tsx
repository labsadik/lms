import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Loader2, Trophy, Medal, Coins } from 'lucide-react';
import { useSEO } from '@/lib/seo';

const Leaderboard = () => {
  const { slug } = useParams<{ slug: string }>();
  const [course, setCourse] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useSEO({ title: course ? `${course.title} Leaderboard` : 'Leaderboard', description: 'Top learners on LearnHub.' });

  useEffect(() => {
    (async () => {
      const { data: c } = await supabase.from('courses').select('id, title, slug').eq('slug', slug).maybeSingle();
      if (!c) { setLoading(false); return; }
      setCourse(c);
      // Pull all ledger rows for this course (test attempts populate course_id)
      const { data } = await supabase
        .from('coin_ledger')
        .select('user_id, xp, coins, profiles!inner(display_name, avatar_url, level)')
        .eq('course_id', c.id);
      const agg: Record<string, any> = {};
      for (const r of (data || []) as any[]) {
        if (!agg[r.user_id]) agg[r.user_id] = { user_id: r.user_id, xp: 0, coins: 0, profile: r.profiles };
        agg[r.user_id].xp += r.xp || 0;
        agg[r.user_id].coins += r.coins || 0;
      }
      const sorted = Object.values(agg).sort((a: any, b: any) => b.coins - a.coins).slice(0, 100);
      setRows(sorted);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!course) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Course not found</div>;

  return (
    <div className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
      <Link to={`/courses/${course.slug}`} className="text-sm text-muted-foreground hover:text-foreground">← {course.title}</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1 flex items-center gap-2"><Trophy className="text-primary" /> Leaderboard</h1>
      <p className="text-sm text-muted-foreground mb-6">Top 100 learners ranked by coins earned in this course's tests.</p>
      <Card className="bg-card border-border divide-y divide-border">
        {rows.length === 0 ? <p className="p-6 text-sm text-muted-foreground text-center">No scores yet — be the first to take a test!</p> :
          rows.map((r: any, i: number) => (
            <div key={r.user_id} className="flex items-center gap-3 p-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? 'bg-yellow-500 text-black' : i === 1 ? 'bg-gray-400 text-black' : i === 2 ? 'bg-amber-700 text-white' : 'bg-secondary text-muted-foreground'}`}>
                {i < 3 ? <Medal className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {r.profile?.avatar_url ? <img src={r.profile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" /> : <div className="w-8 h-8 rounded-full bg-secondary shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.profile?.display_name || 'Anonymous'}</div>
                <div className="text-[11px] text-muted-foreground">Level {r.profile?.level || 1} • {r.xp} XP</div>
              </div>
              <div className={`text-sm font-bold flex items-center gap-1 shrink-0 ${r.coins >= 0 ? 'text-[hsl(var(--coin))]' : 'text-destructive'}`}>
                <Coins className="w-3.5 h-3.5" /> {r.coins.toLocaleString()}
              </div>
            </div>
          ))}
      </Card>
    </div>
  );
};

export default Leaderboard;
