import { useEffect, useState, useMemo, useRef, useCallback, memo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import VideoPlayer from "@/components/VideoPlayer";
import GamifyChip from "@/components/GamifyChip";
import CommentUI from "@/components/CommentUI";
import { Button } from "@/components/ui/button";
import {
  Loader2, X, Play, Clock, ChevronRight, Radio, ListChecks, Trophy,
  ExternalLink, Lock, Menu, CheckCircle2, ChevronLeft,
  ChevronRight as ChevronRightIcon, Pause, Play as PlayIcon,
  BookOpen, GraduationCap, Video, FileDown, ArrowLeft, MessageCircle,
} from "lucide-react";
import { completePart, awardWatchedMinute } from "@/lib/gamify";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/lib/seo";
import { toast } from "sonner";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────
interface Course { id: string; title: string; [k: string]: unknown }
interface Part { id: string; name: string; video_id: string; live_url: string | null; kind: "recorded" | "live"; notes_url: string | null; duration: string | null; position: number; is_preview: boolean }
interface Chapter { id: string; name: string; position: number; parts: Part[] }
interface Subject { id: string; name: string; position: number; chapters: Chapter[] }
interface TestItem { id: string; title: string; scope: string; subject_id: string | null; chapter_id: string | null; duration_minutes: number | null }
interface ExtendedPart extends Part { chapterName: string; subjectName: string }

// ─── Helpers ────────────────────────────────────────────
const parseMediaUrls = (v: string | undefined): readonly string[] => {
  if (!v) return [];
  return Object.freeze(v.split(",").map((s) => s.trim()).filter(Boolean));
};
const MEDIA = parseMediaUrls(import.meta.env.VITE_DEFAULT_GIF);
const isImg = (u: string) => /\.(gif|webp|jpe?g|png)$/i.test(u);
const isVid = (u: string) => /\.(mp4|webm|ogg)$/i.test(u);

// ─── Skeletons ──────────────────────────────────────────
function Skel({ w = "100%", h = "12px", c = "" }: { w?: string; h?: string; c?: string }) {
  return <div className={cn("rounded bg-muted animate-pulse", c)} style={{ width: w, height: h }} />;
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col h-full bg-card">
      <div className="shrink-0 px-4 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2 mb-2"><div className="w-5 h-5 rounded bg-muted animate-pulse" /><Skel w="60%" /></div>
        <div className="flex items-center gap-2.5"><Skel w="40px" h="6px" /><Skel w="80px" h="6px" /><Skel w="30px" h="6px" /></div>
      </div>
      <div className="flex-1 p-3 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i}>
            <div className="flex items-center gap-3 mb-2"><div className="w-7 h-7 rounded-lg bg-muted animate-pulse" /><Skel w={`${50 + i * 10}%`} h="14px" /></div>
            <div className="ml-10 space-y-1.5">
              {[0, 1, 2].slice(0, 2 + (i % 2)).map((j) => (
                <div key={j} className="flex items-center gap-2.5"><div className="w-6 h-6 rounded-full bg-muted animate-pulse" /><Skel w={`${60 + j * 15}%`} h="12px" /></div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Thin Progress ──────────────────────────────────────
function ThinBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-1 w-full rounded-full bg-border/50 overflow-hidden", className)}>
      <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// ─── Playlist ───────────────────────────────────────────
const Playlist = memo(({
  tree, tests, currentId, completed, testCompletions, enrolled, onSelect, total, onClose, title, isTestDone,
}: {
  tree: Subject[]; tests: TestItem[]; currentId: string | null; completed: Set<string>; testCompletions: Set<string>;
  enrolled: boolean; onSelect: (p: Part) => void; total: number; onClose: () => void; title: string; isTestDone: (id: string) => boolean;
}) => {
  const pct = total > 0 ? Math.round((completed.size / total) * 100) : 0;

  return (
    <div className="flex flex-col h-full bg-card">
      {/* ── Header ── */}
      <div className="shrink-0 relative z-10 px-3 sm:px-4 pt-3 sm:pt-4 pb-2.5 sm:pb-3 border-b border-border/50 bg-card">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
              <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
              <h2 className="font-bold text-xs sm:text-sm leading-snug line-clamp-2" title={title}>{title}</h2>
            </div>
            <div className="flex items-center gap-2 sm:gap-2.5 text-[11px] sm:text-xs text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{completed.size}<span className="text-muted-foreground font-normal">/{total}</span></span>
              <ThinBar value={pct} className="flex-1 max-w-[80px] sm:max-w-[100px]" />
              <span className="tabular-nums font-medium">{pct}%</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden shrink-0 -mr-1 h-7 w-7 sm:h-8 sm:w-8" onClick={onClose} aria-label="Close"><X className="w-3.5 h-3.5 sm:w-4 sm:h-4" /></Button>
        </div>
      </div>

      {/* ── Scrollable Tree ── */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain" style={{ scrollbarWidth: "thin" }} onPointerDownCapture={(e) => e.stopPropagation()}>
        <Accordion type="multiple" className="w-full">
          {tree.map((subj, si) => {
            const sParts = subj.chapters.flatMap((c) => c.parts);
            const sDone = sParts.filter((p) => completed.has(p.id)).length;
            const sPct = sParts.length > 0 ? Math.round((sDone / sParts.length) * 100) : 0;
            const sTests = tests.filter((t) => t.scope === "subject" && t.subject_id === subj.id);
            return (
              <AccordionItem key={subj.id} value={subj.id} className="border-b border-border/30 last:border-0">
                {/* ── SUBJECT — h5 size ── */}
                <AccordionTrigger className="px-2.5 sm:px-4 py-2 sm:py-3 hover:bg-muted/30 data-[state=open]:bg-muted/20 transition-colors gap-2 group">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 text-left">
                    <span className="shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-muted text-[10px] sm:text-xs font-bold flex items-center justify-center text-muted-foreground group-data-[state=open]:bg-primary/10 group-data-[state=open]:text-primary transition-colors">{si + 1}</span>
                    <div className="min-w-0 flex-1">
                      {/* h5: text-base sm:text-lg */}
                      <span className="block text-[15px] sm:text-lg font-bold text-foreground leading-tight truncate">{subj.name}</span>
                      <span className="block text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5">{sDone}/{sParts.length} lectures</span>
                    </div>
                    <ThinBar value={sPct} className="w-10 sm:w-14 shrink-0 hidden sm:block" />
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pb-1 px-0.5 sm:px-1">
                  <div className="space-y-0.5 ml-1.5 sm:ml-3 border-l-2 border-border/30 pl-2 sm:pl-3 my-0.5">
                    {subj.chapters.map((ch, ci) => {
                      const cTests = tests.filter((t) => t.scope === "chapter" && t.chapter_id === ch.id);
                      const cDone = ch.parts.filter((p) => completed.has(p.id)).length;
                      return (
                        <div key={ch.id} className="mb-0.5">
                          <Accordion type="multiple" className="w-full">
                            <AccordionItem value={`${subj.id}-${ch.id}`} className="border-0">
                              {/* ── CHAPTER — h3 size ── */}
                              <AccordionTrigger className="py-1.5 sm:py-2 px-1.5 sm:px-2 gap-2 group/ch">
                                <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 text-left">
                                  <span className="shrink-0 text-[10px] sm:text-xs font-mono text-muted-foreground/40 w-3 sm:w-4">{ci + 1}.</span>
                                  {/* h3: text-lg sm:text-xl */}
                                  <span className="truncate flex-1 text-[15px] sm:text-xl font-bold text-muted-foreground group-hover/ch:text-foreground data-[state=open]:text-foreground transition-colors">{ch.name}</span>
                                  {ch.parts.length > 0 && (
                                    <span className={cn(
                                      "text-[9px] sm:text-[11px] tabular-nums px-1.5 sm:px-2 py-px sm:py-0.5 rounded-full shrink-0",
                                      cDone === ch.parts.length
                                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                        : "bg-muted text-muted-foreground"
                                    )}>{cDone}/{ch.parts.length}</span>
                                  )}
                                </div>
                              </AccordionTrigger>

                              <AccordionContent className="pb-0.5 pt-0">
                                <div className="flex flex-col">
                                  {/* ── PART / LECTURE — h7 size ── */}
                                  {ch.parts.map((p) => {
                                    const active = p.id === currentId;
                                    const done = completed.has(p.id);
                                    const locked = !enrolled && !p.is_preview;
                                    return (
                                      <button
                                        key={p.id}
                                        onClick={() => onSelect(p)}
                                        disabled={locked}
                                        className={cn(
                                          "group/p w-full flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-2 sm:py-2.5 text-left rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
                                          active && "bg-primary/10 text-primary",
                                          !active && !locked && "hover:bg-muted/50 text-muted-foreground hover:text-foreground",
                                          locked && "opacity-40 cursor-not-allowed"
                                        )}
                                        aria-current={active ? "step" : undefined}
                                        aria-disabled={locked}
                                      >
                                        <div className={cn(
                                          "shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full transition-colors",
                                          done && "bg-green-500 text-white",
                                          !done && active && "bg-primary text-primary-foreground",
                                          !done && !active && !locked && "border border-muted-foreground/25 text-muted-foreground/60 group-hover/p:border-muted-foreground/40",
                                          locked && "border border-muted-foreground/15 bg-muted/50"
                                        )}>
                                          {locked
                                            ? <Lock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                            : done
                                              ? <CheckCircle2 className="w-3 sm:w-3.5 sm:h-3.5" />
                                              : p.kind === "live"
                                                ? <Radio className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-red-500" />
                                                : <Play className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current ml-px" />
                                          }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          {/* h7: text-[11px] sm:text-xs lg:text-sm */}
                                          <p className={cn(
                                            "text-[11px] sm:text-xs lg:text-sm leading-snug truncate",
                                            active && "font-bold"
                                          )}>{p.name}</p>
                                          {p.duration && (
                                            <span className="text-[9px] sm:text-[11px] lg:text-xs text-muted-foreground/60 flex items-center gap-0.5 mt-px">
                                              <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />{p.duration}
                                            </span>
                                          )}
                                        </div>
                                        {active && <span className="shrink-0 w-[3px] h-4 sm:h-5 rounded-full bg-primary animate-pulse" />}
                                      </button>
                                    );
                                  })}

                                  {/* Chapter-level tests */}
                                  {cTests.map((t) => {
                                    const done = isTestDone(t.id);
                                    return (
                                      <Link
                                        key={t.id}
                                        to={`/test/${t.id}`}
                                        className="flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg text-primary/80 hover:bg-primary/5 hover:text-primary transition-colors"
                                      >
                                        <div className={cn(
                                          "shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full border",
                                          done ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground/25 text-muted-foreground/60"
                                        )}>
                                          {done ? <CheckCircle2 className="w-3 sm:w-3.5 sm:h-3.5" /> : <ListChecks className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                                        </div>
                                        <span className="text-[11px] sm:text-xs lg:text-sm truncate flex-1">{t.title}</span>
                                        {done && <span className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 shrink-0">Done</span>}
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

                    {/* Subject-level tests */}
                    {sTests.map((t) => {
                      const done = isTestDone(t.id);
                      return (
                        <Link
                          key={t.id}
                          to={`/test/${t.id}`}
                          className={cn(
                            "flex items-center gap-2 sm:gap-2.5 px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg mx-0.5 mt-1 sm:mt-1.5 border transition-colors group",
                            done
                              ? "border-green-200 dark:border-green-900/40 bg-green-50/50 dark:bg-green-900/10"
                              : "border-primary/10 bg-primary/[0.02] hover:bg-primary/[0.06] text-primary"
                          )}
                        >
                          <div className={cn(
                            "shrink-0 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full border",
                            done ? "border-green-500 bg-green-500 text-white" : "border-primary/25 text-primary/60"
                          )}>
                            {done ? <CheckCircle2 className="w-3 sm:w-3.5 sm:h-3.5" /> : <Trophy className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                          </div>
                          <span className="text-[11px] sm:text-xs lg:text-sm font-medium truncate flex-1">{t.title}</span>
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

        {/* ── Course-level tests ── */}
        {tests.filter((t) => t.scope === "course").map((t) => {
          const done = isTestDone(t.id);
          return (
            <div key={t.id} className="p-2 sm:p-3 border-t border-border/40">
              <Link
                to={`/test/${t.id}`}
                className={cn(
                  "flex items-center gap-2.5 sm:gap-3 w-full p-2.5 sm:p-3.5 rounded-xl transition-all group",
                  done
                    ? "bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-900/30"
                    : "bg-gradient-to-r from-primary/90 to-primary text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25"
                )}
              >
                <div className={cn(
                  "w-7 h-7 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0",
                  done ? "bg-green-500 text-white" : "bg-white/15"
                )}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-5 sm:h-5" /> : <Trophy className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-yellow-300" />}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-[11px] sm:text-sm block truncate">Final Assessment</span>
                  <span className={cn("text-[10px] sm:text-xs block truncate", done ? "text-green-700 dark:text-green-400" : "text-primary-foreground/80")}>{t.title}</span>
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
Playlist.displayName = "Playlist";

// ─── Main Page ──────────────────────────────────────────
export default function Learn() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [course, setCourse] = useState<Course | null>(null);
  const [courseErr, setCourseErr] = useState(false);
  const [tree, setTree] = useState<Subject[]>([]);
  const [tests, setTests] = useState<TestItem[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [testCompletions, setTestCompletions] = useState<Set<string>>(new Set());
  const [enrolled, setEnrolled] = useState(false);
  const [ready, setReady] = useState(false);
  const [partId, setPartId] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(false);
  const [watchPct, setWatchPct] = useState(0);
  const [commentOpen, setCommentOpen] = useState(false);
  const [mediaIdx, setMediaIdx] = useState(0);
  const [mediaPaused, setMediaPaused] = useState(false);
  const carouselTimer = useRef<number | null>(null);
  const mainRef = useRef<HTMLDivElement>(null);

  useSEO({ title: course ? `Learn: ${course.title}` : "Learning", description: "Continue your learning on LearnHub" });

  // Phase 1 — course row
  useEffect(() => {
    let alive = true;
    if (!slug) { setCourseErr(true); return; }
    (async () => {
      try {
        const { data } = await supabase.from("courses").select("id,title,slug").eq("slug", slug).maybeSingle();
        if (!alive) return;
        if (data) setCourse(data as Course);
        else setCourseErr(true);
      } catch (err) {
        if (alive) setCourseErr(true);
      }
    })();
    return () => { alive = false; };
  }, [slug]);

  // Phase 2 — tree + progress
  useEffect(() => {
    if (!course) return;
    let alive = true;
    (async () => {
      try {
        const [er, tr, tsr] = await Promise.all([
          user ? supabase.from("enrollments").select("id").eq("user_id", user.id).eq("course_id", course.id).maybeSingle() : null,
          supabase.from("subjects").select("id,name,position,chapters(id,name,position,parts(id,name,kind,live_url,video_id,notes_url,duration,position,is_preview))").eq("course_id", course.id).order("position"),
          supabase.from("tests").select("id,title,scope,subject_id,chapter_id,duration_minutes").eq("course_id", course.id).eq("is_published", true),
        ]);
        if (!alive) return;

        if (er?.data) setEnrolled(true);

        setTree((tr.data || []).map((s: any) => ({
          ...s,
          chapters: (s.chapters || [])
            .sort((a: any, b: any) => a.position - b.position)
            .map((c: any) => ({
              ...c,
              parts: (c.parts || []).sort((a: any, b: any) => a.position - b.position),
            })),
        })));
        setTests(tsr.data || []);

        if (user) {
          const [pr, ar] = await Promise.all([
            supabase.from("progress").select("part_id").eq("user_id", user.id).eq("completed", true),
            supabase.from("test_attempts").select("test_id,finished_at").eq("user_id", user.id),
          ]);
          if (!alive) return;
          setCompleted(new Set((pr.data || []).map((p: any) => p.part_id)));
          const tc = new Set<string>();
          ar.data?.forEach((a: any) => { if (a.finished_at) tc.add(a.test_id); });
          setTestCompletions(tc);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [course?.id, user?.id]);

  const allParts = useMemo(() => tree.flatMap((s) => s.chapters.flatMap((c) => c.parts.map((p) => ({ ...p, chapterName: c.name, subjectName: s.name })))) as ExtendedPart[], [tree]);

  const current = useMemo(() => (partId ? allParts.find((p) => p.id === partId) : undefined), [allParts, partId]);

  const isRecorded = current?.kind === "recorded";

  useEffect(() => {
    if (current && current.kind !== "recorded") setCommentOpen(false);
  }, [current?.kind]);

  useEffect(() => {
    if (partId) mainRef.current?.focus();
  }, [partId]);

  useEffect(() => () => {
    if (carouselTimer.current) clearInterval(carouselTimer.current);
  }, []);

  useEffect(() => {
    if (MEDIA.length <= 1 || partId || mediaPaused) {
      if (carouselTimer.current) { clearInterval(carouselTimer.current); carouselTimer.current = null; }
      return;
    }
    carouselTimer.current = window.setInterval(() => setMediaIdx((i) => (i + 1) % MEDIA.length), 5000);
    return () => {
      if (carouselTimer.current) { clearInterval(carouselTimer.current); carouselTimer.current = null; }
    };
  }, [partId, mediaPaused]);

  const handleComplete = useCallback(async () => {
    if (!user || !current || !course || completed.has(current.id)) return;
    try {
      await completePart(user.id, current.id, course.id);
      setCompleted((s) => new Set(s).add(current.id));
      toast.success("Lecture completed!");
    } catch (e) { console.error(e); }
  }, [user, current, course, completed]);

  const handleMinute = useCallback(async (min: number) => {
    if (!user || !current || !course || current.kind !== "recorded") return;
    try {
      const ok = await awardWatchedMinute(user.id, current.id, min, course.id);
      if (ok) toast.success("+1 coin", { duration: 1200 });
    } catch (e) { console.error(e); }
  }, [user, current, course]);

  const selectPart = useCallback((p: Part) => {
    if (!enrolled && !p.is_preview) { toast.error("Enroll to unlock this lecture"); return; }
    setPartId(p.id);
    setWatchPct(0);
    setCommentOpen(false);
    if (window.innerWidth < 1024) setSidebar(false);
  }, [enrolled]);

  const toggleComment = useCallback(() => {
    if (!isRecorded) return;
    setCommentOpen((v) => !v);
  }, [isRecorded]);

  const testDone = useCallback((id: string) => testCompletions.has(id), [testCompletions]);
  const goMedia = useCallback((d: number) => { setMediaPaused(true); setMediaIdx((i) => (i + d + MEDIA.length) % MEDIA.length); }, []);
  const goMediaTo = useCallback((i: number) => { setMediaPaused(true); setMediaIdx(i); }, []);

  if (courseErr) return (
    <div className="flex flex-col items-center justify-center h-[100dvh] gap-3 bg-background px-4 text-center">
      <BookOpen className="w-8 h-8 text-muted-foreground/40" />
      <span className="text-sm text-muted-foreground">Course not found</span>
      <Button variant="outline" size="sm" onClick={() => navigate("/courses")}>Browse Courses</Button>
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
          /* Responsive widths */
          "w-[78vw] sm:w-[320px] md:w-[340px] lg:w-[340px] xl:w-[380px] 2xl:w-[400px]",
          /* Slide transition */
          "transform transition-transform duration-300 ease-[cubic-bezier(.4,0,.2,1)]",
          sidebar ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          "[&_*]:![text-decoration-line:none]"
        )}
        aria-label="Course navigation"
      >
        {ready ? (
          <Playlist
            tree={tree} tests={tests} currentId={partId} completed={completed}
            testCompletions={testCompletions} enrolled={enrolled} onSelect={selectPart}
            total={allParts.length} onClose={() => setSidebar(false)} title={course.title} isTestDone={testDone}
          />
        ) : (
          <SidebarSkeleton />
        )}
      </aside>

      {/* ─── Overlay ─── */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 lg:hidden transition-opacity duration-300",
          sidebar ? "opacity-100 pointer-events-auto touch-none" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setSidebar(false)}
        aria-hidden="true"
      />

      {/* ─── Main Content ─── */}
      <main ref={mainRef} tabIndex={-1} className="flex-1 flex flex-col min-w-0 overflow-y-auto lg:overflow-hidden bg-background outline-none">

        {/* ── Top Bar ── */}
        <header className="shrink-0 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-4 h-10 sm:h-11 md:h-12 border-b border-border/50 bg-card z-30">
          <Button
            variant="ghost" size="icon"
            className="lg:hidden shrink-0 h-7 w-7 sm:h-8 sm:w-8 -ml-0.5"
            onClick={() => setSidebar(true)}
            aria-label="Open navigation"
          >
            <Menu className="w-4 h-4 sm:w-[17px] sm:h-[17px]" />
          </Button>
          <Button variant="ghost" size="sm" className="gap-1 shrink-0 h-7 sm:h-8 text-muted-foreground hover:text-foreground" asChild>
            <Link to={`/courses/${slug}`}>
              <ArrowLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden md:inline text-[11px] sm:text-xs">Back</span>
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[11px] sm:text-xs md:text-sm font-semibold truncate" title={course.title}>{course.title}</h1>
          </div>
          {user && <GamifyChip />}
        </header>

        {/* ── Video Area ── */}
        <div className="shrink-0 relative w-full bg-black aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0">
          <div className="absolute inset-0">
            {/* LIVE */}
            {current?.kind === "live" && current.live_url ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 text-white gap-3 sm:gap-5 p-4 sm:p-6 text-center">
                <div className="relative">
                  <div className="absolute -inset-3 sm:-inset-4 bg-red-500/15 blur-2xl animate-pulse rounded-full" />
                  <div className="absolute -inset-1.5 sm:-inset-2 bg-red-500/20 blur-lg animate-ping rounded-full" style={{ animationDuration: "2s" }} />
                  <div className="relative w-14 h-14 sm:w-20 sm:h-20 rounded-full bg-red-600/20 border-2 border-red-500 flex items-center justify-center">
                    <Radio className="w-6 h-6 sm:w-9 sm:h-9 text-red-500" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full bg-red-500 border-2 border-zinc-950 animate-pulse" />
                </div>
                <div className="max-w-sm">
                  <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-red-600/20 border border-red-500/30 text-red-400 text-[9px] sm:text-xs font-semibold uppercase tracking-wider mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />Live Now
                  </span>
                  <h3 className="text-base sm:text-xl font-bold mb-0.5 sm:mb-1">{current.name}</h3>
                  <p className="text-zinc-400 text-[11px] sm:text-sm">This session is streaming live right now</p>
                </div>
                <Button asChild size="sm" className="bg-red-600 hover:bg-red-700 text-white gap-2 shadow-lg shadow-red-900/30 h-8 sm:h-9 text-xs sm:text-sm">
                  <a href={current.live_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Join Live
                  </a>
                </Button>
              </div>
            ) : isRecorded ? (
              /* RECORDED */
              <VideoPlayer
                key={current.id}
                video={{ id: current.video_id, title: current.name, duration: current.duration ?? undefined }}
                onProgress={setWatchPct}
                onComplete={handleComplete}
                onMinuteWatched={handleMinute}
              />
            ) : current ? (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-zinc-500 text-xs sm:text-sm">Video not available</div>
            ) : !hasContent && ready ? (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <Video className="w-8 h-8 sm:w-12 sm:h-12 text-zinc-600" />
              </div>
            ) : !current && ready && MEDIA.length > 0 ? (
              /* CAROUSEL */
              <>
                <div className="absolute top-1.5 right-1.5 sm:top-2.5 sm:right-2.5 z-20">
                  <span className="bg-red-600 text-white text-[7px] sm:text-[10px] font-bold px-1 sm:px-1.5 py-px sm:py-0.5 rounded uppercase tracking-widest shadow">Ad</span>
                </div>
                {MEDIA.length > 1 && (
                  <>
                    <button
                      onClick={() => goMedia(-1)}
                      className="absolute left-1 sm:left-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full h-5 w-5 sm:h-7 sm:w-7 flex items-center justify-center transition-colors"
                      aria-label="Previous"
                    >
                      <ChevronLeft className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>
                    <button
                      onClick={() => goMedia(1)}
                      className="absolute right-1 sm:right-2 top-1/2 -translate-y-1/2 z-20 bg-black/30 hover:bg-black/50 text-white rounded-full h-5 w-5 sm:h-7 sm:w-7 flex items-center justify-center transition-colors"
                      aria-label="Next"
                    >
                      <ChevronRightIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </>
                )}
                <div className="absolute inset-0 flex items-center justify-center p-2 sm:p-4">
                  {isImg(MEDIA[mediaIdx]) ? (
                    <img src={MEDIA[mediaIdx]} alt="" loading="lazy" className="max-w-full max-h-full object-contain" />
                  ) : isVid(MEDIA[mediaIdx]) ? (
                    <video src={MEDIA[mediaIdx]} className="max-w-full max-h-full object-contain" autoPlay loop muted playsInline preload="metadata" />
                  ) : null}
                </div>
                {MEDIA.length > 1 && (
                  <div className="absolute bottom-1.5 sm:bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 sm:gap-1.5">
                    <div className="flex items-center gap-0.5 sm:gap-1 bg-black/50 backdrop-blur-sm px-1.5 sm:px-2 py-1 sm:py-1.5 rounded-full">
                      {MEDIA.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => goMediaTo(i)}
                          className={cn(
                            "rounded-full transition-all",
                            i === mediaIdx ? "bg-white w-3 h-1 sm:w-4 sm:h-1.5" : "bg-white/40 hover:bg-white/60 w-1.5 h-1 sm:w-1.5 sm:h-1.5"
                          )}
                          aria-label={`Slide ${i + 1}`}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setMediaPaused((p) => !p)}
                      className="bg-black/50 backdrop-blur-sm hover:bg-black/60 text-white rounded-full h-4 w-4 sm:h-6 sm:w-6 flex items-center justify-center transition-colors"
                      aria-label={mediaPaused ? "Play" : "Pause"}
                    >
                      {mediaPaused ? <PlayIcon className="w-2 h-2 sm:w-3 sm:h-3 ml-px" /> : <Pause className="w-2 h-2 sm:w-3 sm:h-3" />}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-zinc-600" />
              </div>
            )}
          </div>

          {/* Video Progress Bar */}
          {isRecorded && watchPct > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 z-50">
              <div className="h-full bg-primary/80 transition-all duration-700 ease-out" style={{ width: `${watchPct}%` }} />
            </div>
          )}
        </div>

        {/* ── Info Bar Below Video ── */}
        {current && (
          <div className="shrink-0 bg-card border-t border-border">
            <div className="px-2.5 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3">
              <div className="flex items-start gap-2 sm:gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xs sm:text-sm md:text-base lg:text-lg font-bold text-foreground leading-tight break-words">{current.name}</h2>
                  <div className="flex flex-wrap items-center gap-x-1 sm:gap-x-2 gap-y-0.5 mt-0.5 sm:mt-1.5 text-[10px] sm:text-xs md:text-sm text-muted-foreground">
                    <span className="font-semibold text-primary">{current.subjectName}</span>
                    <span className="text-border">·</span>
                    <span>{current.chapterName}</span>
                    {current.duration && (
                      <>
                        <span className="text-border">·</span>
                        <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />{current.duration}</span>
                      </>
                    )}
                    {current.kind === "live" && (
                      <>
                        <span className="text-border">·</span>
                        <span className="flex items-center gap-0.5 text-red-500 font-medium"><Radio className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />Live</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1 sm:gap-1.5 md:gap-2 shrink-0 pt-0.5 flex-wrap justify-end">
                  {completed.has(current.id) && (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-500 font-semibold text-[10px] sm:text-[11px] md:text-xs bg-green-50 dark:bg-green-900/20 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full border border-green-200 dark:border-green-900/30">
                      <CheckCircle2 className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5" />Done
                    </span>
                  )}
                  {current.notes_url && (
                    <Button variant="outline" size="sm" asChild className="h-7 sm:h-8 md:h-9 text-[11px] sm:text-xs md:text-sm gap-1 sm:gap-1.5">
                      <a href={current.notes_url} target="_blank" rel="noopener noreferrer">
                        <FileDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <span className="hidden sm:inline">Notes</span>
                      </a>
                    </Button>
                  )}
                  {isRecorded && (
                    <Button
                      variant={commentOpen ? "default" : "outline"}
                      size="sm"
                      onClick={toggleComment}
                      className={cn(
                        "h-7 sm:h-8 md:h-9 text-[11px] sm:text-xs md:text-sm gap-1 sm:gap-1.5 transition-all",
                        commentOpen
                          ? "bg-primary hover:bg-primary text-primary-foreground border-primary shadow-sm shadow-primary/20"
                          : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground hover:border-border"
                      )}
                    >
                      <MessageCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      <span className="hidden sm:inline">Comments</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Comment Panel ── */}
        {isRecorded && commentOpen && (
          <div
            className="shrink-0 w-full border-t border-border bg-card animate-in slide-in-from-bottom-2 duration-300 overflow-hidden"
            style={{ height: "clamp(220px, 40vh, 500px)" }}
          >
            <CommentUI partId={current.id} />
          </div>
        )}
      </main>
    </div>
  );
}