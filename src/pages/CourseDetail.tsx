import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Play, BookOpen, Tag, CheckCircle2, ArrowRight, Lock } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { formatPriceINR } from '@/lib/format';
import { useSEO } from '@/lib/seo';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ─── Types (Schema compliant) ───
interface SuggestionCourse {
  id: string;
  slug: string;
  title: string;
  thumbnail_url: string | null;
  price_inr: number;
}

// Helper for proper rich-text description formatting
const RichText = ({ text }: { text: string }) => {
  const formattedHtml = text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-foreground">$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, '<em class="text-foreground/80">$1</em>')
    .replace(/^[\-\*] (.*$)/gm, '<li class="ml-4 list-disc text-foreground/80">$1</li>')
    .replace(/\n/g, '<br />');

  return (
    <div 
      className="text-foreground/90 leading-relaxed"
      dangerouslySetInnerHTML={{ __html: formattedHtml }} 
    />
  );
};

const CourseDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  
  const [course, setCourse] = useState<any>(null);
  const [tree, setTree] = useState<any[]>([]);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [promo, setPromo] = useState('');
  const [discount, setDiscount] = useState<{ amount: number; code: string; promocode_id: string } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  
  // Suggestions state
  const [suggestions, setSuggestions] = useState<SuggestionCourse[]>([]);

  useSEO({
    title: course ? `${course.title} — LearnHub` : 'Course — LearnHub',
    description: course?.meta_description || course?.description || 'Online course on LearnHub.',
    image: course?.thumbnail_url,
    jsonLd: course ? {
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: course.title,
      description: course.description,
      provider: { '@type': 'Organization', name: 'LearnHub' },
      offers: { '@type': 'Offer', price: course.price_inr, priceCurrency: 'INR' },
    } : undefined,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('paid') === '1') toast.success('Payment received! Enrolling…');
    if (params.get('canceled') === '1') toast.info('Payment canceled.');
    
    const load = async () => {
      setLoading(true);
      const { data: c } = await supabase.from('courses').select('*').eq('slug', slug).eq('is_published', true).maybeSingle();
      if (!c) { setLoading(false); return; }
      setCourse(c);
      
      // Fetch Curriculum Tree
      const { data: subjects } = await supabase
        .from('subjects')
        .select('id, name, position, chapters(id, name, position, parts(id, name, video_id, notes_url, duration, position, is_preview))')
        .eq('course_id', c.id)
        .order('position');
        
      const sorted = (subjects || []).map((s: any) => ({
        ...s,
        chapters: (s.chapters || []).sort((a: any, b: any) => a.position - b.position).map((ch: any) => ({
          ...ch,
          parts: (ch.parts || []).sort((a: any, b: any) => a.position - b.position),
        })),
      }));
      setTree(sorted);

      // Fetch Suggestions (exclude current course)
      const { data: sug } = await supabase
        .from('courses')
        .select('id, slug, title, thumbnail_url, price_inr')
        .eq('is_published', true)
        .neq('id', c.id)
        .order('created_at', { ascending: false })
        .limit(10);
      setSuggestions(sug || []);

      // Enrollment Check
      if (user) {
        const checkEnroll = async () => {
          const { data: en } = await supabase.from('enrollments').select('id').eq('user_id', user.id).eq('course_id', c.id).maybeSingle();
          return !!en;
        };
        let isEn = await checkEnroll();
        if (!isEn && params.get('paid') === '1') {
          for (let i = 0; i < 5 && !isEn; i++) {
            await new Promise(r => setTimeout(r, 1500));
            isEn = await checkEnroll();
          }
          if (isEn) toast.success('Enrolled!');
        }
        setEnrolled(isEn);
      }
      setLoading(false);
    };
    load();
  }, [slug, user]);

  const applyPromo = async () => {
    if (!promo.trim()) return;
    const { data } = await supabase.from('promocodes').select('*').eq('code', promo.trim().toUpperCase()).eq('is_active', true).maybeSingle();
    if (!data) { toast.error('Invalid code'); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { toast.error('Code expired'); return; }
    if (data.max_uses && data.uses_count >= data.max_uses) { toast.error('Code exhausted'); return; }
    if (data.course_id && data.course_id !== course.id) { toast.error('Code not valid for this course'); return; }
    const amount = data.discount_type === 'percent'
      ? Math.round((course.price_inr * data.discount_value) / 100)
      : data.discount_value;
    setDiscount({ amount: Math.min(amount, course.price_inr), code: data.code, promocode_id: data.id });
    toast.success(`Saved ${formatPriceINR(Math.min(amount, course.price_inr))}!`);
  };

  const handleEnroll = async () => {
    if (!user) { nav('/auth'); return; }
    setEnrolling(true);
    const { data, error } = await supabase.functions.invoke('create-checkout-session', {
      body: {
        course_id: course.id,
        promocode_id: discount?.promocode_id,
        success_url: `${window.location.origin}/courses/${course.slug}?paid=1`,
        cancel_url: `${window.location.origin}/courses/${course.slug}?canceled=1`,
      },
    });
    setEnrolling(false);
    if (error) { toast.error('Could not start checkout'); return; }
    if ((data as any)?.error) { toast.error((data as any).error); return; }
    if ((data as any)?.already_enrolled) { setEnrolled(true); toast.success('Already enrolled'); return; }
    if ((data as any)?.free) { setEnrolled(true); toast.success('Enrolled!'); return; }
    if ((data as any)?.url) { window.location.href = (data as any).url; return; }
    toast.error('Unexpected response');
  };

  const handleLockedClick = () => {
    if (!user) {
      nav('/auth');
      toast.info('Please login to access lectures');
      return;
    }
    if (enrolled) {
      nav(`/learn/${course.slug}`);
      return;
    }
    toast.info('Please enroll to access this lecture');
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!course) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Course not found</div>;

  const finalPrice = Math.max(0, course.price_inr - (discount?.amount || 0));

  return (
    <div className="flex-1 min-h-screen bg-background">
      {/* Smooth load animations */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .anim-up { animation: fadeSlideUp 0.6s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .anim-d1 { animation-delay: 0.1s; }
        .anim-d2 { animation-delay: 0.2s; }
        .anim-d3 { animation-delay: 0.3s; }
        
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .marquee-track {
          display: flex;
          gap: 1.25rem;
          width: max-content;
          animation: marquee 40s linear infinite;
        }
        .marquee-container:hover .marquee-track {
          animation-play-state: paused;
        }
      `}</style>

      <div className="max-w-7xl w-full mx-auto px-4 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* ─── Left Column ─── */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header */}
            <div className="anim-up">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{course.title}</h1>
              {course.instructor && (
                <p className="mt-2 text-muted-foreground flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">
                    {course.instructor.charAt(0)}
                  </span>
                  by {course.instructor}
                </p>
              )}
              
              {course.description && (
                <div className="mt-5 bg-muted/30 rounded-xl p-5 border border-border/50">
                  <div className={`${!isDescExpanded ? 'line-clamp-3' : ''} text-foreground/90 leading-relaxed`}>
                    <RichText text={course.description} />
                  </div>
                  {course.description.length > 150 && (
                    <button 
                      onClick={() => setIsDescExpanded(!isDescExpanded)} 
                      className="text-sm text-primary font-medium mt-2 hover:underline inline-block"
                    >
                      {isDescExpanded ? 'Show less' : 'Read more'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Curriculum */}
            <div className="anim-up anim-d2">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" /> Course Content
              </h2>
              {tree.length === 0 ? (
                <p className="text-muted-foreground text-sm bg-muted/20 rounded-lg p-4 border border-dashed border-border">No content added yet.</p>
              ) : (
                <Accordion type="multiple" defaultValue={[tree[0]?.id]} className="space-y-3">
                  {tree.map((subject: any, sIdx: number) => (
                    <AccordionItem 
                      key={subject.id} 
                      value={subject.id} 
                      className="border border-border/60 rounded-xl bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md px-0"
                    >
                      <AccordionTrigger className="hover:no-underline px-5 py-4 hover:bg-muted/20 transition-colors">
                        <span className="flex items-center gap-3 text-left font-semibold">
                          <span className="flex w-8 h-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold">
                            {sIdx + 1}
                          </span>
                          {subject.name}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-4 px-5">
                        <Accordion type="multiple" className="space-y-1 ml-4 border-l-2 border-border/40 pl-4">
                          {subject.chapters.map((ch: any) => (
                            <AccordionItem key={ch.id} value={ch.id} className="border-0">
                              <AccordionTrigger className="text-sm font-medium hover:no-underline py-2 text-foreground/80 hover:text-foreground">{ch.name}</AccordionTrigger>
                              <AccordionContent>
                                <ul className="space-y-2 ml-2">
                                  {ch.parts.map((p: any) => {
                                    const isFree = p.is_preview;
                                    
                                    const lectureElement = (
                                      <div className={`group/lec flex items-center justify-between gap-3 text-sm py-2.5 px-3 rounded-lg border transition-all duration-200 ${
                                        isFree 
                                          ? 'border-primary/20 hover:border-primary/40 hover:bg-primary/5 cursor-pointer' 
                                          : 'border-border/50 bg-muted/20 cursor-pointer hover:bg-muted/40 hover:border-border'
                                      }`}>
                                        <span className="flex items-center gap-2.5 min-w-0 flex-1">
                                          <div className={`flex w-7 h-7 shrink-0 items-center justify-center rounded-md transition-colors ${
                                            isFree ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover/lec:bg-muted-80'
                                          }`}>
                                            {isFree ? (
                                              <Play className="w-3.5 h-3.5 fill-current" />
                                            ) : (
                                              <Lock className="w-3.5 h-3.5" />
                                            )}
                                          </div>
                                          <span className={`truncate transition-colors ${!isFree ? 'text-muted-foreground group-hover/lec:text-foreground' : ''}`}>{p.name}</span>
                                        </span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {p.duration && <span className="text-xs text-muted-foreground tabular-nums">{p.duration}</span>}
                                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                            isFree ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'
                                          }`}>
                                            {isFree ? 'FREE' : 'LOCKED'}
                                          </span>
                                        </div>
                                      </div>
                                    );

                                    if (isFree) {
                                      return (
                                        <Link to={`/learn/${course.slug}`} key={p.id} className="block no-underline">
                                          {lectureElement}
                                        </Link>
                                      );
                                    }

                                    return (
                                      <div key={p.id} onClick={handleLockedClick}>
                                        {lectureElement}
                                      </div>
                                    );
                                  })}
                                </ul>
                              </AccordionContent>
                            </AccordionItem>
                          ))}
                        </Accordion>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </div>

          {/* ─── Right Column Sidebar ─── */}
          <aside className="lg:sticky lg:top-24 self-start anim-up anim-d1">
            <Card className="overflow-hidden bg-card border-border shadow-xl shadow-black/5">
              {course.thumbnail_url && (
                <div className="relative aspect-video overflow-hidden">
                  <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                </div>
              )}
              <div className="p-5 space-y-4">
                {enrolled ? (
                  <>
                    <div className="flex items-center gap-2 text-green-500 font-semibold text-lg">
                      <CheckCircle2 className="w-5 h-5" /> Enrolled
                    </div>
                    <Button asChild className="w-full" size="lg">
                      <Link to={`/learn/${course.slug}`} className="gap-2">
                        Continue Learning <ArrowRight className="w-4 h-4" />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <div className="text-3xl font-extrabold text-primary tracking-tight">
                        {finalPrice === 0 ? 'Free' : formatPriceINR(finalPrice)}
                      </div>
                      {discount && course.price_inr > 0 && (
                        <div className="text-sm text-muted-foreground line-through">{formatPriceINR(course.price_inr)}</div>
                      )}
                    </div>
                    
                    {course.price_inr > 0 && (
                      <div className="flex gap-2">
                        <Input 
                          value={promo} 
                          onChange={(e) => setPromo(e.target.value.toUpperCase())} 
                          placeholder="Promo code" 
                          className="text-sm h-10" 
                        />
                        <Button variant="outline" size="sm" onClick={applyPromo} className="h-10 px-3">
                          <Tag className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    
                    <Button 
                      id="enroll-btn"
                      className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all" 
                      size="lg" 
                      onClick={handleEnroll} 
                      disabled={enrolling}
                    >
                      {enrolling ? <Loader2 className="w-5 h-5 animate-spin" /> : !user ? 'Sign in to Enroll' : (finalPrice === 0 ? 'Enroll for Free' : 'Buy Now')}
                    </Button>
                    {!user && <p className="text-[11px] text-muted-foreground text-center leading-relaxed">Sign in to enroll and track your progress.</p>}
                  </>
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>

      {/* ─── Suggestions Auto-Sliding Bar ─── */}
      {suggestions.length > 0 && (
        <div className="mt-16 border-t border-border/50 bg-gradient-to-b from-background to-muted/20 pt-8 pb-6 anim-up anim-d3 overflow-hidden marquee-container">
          <div className="max-w-7xl w-full mx-auto px-4 mb-6 flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="w-2 h-6 rounded-full bg-primary block"></span>
              You Might Also Like
            </h2>
            <span className="text-xs text-muted-foreground font-medium tracking-wide uppercase">Hover to pause</span>
          </div>
          
          <div className="marquee-track">
            {/* Duplicate array for seamless infinite loop */}
            {[...suggestions, ...suggestions].map((s, i) => (
              <Link key={`${s.id}-${i}`} to={`/courses/${s.slug}`} className="group shrink-0 w-72">
                <Card className="overflow-hidden bg-card border-border/60 hover:border-primary/40 transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 group-hover:-translate-y-1 h-full">
                  <div className="aspect-video bg-secondary/50 relative overflow-hidden">
                    {s.thumbnail_url ? (
                      <img src={s.thumbnail_url} alt={s.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground/40"><BookOpen className="w-8 h-8" /></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-end p-3">
                      <ArrowRight className="w-5 h-5 text-white drop-shadow-md" />
                    </div>
                  </div>
                  <div className="p-3 flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold line-clamp-1 group-hover:text-primary transition-colors">{s.title}</h4>
                    <span className="text-xs font-bold text-primary whitespace-nowrap">
                      {s.price_inr === 0 ? 'Free' : formatPriceINR(s.price_inr)}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseDetail;