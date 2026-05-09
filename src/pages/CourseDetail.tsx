import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Play, BookOpen, FileText, Tag, CheckCircle2 } from 'lucide-react';
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
  
  // State for "Read more" toggle
  const [isDescExpanded, setIsDescExpanded] = useState(false);

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

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!course) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Course not found</div>;

  const finalPrice = Math.max(0, course.price_inr - (discount?.amount || 0));

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-7xl w-full mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold mb-2">{course.title}</h1>
            {course.instructor && <p className="text-muted-foreground">by {course.instructor}</p>}
            
            {/* Swift Description: Clamped by default, "Read more" to expand */}
            {course.description && (
              <div className="mt-4">
                <div className={`${!isDescExpanded ? 'line-clamp-3' : ''} text-foreground/90 leading-relaxed`}>
                  <RichText text={course.description} />
                </div>
                {course.description.length > 150 && (
                  <button 
                    onClick={() => setIsDescExpanded(!isDescExpanded)} 
                    className="text-sm text-primary font-medium mt-1 hover:underline"
                  >
                    {isDescExpanded ? 'Show less' : 'Read more'}
                  </button>
                )}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xl font-bold mb-3">Course Content</h2>
            {tree.length === 0 ? (
              <p className="text-muted-foreground text-sm">No content yet.</p>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {tree.map((subject: any) => (
                  <AccordionItem key={subject.id} value={subject.id} className="border border-border rounded-lg bg-card px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <span className="flex items-center gap-2 text-left"><BookOpen className="w-4 h-4 text-primary" />{subject.name}</span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <Accordion type="multiple" className="space-y-1 ml-2">
                        {subject.chapters.map((ch: any) => (
                          <AccordionItem key={ch.id} value={ch.id} className="border-0">
                            <AccordionTrigger className="text-sm hover:no-underline py-2">{ch.name}</AccordionTrigger>
                            <AccordionContent>
                              <ul className="space-y-1 ml-4">
                                {ch.parts.map((p: any) => (
                                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/50">
                                    <span className="flex items-center gap-2 min-w-0 flex-1">
                                      <Play className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                      <span className="truncate">{p.name}</span>
                                    </span>
                                    {p.duration && <span className="text-xs text-muted-foreground flex-shrink-0">{p.duration}</span>}
                                  </li>
                                ))}
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

        {/* Sticky Right Side Enrollment Card */}
        <aside className="lg:sticky lg:top-24 self-start space-y-4">
          <Card className="overflow-hidden bg-card border-border">
            {course.thumbnail_url && <img src={course.thumbnail_url} alt={course.title} className="w-full aspect-video object-cover" />}
            <div className="p-4 space-y-3">
              {enrolled ? (
                <>
                  <div className="flex items-center gap-2 text-green-500 font-semibold"><CheckCircle2 className="w-5 h-5" /> Enrolled</div>
                  <Button asChild className="w-full" size="lg"><Link to={`/learn/${course.slug}`}>Continue Learning</Link></Button>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-3xl font-bold text-primary">{finalPrice === 0 ? 'Free' : formatPriceINR(finalPrice)}</div>
                    {discount && course.price_inr > 0 && (
                      <div className="text-sm text-muted-foreground line-through">{formatPriceINR(course.price_inr)}</div>
                    )}
                  </div>
                  {course.price_inr > 0 && (
                    <div className="flex gap-2">
                      <Input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="Promo code" className="text-sm" />
                      <Button variant="outline" size="sm" onClick={applyPromo}><Tag className="w-4 h-4" /></Button>
                    </div>
                  )}
                  <Button className="w-full" size="lg" onClick={handleEnroll} disabled={enrolling}>
                    {enrolling ? <Loader2 className="w-4 h-4 animate-spin" /> : !user ? 'Sign in to Enroll' : (finalPrice === 0 ? 'Enroll Free' : 'Buy Course')}
                  </Button>
                  {!user && <p className="text-[11px] text-muted-foreground text-center">You can browse all courses, but must sign in to enroll.</p>}
                </>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
};

export default CourseDetail;