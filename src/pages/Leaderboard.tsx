import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Loader2, Trophy, Medal, Coins } from 'lucide-react';
import { useSEO } from '@/lib/seo';

const Leaderboard = () => {
  const { slug } = useParams<{ slug: string }>();
  const [course, setCourse] = useState<{ id: string; title: string; slug: string } | null>(null);
  const [rows, setRows] = useState<{
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    level: number;
    xp: number;
    coins: number;
    videos: number;
    tests: number;
  }[]>([]);
  const [loading, setLoading] = useState(true);

  useSEO({
    title: course ? `${course.title} Leaderboard` : 'Leaderboard',
    description: 'Top learners on LearnHub.',
  });

  useEffect(() => {
    (async () => {
      try {
        // Step 1: Get course by slug
        const { data: c } = await supabase
          .from('courses')
          .select('id, title, slug')
          .eq('slug', slug)
          .maybeSingle();

        if (!c) {
          setLoading(false);
          return;
        }
        setCourse(c);

        // Step 2: Use RPC function (bypasses RLS with SECURITY DEFINER)
        // This function already aggregates XP/coins per user and sorts properly
        const { data, error } = await supabase.rpc('get_leaderboard', {
          _course_id: c.id,
        });

        if (error) {
          console.error('Leaderboard RPC error:', error.message);
        }

        setRows((data as typeof rows) || []);
      } catch (err) {
        console.error('Leaderboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Course not found
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
      <Link
        to={`/courses/${course.slug}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {course.title}
      </Link>
      <h1 className="text-2xl font-bold mt-2 mb-1 flex items-center gap-2">
        <Trophy className="text-primary" /> Leaderboard
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Top 100 learners ranked by XP earned in this course.
      </p>
      <Card className="bg-card border-border divide-y divide-border">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground text-center">
            No scores yet — be the first to watch a video or take a test!
          </p>
        ) : (
          rows.map((r, i) => (
            <div key={r.user_id} className="flex items-center gap-3 p-3">
              {/* Rank Badge */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  i === 0
                    ? 'bg-yellow-500 text-black'
                    : i === 1
                    ? 'bg-gray-400 text-black'
                    : i === 2
                    ? 'bg-amber-700 text-white'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                {i < 3 ? <Medal className="w-3.5 h-3.5" /> : i + 1}
              </div>

              {/* Avatar */}
              {r.avatar_url ? (
                <img
                  src={r.avatar_url}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-secondary shrink-0" />
              )}

              {/* User Info - NOTE: RPC returns flat columns, not nested profile */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {r.display_name || 'Anonymous'}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Level {r.level || 1} • {r.xp.toLocaleString()} XP
                  {r.tests > 0 && ` • ${r.tests} test${r.tests > 1 ? 's' : ''}`}
                </div>
              </div>

              {/* Coins */}
              <div
                className={`text-sm font-bold flex items-center gap-1 shrink-0 ${
                  r.coins >= 0
                    ? 'text-[hsl(var(--coin))]'
                    : 'text-destructive'
                }`}
              >
                <Coins className="w-3.5 h-3.5" /> {r.coins.toLocaleString()}
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
};

export default Leaderboard;