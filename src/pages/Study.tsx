import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSEO } from '@/lib/seo';
import { Loader2, Play, Sparkles } from 'lucide-react';
import { formatPriceINR } from '@/lib/format';

const Study = () => {
  const { user } = useAuth();
  const [enrolled, setEnrolled] = useState<any[]>([]);
  const [suggested, setSuggested] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useSEO({ title: 'My Learning — LearnHub', description: 'Continue your enrolled courses and discover more.' });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: ens } = await supabase
        .from('enrollments')
        .select('id, courses(id, slug, title, thumbnail_url, description, price_inr, instructor)')
        .eq('user_id', user.id);
      const en = (ens || []).map((e: any) => e.courses).filter(Boolean);
      setEnrolled(en);

      const enrolledIds = en.map((c: any) => c.id);
      let q = supabase.from('courses').select('id, slug, title, thumbnail_url, description, price_inr, instructor').eq('is_published', true).limit(8);
      if (enrolledIds.length > 0) q = q.not('id', 'in', `(${enrolledIds.join(',')})`);
      const { data: sug } = await q;
      setSuggested(sug || []);

      // progress %
      for (const c of en) {
        const { data: subs } = await supabase.from('subjects').select('id, chapters(id, parts(id))').eq('course_id', c.id);
        const total: string[] = (subs || []).flatMap((s: any) => (s.chapters || []).flatMap((ch: any) => (ch.parts || []).map((p: any) => p.id)));
        if (total.length === 0) { c._pct = 0; continue; }
        const { data: done } = await supabase.from('progress').select('part_id').eq('user_id', user.id).eq('completed', true).in('part_id', total);
        c._pct = Math.round(((done?.length || 0) / total.length) * 100);
      }
      setEnrolled([...en]);
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 px-4 py-6 max-w-7xl mx-auto w-full">
      <h1 className="text-2xl sm:text-3xl font-bold mb-1">My Learning</h1>
      <p className="text-sm text-muted-foreground mb-6">Pick up where you left off.</p>

      {enrolled.length === 0 ? (
        <Card className="p-8 text-center bg-card border-border">
          <Sparkles className="w-10 h-10 mx-auto text-primary mb-2" />
          <h2 className="font-bold mb-1">No courses yet</h2>
          <p className="text-sm text-muted-foreground mb-4">Browse the catalog and enroll in your first course.</p>
          <Button asChild><Link to="/courses">Browse courses</Link></Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {enrolled.map((c: any) => (
            <Card key={c.id} className="overflow-hidden bg-card border-border hover:border-primary/40 transition-colors">
              {c.thumbnail_url && <img src={c.thumbnail_url} alt={c.title} loading="lazy" className="w-full aspect-video object-cover" />}
              <div className="p-3">
                <h3 className="font-semibold text-sm line-clamp-2 mb-2">{c.title}</h3>
                <Progress value={c._pct || 0} className="h-1.5 mb-2" />
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">{c._pct || 0}% complete</span>
                  <Button asChild size="sm" variant="ghost"><Link to={`/learn/${c.slug}`}><Play className="w-3 h-3 mr-1" /> Continue</Link></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {suggested.length > 0 && (
        <>
          <h2 className="text-lg font-bold mb-3">Suggested for you</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {suggested.map((c: any) => (
              <Card key={c.id} className="overflow-hidden bg-card border-border hover:border-primary/40 transition-colors">
                {c.thumbnail_url && <img src={c.thumbnail_url} alt={c.title} loading="lazy" className="w-full aspect-video object-cover" />}
                <div className="p-3">
                  <h3 className="font-semibold text-sm line-clamp-2 mb-1">{c.title}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{c.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-primary">{c.price_inr === 0 ? 'Free' : formatPriceINR(c.price_inr)}</span>
                    <Button asChild size="sm"><Link to={`/courses/${c.slug}`}>View</Link></Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default Study;
