import { useEffect, useState, useMemo, useRef, useCallback, memo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import VideoPlayer from '@/components/VideoPlayer';
import GamifyChip from '@/components/GamifyChip';
import { Button } from '@/components/ui/button';
import {
  Loader2, X, Play, Clock, ChevronRight, Radio,
  ListChecks, Trophy, ExternalLink, Lock, Menu, CheckCircle2,
  ChevronLeft, ChevronRight as ChevronRightIcon, Pause, Play as PlayIcon,
  BookOpen, GraduationCap, Video, FileDown, ArrowLeft
} from 'lucide-react';
import { completePart, awardWatchedMinute } from '@/lib/gamify';
import { useAuth } from '@/contexts/AuthContext';
import { useSEO } from '@/lib/seo';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

/* ─── Types ─── */
interface Course { id: string; title: string; [key: string]: unknown }
interface Part { id: string; name: string; video_id: string; live_url: string | null; kind: 'recorded' | 'live'; notes_url: string | null; duration: string | null; position: number; is_preview: boolean }
interface Chapter { id: string; name: string; position: number; parts: Part[] }
interface Subject { id: string; name: string; position: number; chapters: Chapter[] }
interface TestItem { id: string; title: string; scope: string; subject_id: string | null; chapter_id: string | null; duration_minutes: number | null }
interface ExtendedPart extends Part { chapterName: string; subjectName: string }

/* ─── Helpers ─── */
const parseMediaUrls = (envVar: string | undefined): readonly string[] => {
  if (!envVar) return [];
  return Object.freeze(envVar.split(',').map(u => u.trim()).filter(u => u.length > 0));
};
const DEFAULT_MEDIA_URLS = parseMediaUrls(import.meta.env.VITE_DEFAULT_GIF);
const isImg = (u: string) => /\.(gif|webp|jpg|jpeg|png)$/i.test(u);
const isVid = (u: string) => /\.(mp4|webm|ogg)$/i.test(u);

/* ─── Skeleton components ─── */
function SkelBar({ w = '100%', h = '12px', cls = '' }: { w?: string; h?: string; cls?: string }) {
  return <div className={cn("rounded bg-muted animate-pulse", cls)} style={{ width: w, height: h }} />;
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col h-full bg-card">
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2 mb-2"><div className="w-5 h-5 rounded bg-muted animate-pulse" /><SkelBar w="60%" /></div>
        <div className="flex items-center gap-2.5"><SkelBar w="40px" h="6px" /><SkelBar w="80px" h="6px" /><SkelBar w="30px" h="6px" /></div>
      </div>
      <div className="flex-1 p-3 space-y-3">
        {[...Array(4)].map((_, i) => (
          <div key={i}>
            <div className="flex items-center gap-3 mb-2"><div className="w-7 h-7 rounded-lg bg-muted animate-pulse" /><SkelBar w={`${50 + i * 10}%`} h="14px" /></div>
            <div className="ml-10 space-y-1.5">
              {[...Array(2 + (i % 2))].map((_, j) => (
                <div key={j} className="flex items-center gap-2.5"><div className="w-6 h-6 rounded-full bg-muted animate-pulse" /><SkelBar w={`${60 + j * 15}%`} h="12px" /></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Thin progress bar ─── */
function ThinProgress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1 w-full rounded-full bg-border/50 overflow-hidden", className)}>
      <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

/* ─── Playlist sidebar ─── */
const PlaylistContent = memo(({
  tree, tests, currentId, completed, testCompletions, enrolled, onSelect,
  totalCount, onClose, courseTitle, isTestCompleted
}: {
  tree: Subject[]; tests: TestItem[]; currentId: string | null; completed: Set<string>;
  testCompletions: Set<string>; enrolled: boolean; onSelect: (p: Part) => void;
  totalCount: number; onClose: () => void; courseTitle: string; isTestCompleted: (id: string) => boolean;
}) => {
  const pct = totalCount > 0 ? Math.round((completed.size / totalCount) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="shrink-0 relative z-10 px-4 pt-4 pb-3 border-b border-border/50 bg-card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-2">
              <GraduationCap className="w-5 h-5 text-primary shrink-0" />
              <h2 className="font-bold text-sm sm:text-base leading-snug line-clamp-2" title={courseTitle}>{courseTitle}</h2>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{completed.size}<span className="text-muted-foreground font-normal">/{totalCount}</span></span>
              <ThinProgress value={pct} className="flex-1 max-w-[90px] sm:max-w-[100px]" />
              <span className="tabular-nums font-medium">{pct}%</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden shrink-0 -mr-1 h-8 w-8" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain"
        style={{ scrollbarWidth: 'thin' }}
        onPointerDownCapture={e => e.stopPropagation()}
      >
        <Accordion type="multiple" className="w-full">
          {tree.map((subject, si) => {
            const subjectParts = subject.chapters.flatMap(c => c.parts);
            const subjectDone = subjectParts.filter(p => completed.has(p.id)).length;
            const subjectPct = subjectParts.length > 0 ? Math.round((subjectDone / subjectParts.length) * 100) : 0;
            const subjectTests = tests.filter(t => t.scope === 'subject' && t.subject_id === subject.id);

            return (
              <AccordionItem key={subject.id} value={subject.id} className="border-b border-border/30 last:border-0">
                <AccordionTrigger className="px-3 sm:px-4 py-2.5 sm:py-3 hover:bg-muted/30 data-[state=open]:bg-muted/20 transition-colors gap-2 group">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1 text-left">
                    <span className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-muted text-[10px] sm:text-xs font-bold flex items-center justify-center text-muted-foreground group-data-[state=open]:bg-primary/10 group-data-[state=open]:text-primary transition-colors">{si + 1}</span>
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm sm:text-base font-bold text-foreground truncate">{subject.name}</span>
                      <span className="block text-[11px] sm:text-xs text-muted-foreground/80 mt-0.5">{subjectDone}/{subjectParts.length} lectures</span>
                    </div>
                    <ThinProgress value={subjectPct} className="w-12 sm:w-14 shrink-0 hidden sm:block" />
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-1 px-1 sm:px-1.5">
                  <div className="space-y-0.5 ml-2 sm:ml-3 border-l-2 border-border/30 pl-2 sm:pl-3 my-0.5">
                    {subject.chapters.map((ch, ci) => {
                      const chapTests = tests.filter(t => t.scope === 'chapter' && t.chapter_id === ch.id);
                      const chapDone = ch.parts.filter(p => completed.has(p.id)).length;
                      return (
                        <div key={ch.id} className="mb-0.5">
                          <Accordion type="multiple" className="w-full">
                            <AccordionItem value={`${subject.id}-${ch.id}`} className="border-0">
                              <AccordionTrigger className="py-1.5 sm:py-2 px-2 text-xs sm:text-sm font-semibold text-muted-foreground hover:text-foreground data-[state=open]:text-foreground gap-2">
                                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 text-left">
                                  <span className="shrink-0 text-[10px] sm:text-xs font-mono text-muted-foreground/50 w-3.5 sm:w-4">{ci + 1}.</span>
                                  <span className="truncate flex-1">{ch.name}</span>
                                  {ch.parts.length > 0 && (
                                    <span className={cn(
                                      "text-[10px] sm:text-xs tabular-nums px-1.5 sm:px-2 py-px sm:py-0.5 rounded-full shrink-0",
                                      chapDone === ch.parts.length
                                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                        : "bg-muted text-muted-foreground"
                                    )}>{chapDone}/{ch.parts.length}</span>
                                  )}
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="pb-0.5 pt-0">
                                <div className="flex flex-col">
                                  {ch.parts.map(p => {
                                    const isActive = p.id === currentId;
                                    const isDone = completed.has(p.id);
                                    const locked = !enrolled && !p.is_preview;
                                    return (
                                      <button
                                        key={p.id}
                                        onClick={() => onSelect(p)}
                                        disabled={locked}
                                        className={cn(
                                          "group/part w-full flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2 sm:py-2.5 text-left rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                                          isActive && "bg-primary/10 text-primary",
                                          !isActive && !locked && "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                                          locked && "opacity-40 cursor-not-allowed"
                                        )}
                                        aria-current={isActive ? "step" : undefined}
                                        aria-disabled={locked}
                                      >
                                        <div className={cn(
                                          "shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full transition-colors",
                                          isDone && "bg-green-500 text-white",
                                          !isDone && isActive && "bg-primary text-primary-foreground",
                                          !isDone && !isActive && !locked && "border border-muted-foreground/25 text-muted-foreground/60 group-hover/part:border-muted-foreground/40",
                                          locked && "border border-muted-foreground/15 bg-muted/50"
                                        )}>
                                          {locked ? <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : isDone ? <CheckCircle2 className="w-3 sm:w-3.5 sm:h-3.5" /> : p.kind === 'live' ? <Radio className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-red-500" /> : <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current ml-px" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className={cn("text-xs sm:text-sm leading-snug truncate", isActive && "font-bold")}>{p.name}</p>
                                          {p.duration && (
                                            <span className="text-[10px] sm:text-xs text-muted-foreground/60 flex items-center gap-0.5 mt-px sm:mt-0.5">
                                              <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />{p.duration}
                                            </span>
                                          )}
                                        </div>
                                        {isActive && <span className="shrink-0 w-[3px] h-4 sm:h-5 rounded-full bg-primary animate-pulse" />}
                                      </button>
                                    );
                                  })}

                                  {chapTests.map(t => {
                                    const done = isTestCompleted(t.id);
                                    return (
                                      <Link key={t.id} to={`/test/${t.id}`} className="flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg text-primary/80 hover:bg-primary/5 hover:text-primary transition-colors">
                                        <div className={cn("shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full border", done ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground/25 text-muted-foreground/60")}>
                                          {done ? <CheckCircle2 className="w-3 sm:w-3.5 sm:h-3.5" /> : <ListChecks className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                                        </div>
                                        <span className="text-xs sm:text-sm truncate flex-1">{t.title}</span>
                                        {done && <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 shrink-0">Done</span>}
                                      </Link>
                                    );
                                  })}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      );
                    })}

                    {subjectTests.map(t => {
                      const done = isTestCompleted(t.id);
                      return (
                        <Link key={t.id} to={`/test/${t.id}`} className={cn(
                          "flex items-center gap-2 sm:gap-2.5 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg mx-0.5 mt-1 sm:mt-1.5 border transition-colors group",
                          done ? "border-green-200 dark:border-green-900/40 bg-green-50/50 dark:bg-green-900/10" : "border-primary/10 bg-primary/[0.02] hover:bg-primary/[0.06] text-primary"
                        )}>
                          <div className={cn("shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full border", done ? "border-green-500 bg-green-500 text-white" : "border-primary/25 text-primary/60")}>
                            {done ? <CheckCircle2 className="w-3 sm:w-3.5 sm:h-3.5" /> : <Trophy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                          </div>
                          <span className="text-xs sm:text-sm font-medium truncate flex-1">{t.title}</span>
                          <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 opacity-40 group-hover:opacity-80 transition-opacity shrink-0" />
                        </Link>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>

        {tests.filter(t => t.scope === 'course').map(t => {
          const done = isTestCompleted(t.id);
          return (
            <div key={t.id} className="p-2.5 sm:p-3 border-t border-border/40">
              <Link to={`/test/${t.id}`} className={cn(
                "flex items-center gap-2.5 sm:gap-3 w-full p-3 sm:p-3.5 rounded-xl transition-all group",
                done
                  ? "bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30"
                  : "bg-gradient-to-r from-primary/90 to-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25"
              )}>
                <div className={cn("w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0", done ? "bg-green-500 text-white" : "bg-white/15")}>
                  {done ? <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" /> : <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-yellow-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-xs sm:text-sm block truncate">Final Assessment</span>
                  <span className={cn("text-[11px] sm:text-xs block truncate", done ? "text-green-700 dark:text-green-400" : "text-primary-foreground/80")}>{t.title}</span>
                </div>
                <ChevronRight className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 group-hover:translate-x-0.5 transition-transform", done ? "text-green-600 dark:text-green-400" : "text-primary-foreground/60")} />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
});
PlaylistContent.displayName = 'PlaylistContent';

/* ─── Main ─── */
const Learn = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Phase 1: course metadata (fast — single row)
  const [course, setCourse] = useState<Course | null>(null);
  const [courseErr, setCourseErr] = useState(false);

  // Phase 2: tree, tests, progress (heavier)
  const [tree, setTree] = useState<Subject[]>([]);
  const [tests, setTests] = useState<TestItem[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [testCompletions, setTestCompletions] = useState<Set<string>>(new Set());
  const [enrolled, setEnrolled] = useState(false);
  const [contentReady, setContentReady] = useState(false);

  const [currentPartId, setCurrentPartId] = useState<string | null>(null);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [watchPct, setWatchPct] = useState(0);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isCarouselPaused, setIsCarouselPaused] = useState(false);
  const carouselRef = useRef<number | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  const seoTitle = useMemo(() => course ? `Learn: ${course.title}` : 'Learning', [course]);
  useSEO({ title: seoTitle, description: 'Continue your learning on LearnHub' });

  /* ─── Phase 1: Load course row (instant) ─── */
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!slug) { if (mounted) setCourseErr(true); return; }
      try {
        const { data } = await supabase.from('courses').select('id,title,slug').eq('slug', slug).maybeSingle();
        if (!mounted) return;
        if (data) setCourse(data as Course);
        else setCourseErr(true);
      } catch { if (mounted) setCourseErr(true); }
    };
    load();
    return () => { mounted = false; };
  }, [slug]);

  /* ─── Phase 2: Load tree + tests + progress (after course) ─── */
  useEffect(() => {
    if (!course) return;
    let mounted = true;
    const load = async () => {
      try {
        const [enrollRes, treeRes, testRes] = await Promise.all([
          user ? supabase.from('enrollments').select('id').eq('user_id', user.id).eq('course_id', course.id).maybeSingle() : Promise.resolve(null),
          supabase.from('subjects')
            .select('id, name, position, chapters(id, name, position, parts(id, name, kind, live_url, video_id, notes_url, duration, position, is_preview))')
            .eq('course_id', course.id).order('position'),
          supabase.from('tests').select('id, title, scope, subject_id, chapter_id, duration_minutes').eq('course_id', course.id).eq('is_published', true),
        ]);
        if (!mounted) return;

        if (enrollRes?.data) setEnrolled(true);

        const sorted: Subject[] = (treeRes.data || []).map((s: any) => ({
          ...s,
          chapters: (s.chapters || []).sort((a: any, b: any) => a.position - b.position).map((ch: any) => ({
            ...ch, parts: (ch.parts || []).sort((a: any, b: any) => a.position - b.position),
          })),
        }));
        setTree(sorted);
        setTests(testRes.data || []);

        if (user) {
          const [progRes, attRes] = await Promise.all([
            supabase.from('progress').select('part_id').eq('user_id', user.id).eq('completed', true),
            supabase.from('test_attempts').select('test_id, finished_at').eq('user_id', user.id),
          ]);
          if (!mounted) return;
          setCompleted(new Set((progRes.data || []).map((p: any) => p.part_id)));
          const ct = new Set<string>();
          attRes.data?.forEach((a: any) => { if (a.finished_at) ct.add(a.test_id); });
          setTestCompletions(ct);
        }
      } catch (e) { console.error(e); }
      finally { if (mounted) setContentReady(true); }
    };
    load();
    return () => { mounted = false; };
  }, [course?.id, user?.id]);

  const allParts = useMemo(() =>
    tree.flatMap(s => s.chapters.flatMap(ch => ch.parts.map(p => ({ ...p, chapterName: ch.name, subjectName: s.name } as ExtendedPart)))),
  [tree]);

  const currentPart = useMemo(() => {
    if (!currentPartId || !allParts.length) return undefined;
    return allParts.find(p => p.id === currentPartId);
  }, [allParts, currentPartId]);

  useEffect(() => { if (currentPartId && mainRef.current) mainRef.current.focus(); }, [currentPartId]);
  useEffect(() => () => { if (carouselRef.current) clearInterval(carouselRef.current); }, []);

  // Carousel
  useEffect(() => {
    if (DEFAULT_MEDIA_URLS.length <= 1 || currentPartId || isCarouselPaused) {
      if (carouselRef.current) { clearInterval(carouselRef.current); carouselRef.current = null; }
      return;
    }
    carouselRef.current = window.setInterval(() => setCurrentMediaIndex(p => (p + 1) % DEFAULT_MEDIA_URLS.length), 5000);
    return () => { if (carouselRef.current) { clearInterval(carouselRef.current); carouselRef.current = null; } };
  }, [currentPartId, isCarouselPaused]);

  const handleComplete = useCallback(async () => {
    if (!user || !currentPart || !course || completed.has(currentPart.id)) return;
    try {
      await completePart(user.id, currentPart.id, course.id);
      setCompleted(p => new Set(p).add(currentPart.id));
      toast.success('Lecture completed!');
    } catch (e) { console.error(e); }
  }, [user, currentPart, course, completed]);

  const handleMinuteWatched = useCallback(async (min: number) => {
    if (!user || !currentPart || !course || currentPart.kind !== 'recorded') return;
    try {
      const ok = await awardWatchedMinute(user.id, currentPart.id, min, course.id);
      if (ok) toast.success('+1 coin', { duration: 1200 });
    } catch (e) { console.error(e); }
  }, [user, currentPart, course]);

  const selectPart = useCallback((p: Part) => {
    if (!enrolled && !p.is_preview) { toast.error('Enroll to unlock this lecture'); return; }
    setCurrentPartId(p.id);
    setWatchPct(0);
    if (window.innerWidth < 1024) setShowPlaylist(false);
  }, [enrolled]);

  const isTestCompleted = useCallback((id: string) => testCompletions.has(id), [testCompletions]);
  const goMedia = useCallback((d: number) => { setIsCarouselPaused(true); setCurrentMediaIndex(p => (p + d + DEFAULT_MEDIA_URLS.length) % DEFAULT_MEDIA_URLS.length); }, []);
  const goMediaIdx = useCallback((i: number) => { setIsCarouselPaused(true); setCurrentMediaIndex(i); }, []);
  const togglePause = useCallback(() => setIsCarouselPaused(p => !p), []);

  /* ─── Early returns with proper layout ─── */
  if (courseErr) return (
    <div className="flex flex-col items-center justify-center h-[100dvh] gap-3 bg-background px-4 text-center">
      <BookOpen className="w-8 h-8 text-muted-foreground/40" />
      <span className="text-sm text-muted-foreground">Course not found</span>
      <Button variant="outline" size="sm" onClick={() => navigate('/courses')}>Browse Courses</Button>
    </div>
  );

  if (!course) return (
    <div className="flex items-center justify-center h-[100dvh] bg-background">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  );

  const hasContent = allParts.length > 0;

  return (
    <div className="flex h-[100dvh] lg:h-screen overflow-hidden bg-background" role="application" aria-label={`Learning: ${course.title}`}>

      {/* ─── Sidebar ─── */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 bg-card border-r border-border/60 shadow-2xl lg:shadow-none flex flex-col",
          "w-[min(82vw,320px)] sm:w-[340px] md:w-[350px] lg:w-[360px] xl:w-[390px]",
          "transform transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]",
          showPlaylist ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          "[&_*]:![text-decoration-line:none]"
        )}
        aria-label="Course navigation"
      >
        {contentReady
          ? <PlaylistContent tree={tree} tests={tests} currentId={currentPartId} completed={completed} testCompletions={testCompletions} enrolled={enrolled} onSelect={selectPart} totalCount={allParts.length} onClose={() => setShowPlaylist(false)} courseTitle={course.title} isTestCompleted={isTestCompleted} />
          : <SidebarSkeleton />
        }
      </aside>

      {/* Mobile backdrop */}
      <div className={cn("fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 lg:hidden transition-opacity duration-300", showPlaylist ? "opacity-100 pointer-events-auto touch-none" : "opacity-0 pointer-events-none")} onClick={() => setShowPlaylist(false)} aria-hidden="true" />

      {/* ─── Main ─── */}
      <main ref={mainRef} tabIndex={-1} className="flex-1 flex flex-col min-w-0 overflow-y-auto lg:overflow-hidden bg-background outline-none">

        {/* Header */}
        <header className="shrink-0 flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 h-11 sm:h-12 border-b border-border/50 bg-card z-30">
          <Button variant="ghost" size="icon" className="lg:hidden shrink-0 h-8 w-8 -ml-0.5" onClick={() => setShowPlaylist(true)} aria-label="Open navigation">
            <Menu className="w-[17px] h-[17px]" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-1 shrink-0 h-8 text-muted-foreground hover:text-foreground" asChild>
            <Link to={`/courses/${slug}`}><ArrowLeft className="w-3.5 h-3.5" /><span className="hidden md:inline text-xs">Back</span></Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xs sm:text-sm font-semibold truncate" title={course.title}>{course.title}</h1>
          </div>
          {user && <GamifyChip />}
        </header>

        {/* ─── Video ─── */}
        <div className="shrink-0 relative w-full bg-black aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0">
          <div className="absolute inset-0">

            {currentPart?.kind === 'live' && currentPart.live_url ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-white gap-4 sm:gap-5 p-4 sm:p-6 text-center">
                <div className="relative">
                  <div className="absolute -inset-3 sm:-inset-4 bg-red-500/15 blur-2xl animate-pulse rounded-full" />
                  <div className="absolute -inset-1.5 sm:-inset-2 bg-red-500/20 blur-lg animate-ping rounded-full" style={{ animationDuration: '2s' }} />
                  <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center">
                    <Radio className="w-7 h-7 sm:w-9 sm:h-9 text-red-500" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-red-500 border-2 border-zinc-950 animate-pulse" />
                </div>
                <div className="max-w-sm">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-600/20 border border-red-500/30 text-red-400 text-[10px] sm:text-xs font-semibold uppercase tracking-wider mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Live Now
                  </span>
                  <h3 className="text-lg sm:text-xl font-bold mb-0.5 sm:mb-1">{currentPart.name}</h3>
                  <p className="text-zinc-400 text-xs sm:text-sm">This session is streaming live right now</p>
                </div>
                <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-2 shadow-lg shadow-red-900/30">
                  <a href={currentPart.live_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4" />Join Live</a>
                </Button>
              </div>

            ) : currentPart?.kind === 'recorded' ? (
              <VideoPlayer key={currentPart.id} video={{ id: currentPart.video_id, title: currentPart.name, duration: currentPart.duration ?? undefined }} onProgress={setWatchPct} onComplete={handleComplete} onMinuteWatched={handleMinuteWatched} />

            ) : currentPart ? (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-zinc-500 text-sm">Video not available</div>

            ) : !hasContent && contentReady ? (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <Video className="w-10 h-10 sm:w-12 sm:h-12 text-zinc-600" />
              </div>

            ) : !currentPart && contentReady ? (
              /* AD carousel — only if no lecture selected */
              DEFAULT_MEDIA_URLS.length > 0 ? (
                <>
                  <div className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-20">
                    <span className="bg-red-600 text-white text-[8px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-px sm:py-0.5 rounded uppercase tracking-widest shadow">Ad</span>
                  </div>
                  {DEFAULT_MEDIA_URLS.length > 1 && (
                    <>
                      <button onClick={() => goMedia(-1)} className="absolute left-1.5 sm:left-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center transition-colors" aria-label="Previous"><ChevronLeft className="w-3.5 h-3.5" /></button>
                      <button onClick={() => goMedia(1)} className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full h-6 w-6 sm:h-7 sm:w-7 flex items-center justify-center transition-colors" aria-label="Next"><ChevronRightIcon className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
                    {isImg(DEFAULT_MEDIA_URLS[currentMediaIndex]) ? (
                      <img src={DEFAULT_MEDIA_URLS[currentMediaIndex]} alt="" loading="lazy" className="max-w-full max-h-full object-contain" />
                    ) : isVid(DEFAULT_MEDIA_URLS[currentMediaIndex]) ? (
                      <video src={DEFAULT_MEDIA_URLS[currentMediaIndex]} className="max-w-full max-h-full object-contain" autoPlay loop muted playsInline preload="metadata" />
                    ) : null}
                  </div>
                  {DEFAULT_MEDIA_URLS.length > 1 && (
                    <div className="absolute bottom-2 sm:bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 sm:gap-1.5">
                      <div className="flex items-center gap-0.5 sm:gap-1 bg-black/50 backdrop-blur-sm px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-full">
                        {DEFAULT_MEDIA_URLS.map((_, i) => (
                          <button key={i} onClick={() => goMediaIdx(i)} className={cn("rounded-full transition-all", i === currentMediaIndex ? "bg-white w-3.5 h-1 sm:w-4 sm:h-1.5" : "bg-white/40 hover:bg-white/60 w-1.5 h-1 sm:w-1.5 sm:h-1.5")} aria-label={`Slide ${i + 1}`} />
                        ))}
                      </div>
                      <button onClick={togglePause} className="bg-black/50 backdrop-blur-sm hover:bg-black/60 text-white rounded-full h-5 w-5 sm:h-6 sm:w-6 flex items-center justify-center transition-colors" aria-label={isCarouselPaused ? "Play" : "Pause"}>
                        {isCarouselPaused ? <PlayIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 ml-px" /> : <Pause className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                      </button>
                    </div>
                  )}
                </>
              ) : null
            ) : (
              /* Skeleton while content loads */
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
              </div>
            )}
          </div>

          {currentPart?.kind === 'recorded' && watchPct > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 z-50">
              <div className="h-full bg-primary/80 transition-all duration-700 ease-out" style={{ width: `${watchPct}%` }} />
            </div>
          )}
        </div>

        {/* ─── Info below video ─── */}
        <div className="shrink-0 bg-card border-t border-border">
          {currentPart ? (
            <div className="px-3 sm:px-5 lg:px-6 py-2.5 sm:py-3">
              <div className="flex items-start gap-2.5 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base lg:text-lg font-bold text-foreground leading-tight break-words">{currentPart.name}</h2>
                  <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5 sm:gap-y-1 mt-1 sm:mt-1.5 text-xs sm:text-sm text-muted-foreground">
                    <span className="font-semibold text-primary">{currentPart.subjectName}</span>
                    <span className="text-border">·</span>
                    <span>{currentPart.chapterName}</span>
                    {currentPart.duration && (<><span className="text-border">·</span><span className="flex items-center gap-0.5"><Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />{currentPart.duration}</span></>)}
                    {currentPart.kind === 'live' && (<><span className="text-border">·</span><span className="flex items-center gap-0.5 text-red-500 font-medium"><Radio className="w-3 h-3 sm:w-3.5 sm:h-3.5" />Live</span></>)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pt-0.5">
                  {completed.has(currentPart.id) && (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-500 font-semibold text-[11px] sm:text-xs bg-green-50 dark:bg-green-900/20 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full border border-green-200 dark:border-green-900/30">
                      <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />Done
                    </span>
                  )}
                  {currentPart.notes_url && (
                    <Button variant="outline" size="sm" asChild className="h-8 sm:h-9 text-xs sm:text-sm gap-1 sm:gap-1.5 shrink-0">
                      <a href={currentPart.notes_url} target="_blank" rel="noopener noreferrer"><FileDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />Notes</a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
};

export default Learn;