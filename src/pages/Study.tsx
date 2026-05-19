import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useSEO } from '@/lib/seo';
import { Loader2, Play, Sparkles, Flame, Zap } from 'lucide-react';
import { formatPriceINR } from '@/lib/format';

// ─── DETERMINISTIC DISCOUNT & SCARCITY HELPERS ───

const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const COURSE_DISCOUNTS = [15, 25, 33, 40, 47, 55, 59, 63];

const getYearlyCourseDiscount = (courseId: string): number => {
  const year = new Date().getFullYear();
  const seed = hashString(`${courseId}-${year}`);
  return COURSE_DISCOUNTS[seed % COURSE_DISCOUNTS.length];
};

const getOriginalPrice = (actualPrice: number, discountPercent: number): number => {
  if (actualPrice <= 0 || discountPercent <= 0) return 0;
  return Math.ceil((actualPrice / (1 - discountPercent / 100)) / 100) * 100;
};

const getClaimedPercentage = (courseId: string): number => {
  const currentMonth = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const seed = hashString(`${courseId}-claim-${year}`);
  const baseProgress = 7 + currentMonth * 5;
  const offset = seed % 11;
  return Math.min(85, baseProgress + offset);
};


/* ════════════════════════════════════════════════════════
   MAIN STUDY PAGE
   ════════════════════════════════════════════════════════ */
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

      {/* ─── ENROLLED COURSES (Original UI/UX Untouched) ─── */}
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

      {/* ─── SUGGESTED COURSES (High Psychology UI/UX) ─── */}
      {suggested.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Zap className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold">Suggested for you</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {suggested.map((c: any) => {
              const discountPercent = c.price_inr > 0 ? getYearlyCourseDiscount(c.id) : 0;
              const originalPrice = discountPercent > 0 ? getOriginalPrice(c.price_inr, discountPercent) : 0;
              const claimedPercent = discountPercent > 0 ? getClaimedPercentage(c.id) : 0;

              return (
                <Card key={c.id} className="overflow-hidden bg-card border-border/60 transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/[0.06] group">
                  <div className="relative aspect-video overflow-hidden bg-muted">
                    {c.thumbnail_url && <img src={c.thumbnail_url} alt={c.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />}
                    {discountPercent > 0 && (
                      <div className="absolute top-2 right-2">
                        <span className="inline-flex items-center gap-1 bg-red-500 text-white font-extrabold text-[10px] px-2 py-1 rounded-lg shadow-lg shadow-red-500/30 uppercase tracking-wider">
                          <Flame className="w-3 h-3" /> {discountPercent}% OFF
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
                  </div>
                  <div className="p-3 space-y-2.5">
                    <h3 className="font-bold text-sm line-clamp-2 leading-snug">{c.title}</h3>
                    
                    {/* Dynamic Scarcity Progress Bar */}
                    {discountPercent > 0 && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold">
                          <span className="text-red-500 flex items-center gap-0.5"><Zap className="w-2.5 h-2.5" /> Selling Fast</span>
                          <span className="text-muted-foreground">{claimedPercent}% Claimed</span>
                        </div>
                        <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                          <div className="bg-gradient-to-r from-red-500 to-orange-400 h-full rounded-full transition-all duration-1000" style={{ width: `${claimedPercent}%` }} />
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground line-clamp-2">{c.description}</p>

                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-sm font-extrabold text-primary">{c.price_inr === 0 ? 'Free' : formatPriceINR(c.price_inr)}</span>
                        {originalPrice > 0 && (
                          <span className="text-[11px] text-muted-foreground line-through decoration-red-400/60 decoration-2">{formatPriceINR(originalPrice)}</span>
                        )}
                      </div>
                      <Button asChild size="sm" variant="outline" className="h-8 text-xs rounded-lg">
                        <Link to={`/courses/${c.slug}`}>View</Link>
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Study;