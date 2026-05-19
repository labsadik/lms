import { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, Play, BookOpen, Tag, CheckCircle2, ArrowRight, Lock, Clock, Flame, Share2, Copy, Check } from 'lucide-react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { formatPriceINR } from '@/lib/format';
import { useSEO } from '@/lib/seo';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// ─── DETERMINISTIC DISCOUNT & TIMER HELPERS ───

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
  const index = seed % COURSE_DISCOUNTS.length;
  return COURSE_DISCOUNTS[index];
};

const getOriginalPrice = (actualPrice: number, discountPercent: number): number => {
  if (actualPrice <= 0) return 0;
  const raw = actualPrice / (1 - discountPercent / 100);
  return Math.ceil(raw / 100) * 100;
};

const DEAL_DURATIONS_MONTHS = [4, 6, 8, 10, 12]; 
const getCourseDeadline = (courseId: string): Date => {
  const now = new Date();
  const year = now.getFullYear();
  const seed = hashString(`${courseId}-deadline-${year}`);
  const monthsToAdd = DEAL_DURATIONS_MONTHS[seed % DEAL_DURATIONS_MONTHS.length];
  let deadline = new Date(year, 0 + monthsToAdd, 1, 0, 0, 0);
  const dayOffset = (seed * 3) % 28; 
  const hourOffset = (seed * 5) % 24; 
  deadline.setDate(deadline.getDate() + dayOffset);
  deadline.setHours(hourOffset);
  if (deadline.getTime() <= now.getTime()) deadline.setFullYear(deadline.getFullYear() + 1);
  return deadline;
};

// ─── RICH TEXT ───

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

// ─── COMPONENT ───

const CourseDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState<any>(null);
  const [tree, setTree] = useState<any[]>([]);
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [verifyingPayment, setVerifyingPayment] = useState(false);

  const [promo, setPromo] = useState('');
  const [discount, setDiscount] = useState<{ amount: number; code: string; promocode_id: string } | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);

  const [timeLeft, setTimeLeft] = useState({ d: 0, m: 0, s: 0 });
  const [copied, setCopied] = useState(false);

  const discountDisplay = useMemo(() => {
    if (!course || course.price_inr <= 0) return { percent: 0, original: 0, savings: 0 };
    const percent = getYearlyCourseDiscount(course.id);
    const original = getOriginalPrice(course.price_inr, percent);
    return { percent, original, savings: original - course.price_inr };
  }, [course?.id, course?.price_inr]);

  useEffect(() => {
    if (!course?.id || course.price_inr <= 0) return;
    const deadline = getCourseDeadline(course.id);
    const calculateTimeLeft = () => {
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();
      if (diff <= 0) return { d: 0, m: 0, s: 0 };
      return {
        d: Math.floor(diff / (1000 * 60 * 60 * 24)),
        m: Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60)),
        s: Math.floor((diff % (1000 * 60)) / 1000),
      };
    };
    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, [course?.id, course?.price_inr]);

  useSEO({
    title: course ? `${course.title} — LearnHub` : 'Course — LearnHub',
    description: course?.meta_description || course?.description || 'Online course on LearnHub.',
    image: course?.thumbnail_url,
    jsonLd: course ? {
      '@context': 'https://schema.org', '@type': 'Course', name: course.title,
      description: course.description, provider: { '@type': 'Organization', name: 'LearnHub' },
      offers: { '@type': 'Offer', price: course.price_inr, priceCurrency: 'INR' },
    } : undefined,
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('canceled') === '1') {
      toast.info('Payment canceled.');
      window.history.replaceState({}, '', `/courses/${slug}`);
    }
    const load = async () => {
      setLoading(true);
      const { data: c } = await supabase.from('courses').select('*').eq('slug', slug).eq('is_published', true).maybeSingle();
      if (!c) { setLoading(false); return; }
      setCourse(c);
      const { data: subjects } = await supabase.from('subjects').select('id, name, position, chapters(id, name, position, parts(id, name, video_id, notes_url, duration, position, is_preview))').eq('course_id', c.id).order('position');
      const sorted = (subjects || []).map((s: any) => ({ ...s, chapters: (s.chapters || []).sort((a: any, b: any) => a.position - b.position).map((ch: any) => ({ ...ch, parts: (ch.parts || []).sort((a: any, b: any) => a.position - b.position) })) }));
      setTree(sorted);
      if (user) {
        const { data: en } = await supabase.from('enrollments').select('id').eq('user_id', user.id).eq('course_id', c.id).maybeSingle();
        if (en) setEnrolled(true);
      }
      setLoading(false);
    };
    load();
  }, [slug, user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('paid') !== '1' || !user || !course?.id) return;
    let cancelled = false;
    const verifyEnrollment = async () => {
      setVerifyingPayment(true); toast.success('Payment successful! Verifying your enrollment…');
      const checkEnroll = async () => { const { data: en } = await supabase.from('enrollments').select('id').eq('user_id', user.id).eq('course_id', course.id).maybeSingle(); return !!en; };
      let isEnrolled = false;
      for (let i = 0; i < 3; i++) { if (cancelled) return; isEnrolled = await checkEnroll(); if (isEnrolled) break; await new Promise((r) => setTimeout(r, 1500)); }
      if (!isEnrolled) {
        try {
          const sessionId = params.get('session_id');
          const { data, error } = await supabase.functions.invoke('verify-enrollment', { body: { course_id: course.id, session_id: sessionId } });
          if (!error && (data as any)?.enrolled) isEnrolled = true; else { let errorMessage = 'Unknown verification error'; if (error) { try { if (error.context && typeof error.context.json === 'function') { const errBody = await error.context.json(); errorMessage = errBody?.error || errBody?.details || errorMessage; } } catch { } } console.error('Manual verify failed:', errorMessage); toast.error(`Verification failed: ${errorMessage}`); }
        } catch (err: any) { console.error('Manual verify exception:', err); }
      }
      if (!cancelled) { setEnrolled(isEnrolled); setVerifyingPayment(false); if (isEnrolled) { toast.success('You are now enrolled!'); window.history.replaceState({}, '', `/courses/${slug}`); } else { toast.error('Enrollment is taking longer than expected. Please contact support.'); } }
    };
    verifyEnrollment();
    return () => { cancelled = true; };
  }, [slug, user, course?.id]);

  const applyPromo = async () => {
    if (!promo.trim()) return;
    const { data } = await supabase.from('promocodes').select('*').eq('code', promo.trim().toUpperCase()).eq('is_active', true).maybeSingle();
    if (!data) { toast.error('Invalid code'); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { toast.error('Code expired'); return; }
    if (data.max_uses && data.uses_count >= data.max_uses) { toast.error('Code exhausted'); return; }
    if (data.course_id && data.course_id !== course.id) { toast.error('Code not valid for this course'); return; }
    const amount = data.discount_type === 'percent' ? Math.round((course.price_inr * data.discount_value) / 100) : data.discount_value;
    setDiscount({ amount: Math.min(amount, course.price_inr), code: data.code, promocode_id: data.id });
    toast.success(`Saved ${formatPriceINR(Math.min(amount, course.price_inr))}!`);
  };

  const handleEnroll = async () => {
    if (!user) { nav('/auth'); return; }
    if (!course?.id) { toast.error('Course information is missing.'); return; }
    setEnrolling(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { course_id: course.id, promocode_id: discount?.promocode_id || undefined, success_url: `${window.location.origin}/courses/${course.slug}?paid=1`, cancel_url: `${window.location.origin}/courses/${course.slug}?canceled=1` },
      });
      if (error) { let errorMessage = 'Could not start checkout.'; try { if (error.context) { const b = await error.context.json(); if (b?.error) errorMessage = b.error; } } catch { } toast.error(errorMessage); return; }
      const result = data as any;
      if (result?.error) toast.error(result.error);
      else if (result?.already_enrolled) { setEnrolled(true); toast.success('Already enrolled'); }
      else if (result?.free) { setEnrolled(true); toast.success('Enrolled!'); }
      else if (result?.url) { window.location.href = result.url; }
      else toast.error('Unexpected response.');
    } catch (err: any) { toast.error(err.message || 'Error.'); } finally { setEnrolling(false); }
  };

  const handleLockedClick = () => {
    if (!user) { nav('/auth'); toast.info('Please login to access lectures'); return; }
    if (enrolled) { nav(`/learn/${course.slug}`); return; }
    toast.info('Please enroll to access this lecture');
  };

  // ─── SHARE LOGIC ───
  const courseUrl = `${window.location.origin}/courses/${course?.slug}`;
  const shareText = course ? `Check out this course: ${course.title} 🔥` : '';

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: course.title, text: shareText, url: courseUrl });
      } catch (error) { /* User cancelled share */ }
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(courseUrl);
    setCopied(true);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const finalPrice = Math.max(0, (course?.price_inr ?? 0) - (discount?.amount || 0));
  const totalSavings = (discountDisplay.original ?? 0) - finalPrice;

  if (loading) return (<div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
  if (!course) return (<div className="flex-1 flex items-center justify-center text-muted-foreground">Course not found</div>);

  return (
    <div className="flex-1 min-h-screen bg-background">
      <style>{`
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.35); } 50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); } }
        .anim-up  { animation: fadeSlideUp 0.6s cubic-bezier(0.22,1,0.36,1) both; }
        .anim-d1  { animation-delay: 0.1s; }
        .anim-d2  { animation-delay: 0.2s; }
        .discount-glow { animation: pulseGlow 2s ease-in-out infinite; }
      `}</style>

      <div className="max-w-7xl w-full mx-auto px-4 py-6 sm:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* ═══════ LEFT COLUMN ═══════ */}
          <div className="lg:col-span-2 space-y-8 order-2 lg:order-1">
            <div className="anim-up">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">{course.title}</h1>
              {course.instructor && (
                <p className="mt-2 text-muted-foreground flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{course.instructor.charAt(0)}</span>
                  by {course.instructor}
                </p>
              )}
              {course.price_inr > 0 && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <span className="discount-glow inline-flex items-center gap-1.5 bg-red-500 text-white font-bold text-xs px-2.5 py-1 rounded-full"><Flame className="w-3 h-3" />{discountDisplay.percent}% OFF</span>
                  <span className="text-xs text-muted-foreground"><span className="line-through">{formatPriceINR(discountDisplay.original)}</span>{' '}<span className="font-semibold text-foreground">{formatPriceINR(course.price_inr)}</span></span>
                </div>
              )}
              {course.description && (
                <div className="mt-5 bg-muted/30 rounded-xl p-5 border border-border/50">
                  <div className={`${!isDescExpanded ? 'line-clamp-3' : ''} text-foreground/90 leading-relaxed`}><RichText text={course.description} /></div>
                  {course.description.length > 150 && (<button onClick={() => setIsDescExpanded(!isDescExpanded)} className="text-sm text-primary font-medium mt-2 hover:underline inline-block">{isDescExpanded ? 'Show less' : 'Read more'}</button>)}
                </div>
              )}
            </div>

            <div className="anim-up anim-d2">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" /> Course Content</h2>
              {tree.length === 0 ? (<p className="text-muted-foreground text-sm bg-muted/20 rounded-lg p-4 border border-dashed border-border">No content added yet.</p>) : (
                <Accordion type="multiple" defaultValue={[tree[0]?.id]} className="space-y-3">
                  {tree.map((subject: any, sIdx: number) => (
                    <AccordionItem key={subject.id} value={subject.id} className="border border-border/60 rounded-xl bg-card overflow-hidden shadow-sm transition-shadow hover:shadow-md px-0">
                      <AccordionTrigger className="hover:no-underline px-5 py-4 hover:bg-muted/20 transition-colors">
                        <span className="flex items-center gap-3 text-left font-semibold"><span className="flex w-8 h-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold">{sIdx + 1}</span>{subject.name}</span>
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
                                      <div className={`group/lec flex items-center justify-between gap-3 text-sm py-2.5 px-3 rounded-lg border transition-all duration-200 ${isFree ? 'border-primary/20 hover:border-primary/40 hover:bg-primary/5 cursor-pointer' : 'border-border/50 bg-muted/20 cursor-pointer hover:bg-muted/40 hover:border-border'}`}>
                                        <span className="flex items-center gap-2.5 min-w-0 flex-1">
                                          <div className={`flex w-7 h-7 shrink-0 items-center justify-center rounded-md transition-colors ${isFree ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground group-hover/lec:bg-muted-80'}`}>{isFree ? <Play className="w-3.5 h-3.5 fill-current" /> : <Lock className="w-3.5 h-3.5" />}</div>
                                          <span className={`truncate transition-colors ${!isFree ? 'text-muted-foreground group-hover/lec:text-foreground' : ''}`}>{p.name}</span>
                                        </span>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          {p.duration && (<span className="text-xs text-muted-foreground tabular-nums">{p.duration}</span>)}
                                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isFree ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}>{isFree ? 'FREE' : 'LOCKED'}</span>
                                        </div>
                                      </div>
                                    );
                                    if (isFree) return (<Link to={`/learn/${course.slug}`} key={p.id} className="block no-underline">{lectureElement}</Link>);
                                    return (<div key={p.id} onClick={handleLockedClick}>{lectureElement}</div>);
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

          {/* ═══════ RIGHT SIDEBAR ═══════ */}
          <aside className="lg:sticky lg:top-24 self-start anim-up anim-d1 order-1 lg:order-2">
            <Card className="overflow-hidden bg-card border-border shadow-xl shadow-black/5">
              {course.thumbnail_url && (
                <div className="relative aspect-video overflow-hidden">
                  <img src={course.thumbnail_url} alt={course.title} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                  {course.price_inr > 0 && (<div className="absolute top-3 left-3 discount-glow bg-red-500 text-white text-xs font-extrabold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1"><Flame className="w-3.5 h-3.5" />{discountDisplay.percent}% OFF</div>)}
                </div>
              )}

              <div className="p-5 space-y-4">
                {verifyingPayment ? (
                  <div className="space-y-3 py-4 text-center"><Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" /><div className="font-semibold text-lg">Verifying Payment…</div><p className="text-xs text-muted-foreground">Confirming your enrollment with Stripe. This may take a few seconds.</p></div>
                ) : enrolled ? (
                  <><div className="flex items-center gap-2 text-green-500 font-semibold text-lg"><CheckCircle2 className="w-5 h-5" /> Enrolled</div><Button asChild className="w-full" size="lg"><Link to={`/learn/${course.slug}`} className="gap-2">Continue Learning <ArrowRight className="w-4 h-4" /></Link></Button></>
                ) : (
                  <>
                    {course.price_inr > 0 && (
                      <div className="relative overflow-hidden bg-gradient-to-r from-red-500 via-red-500 to-orange-500 rounded-xl p-4 text-white">
                        <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full" /><div className="absolute -bottom-4 -left-4 w-16 h-16 bg-white/5 rounded-full" />
                        <div className="relative z-10 flex items-center justify-between">
                          <div><div className="text-3xl font-extrabold leading-none">{discountDisplay.percent}%</div><div className="text-[11px] uppercase tracking-widest opacity-80 mt-0.5 font-medium">Special Offer</div></div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 justify-end text-white/80 mb-1"><Clock className="w-3.5 h-3.5" /><span className="text-[10px] uppercase tracking-wider font-medium">Ends in</span></div>
                            <div className="flex items-center gap-1 font-mono text-lg font-extrabold tabular-nums tracking-tight">
                              <span className="bg-black/20 rounded px-1.5 py-0.5 flex items-center justify-center">{String(timeLeft.d).padStart(2, '0')}<span className="text-[9px] ml-0.5 opacity-80">D</span></span>
                              <span className="text-white/80 animate-pulse">:</span>
                              <span className="bg-black/20 rounded px-1.5 py-0.5 flex items-center justify-center">{String(timeLeft.m).padStart(2, '0')}<span className="text-[9px] ml-0.5 opacity-80">M</span></span>
                              <span className="text-white/80 animate-pulse">:</span>
                              <span className="bg-black/20 rounded px-1.5 py-0.5 flex items-center justify-center">{String(timeLeft.s).padStart(2, '0')}<span className="text-[9px] ml-0.5 opacity-80">S</span></span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {course.price_inr > 0 ? (
                        <><div className="flex items-baseline gap-3 flex-wrap"><span className="text-3xl font-extrabold text-foreground tracking-tight">{formatPriceINR(finalPrice)}</span><span className="text-base text-muted-foreground line-through decoration-red-400/60 decoration-2">{formatPriceINR(discountDisplay.original)}</span></div>
                        {discount && discount.amount > 0 && (<div className="flex items-center gap-2 text-sm"><span className="text-muted-foreground line-through text-xs">{formatPriceINR(course.price_inr)}</span><span className="text-green-600 font-semibold text-[11px] bg-green-500/10 px-2 py-0.5 rounded-full">+ Extra {formatPriceINR(discount.amount)} off</span></div>)}
                        <p className="text-xs font-semibold text-green-600 flex items-center gap-1"><Tag className="w-3 h-3" />You save {formatPriceINR(totalSavings)} on this course</p></>
                      ) : (<span className="text-3xl font-extrabold text-green-600">FREE</span>)}
                    </div>

                    {course.price_inr > 0 && (
                      <div className="flex gap-2"><Input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="Promo code" className="text-sm h-10" onKeyDown={(e) => e.key === 'Enter' && applyPromo()} /><Button variant="outline" size="sm" onClick={applyPromo} className="h-10 px-3 shrink-0"><Tag className="w-4 h-4" /></Button></div>
                    )}

                    {discount && (
                      <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2 text-sm"><span className="font-medium text-green-700">Code: {discount.code}</span><button onClick={() => setDiscount(null)} className="text-green-600 hover:text-red-500 text-xs font-semibold transition-colors">Remove</button></div>
                    )}

                    <Button className="w-full h-12 text-base font-semibold shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all" size="lg" onClick={handleEnroll} disabled={enrolling}>
                      {enrolling ? (<Loader2 className="w-5 h-5 animate-spin" />) : !user ? ('Sign in to Enroll') : finalPrice === 0 ? ('Enroll for Free') : ('Buy Now')}
                    </Button>
                    
                    {!user && (<p className="text-[11px] text-muted-foreground text-center leading-relaxed">Sign in to enroll and track your progress.</p>)}
                  </>
                )}

                {/* ─── SHARE SECTION ─── */}
                <div className="pt-2 border-t border-border/40">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">Share this course</span>
                    
                    {typeof navigator.share === 'function' ? (
                      <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleNativeShare}>
                        <Share2 className="w-3.5 h-3.5" /> Share
                      </Button>
                    ) : (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
                            <Share2 className="w-3.5 h-3.5" /> Share
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2 shadow-xl" align="end">
                          <div className="grid grid-cols-4 gap-1">
                            {/* WhatsApp */}
                            <a href={`https://wa.me/?text=${encodeURIComponent(shareText + ' ' + courseUrl)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center p-2 rounded-md hover:bg-muted transition-colors">
                              <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              <span className="text-[9px] mt-1 font-medium">WhatsApp</span>
                            </a>
                            {/* Twitter / X */}
                            <a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(courseUrl)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center p-2 rounded-md hover:bg-muted transition-colors">
                              <svg className="w-5 h-5 text-foreground" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                              <span className="text-[9px] mt-1 font-medium">X</span>
                            </a>
                            {/* LinkedIn */}
                            <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(courseUrl)}`} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center p-2 rounded-md hover:bg-muted transition-colors">
                              <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                              <span className="text-[9px] mt-1 font-medium">LinkedIn</span>
                            </a>
                            {/* Copy Link */}
                            <button onClick={copyToClipboard} className="flex flex-col items-center justify-center p-2 rounded-md hover:bg-muted transition-colors">
                              {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-muted-foreground" />}
                              <span className="text-[9px] mt-1 font-medium">{copied ? 'Copied' : 'Copy'}</span>
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>

              </div>
            </Card>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default CourseDetail;