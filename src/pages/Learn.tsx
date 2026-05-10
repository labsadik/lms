import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import VideoPlayer from "@/components/VideoPlayer";
import GamifyChip from "@/components/GamifyChip";
import CommentUI from "@/components/CommentUI";
import { Button } from "@/components/ui/button";
import {
  Loader2, Play, Clock, ChevronRight, ListChecks, Trophy,
  Lock, CheckCircle2, BookOpen, GraduationCap,
  FileDown, ArrowLeft, MessageCircle, Heart, StickyNote,
} from "lucide-react";
import { completePart, awardWatchedMinute } from "@/lib/gamify";
import { useAuth } from "@/contexts/AuthContext";
import { useSEO } from "@/lib/seo";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/* ════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════ */
interface Course { id: string; title: string; [k: string]: unknown }
interface Part {
  id: string; name: string; video_id: string; live_url: string | null;
  kind: "recorded" | "live"; notes_url: string | null;
  duration: string | null; position: number; is_preview: boolean;
}
interface Chapter { id: string; name: string; position: number; parts: Part[] }
interface Subject { id: string; name: string; position: number; chapters: Chapter[] }
interface TestItem {
  id: string; title: string; scope: string;
  subject_id: string | null; chapter_id: string | null;
  duration_minutes: number | null;
}
interface ExtendedPart extends Part { chapterName: string; subjectName: string }

type ViewLevel = "subjects" | "chapters" | "lectures" | "player";

/* ════════════════════════════════════════════════════════
   Color Palette
   ════════════════════════════════════════════════════════ */
const PALETTE = [
  { accent: "#3b82f6", light: "rgba(59,130,246,0.06)", border: "rgba(59,130,246,0.15)" },
  { accent: "#8b5cf6", light: "rgba(139,92,246,0.06)", border: "rgba(139,92,246,0.15)" },
  { accent: "#10b981", light: "rgba(16,185,129,0.06)", border: "rgba(16,185,129,0.15)" },
  { accent: "#f59e0b", light: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.15)" },
  { accent: "#ef4444", light: "rgba(239,68,68,0.06)",  border: "rgba(239,68,68,0.15)" },
  { accent: "#06b6d4", light: "rgba(6,182,212,0.06)",  border: "rgba(6,182,212,0.15)" },
  { accent: "#ec4899", light: "rgba(236,72,153,0.06)", border: "rgba(236,72,153,0.15)" },
  { accent: "#14b8a6", light: "rgba(20,184,166,0.06)", border: "rgba(20,184,166,0.15)" },
  { accent: "#6366f1", light: "rgba(99,102,241,0.06)", border: "rgba(99,102,241,0.15)" },
  { accent: "#f97316", light: "rgba(249,115,22,0.06)", border: "rgba(249,115,22,0.15)" },
];

/* ════════════════════════════════════════════════════════
   Thin Progress Bar
   ════════════════════════════════════════════════════════ */
function ThinBar({ value, color, className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={cn("h-1 w-full rounded-full bg-black/[0.04] dark:bg-white/[0.04] overflow-hidden", className)}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color || "var(--primary)" }}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Page Skeleton
   ════════════════════════════════════════════════════════ */
function PageSkeleton() {
  return (
    <div className="flex flex-col h-[100dvh]">
      <div className="shrink-0 h-12 sm:h-14 border-b border-border/50 flex items-center px-3 sm:px-4 gap-2">
        <div className="w-8 h-8 rounded-lg bg-muted animate-pulse" />
        <div className="w-36 h-4 rounded bg-muted animate-pulse" />
        <div className="ml-auto w-16 h-6 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-7">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-xl border border-border/50 p-4 sm:p-5 space-y-3">
              <div className="w-10 h-10 rounded-lg bg-muted animate-pulse" />
              <div className="w-3/4 h-4 rounded bg-muted animate-pulse" />
              <div className="w-full h-1 rounded-full bg-muted animate-pulse" />
              <div className="w-1/2 h-3 rounded bg-muted animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Card (with progress bar from backend data)
   ════════════════════════════════════════════════════════ */
function Card({
  name, items, done, total, color, onClick, locked, label, index,
}: {
  name: string; items: number; done: number; total: number;
  color: typeof PALETTE[0]; onClick: () => void; locked?: boolean;
  label: string; index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = total > 0 && done === total;

  return (
    <button
      onClick={onClick}
      disabled={locked}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative flex flex-col text-left rounded-xl border p-4 sm:p-5 transition-all duration-200 w-full focus-visible:ring-2 focus-visible:ring-primary/30 outline-none min-h-[100px] sm:min-h-0"
      style={{
        backgroundColor: hovered && !locked ? color.light : "transparent",
        borderColor: hovered && !locked ? color.border : "var(--border)",
      }}
    >
      {locked && (
        <div className="absolute inset-0 rounded-xl bg-background/60 backdrop-blur-[2px] flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-1.5">
            <Lock className="w-5 h-5 text-muted-foreground" />
            <span className="text-[10px] font-medium text-muted-foreground">Enroll to unlock</span>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className="text-xl sm:text-2xl font-black tabular-nums leading-none transition-transform duration-200"
          style={{ color: color.accent, transform: hovered ? "scale(1.08)" : "scale(1)" }}
        >
          {String(index + 1).padStart(2, "0")}
        </span>
        {isComplete && (
          <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-600 dark:text-green-400 shrink-0">
            <CheckCircle2 className="w-3 h-3" />Done
          </span>
        )}
      </div>

      <h3 className="font-bold text-sm sm:text-[15px] text-foreground line-clamp-2 mb-0.5 leading-snug">{name}</h3>
      <p className="text-[11px] sm:text-xs text-muted-foreground mb-3">
        {items} {label}
      </p>

      {total > 0 && (
        <div className="mt-auto space-y-1.5">
          <ThinBar value={pct} color={isComplete ? "#22c55e" : color.accent} />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{done}/{total} done</span>
            {pct > 0 && (
              <span className="font-semibold" style={{ color: isComplete ? "#22c55e" : color.accent }}>
                {pct}%
              </span>
            )}
          </div>
        </div>
      )}
    </button>
  );
}

/* ════════════════════════════════════════════════════════
   Lecture Item
   ════════════════════════════════════════════════════════ */
function LectureItem({
  part, active, done, locked, onClick, liked, onLike, idx,
}: {
  part: ExtendedPart; active: boolean; done: boolean; locked: boolean;
  onClick: () => void; liked: boolean; onLike: () => void; idx: number;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 px-3 sm:px-4 py-3 sm:py-3.5 rounded-xl border transition-all duration-150 cursor-pointer min-h-[48px] sm:min-h-0",
        active && "bg-primary/[0.06] border-primary/20",
        !active && "border-border/40 hover:border-border hover:bg-muted/20",
        locked && "!opacity-50 !cursor-not-allowed",
      )}
      onClick={locked ? undefined : onClick}
      role={locked ? undefined : "button"}
      tabIndex={locked ? -1 : 0}
      onKeyDown={(e) => { if (e.key === "Enter" && !locked) onClick(); }}
    >
      <span className="text-[11px] font-mono text-muted-foreground/30 w-5 shrink-0 text-right select-none">
        {idx + 1}
      </span>

      <div
        className={cn(
          "shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all",
          done && "bg-green-500 text-white",
          !done && active && "bg-primary text-primary-foreground",
          !done && !active && !locked && "bg-muted text-muted-foreground/60 group-hover:bg-primary/10 group-hover:text-primary",
          locked && "bg-muted/40 text-muted-foreground/30",
        )}
      >
        {locked ? (
          <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
        ) : done ? (
          <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        ) : (
          <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 ml-0.5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn("text-[13px] sm:text-sm font-medium truncate leading-snug", active && "text-primary")}>{part.name}</p>
        <div className="flex items-center gap-2 mt-0.5 text-[10px] sm:text-[11px] text-muted-foreground">
          {part.duration && (
            <span className="flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3" />{part.duration}
            </span>
          )}
          {part.is_preview && !locked && (
            <span className="text-primary/60 font-medium">Top quality</span>
          )}
        </div>
      </div>

      {!locked && (
        <div className="flex items-center gap-0.5 shrink-0">
          {part.notes_url && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              asChild
              onClick={(e) => e.stopPropagation()}
            >
              <a href={part.notes_url} target="_blank" rel="noopener noreferrer" aria-label="Notes">
                <StickyNote className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-foreground" />
              </a>
            </Button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onLike(); }}
            className="p-2 rounded-lg hover:bg-muted/50 transition-all min-h-[44px] sm:min-h-0 flex items-center justify-center"
            aria-label={liked ? "Unlike" : "Like"}
          >
            <Heart
              className={cn(
                "w-4 h-4 transition-all duration-200",
                liked ? "fill-red-500 text-red-500" : "text-muted-foreground/25 hover:text-red-400",
              )}
            />
          </button>
          {active && <span className="w-[3px] h-5 rounded-full bg-primary animate-pulse" />}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Test Card
   ════════════════════════════════════════════════════════ */
function TestCard({ test, done, variant = "default" }: { test: TestItem; done: boolean; variant?: "default" | "prominent" }) {
  if (variant === "prominent") {
    return (
      <Link
        to={`/test/${test.id}`}
        className={cn(
          "flex items-center gap-3 sm:gap-4 p-4 sm:p-5 rounded-xl border transition-all duration-200 group min-h-[52px] sm:min-h-0",
          done
            ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/30"
            : "bg-gradient-to-r from-primary to-primary/90 text-primary-foreground border-primary shadow-md shadow-primary/15 hover:shadow-lg hover:shadow-primary/20",
        )}
      >
        <div className={cn("w-10 h-10 sm:w-11 sm:h-11 rounded-lg flex items-center justify-center shrink-0", done ? "bg-green-500 text-white" : "bg-white/15")}>
          {done ? <CheckCircle2 className="w-5 h-5" /> : <Trophy className="w-5 h-5 text-yellow-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-bold text-sm sm:text-[15px] truncate", done && "text-green-700 dark:text-green-400")}>
            {done ? "Assessment Completed" : "Full Course Test"}
          </p>
          <p className={cn("text-[11px] sm:text-xs truncate mt-0.5", done ? "text-green-600/70 dark:text-green-500/60" : "text-primary-foreground/75")}>
            {test.title}{test.duration_minutes ? ` · ${test.duration_minutes} min` : ""}
          </p>
        </div>
        <ChevronRight className={cn("w-5 h-5 shrink-0 group-hover:translate-x-0.5 transition-transform", done ? "text-green-600 dark:text-green-400" : "text-primary-foreground/50")} />
      </Link>
    );
  }

  return (
    <Link
      to={`/test/${test.id}`}
      className={cn(
        "flex items-center gap-3 px-3.5 sm:px-4 py-3 sm:py-3.5 rounded-xl border transition-all duration-150 group min-h-[48px] sm:min-h-0",
        done
          ? "bg-green-50/80 dark:bg-green-950/15 border-green-200/60 dark:border-green-900/25"
          : "bg-amber-50/60 dark:bg-amber-950/15 border-amber-200/60 dark:border-amber-900/25 hover:border-amber-300 dark:hover:border-amber-800/50",
      )}
    >
      <div className={cn("w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0", done ? "bg-green-500 text-white" : "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400")}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : <ListChecks className="w-4 h-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold text-[13px] sm:text-sm truncate", done && "text-green-700 dark:text-green-400")}>{test.title}</p>
        {test.duration_minutes && <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">{test.duration_minutes} minutes</p>}
      </div>
      {done && <span className="text-[9px] font-bold uppercase tracking-wider text-green-600 dark:text-green-400 shrink-0">Done</span>}
      <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 transition-colors" />
    </Link>
  );
}

/* ════════════════════════════════════════════════════════
   Breadcrumb
   ════════════════════════════════════════════════════════ */
function Breadcrumb({ items, onNavigate }: { items: { label: string; level: ViewLevel; icon: React.ReactNode }[]; onNavigate: (level: ViewLevel) => void; }) {
  return (
    <nav className="flex items-center gap-0.5 text-sm overflow-x-auto no-scrollbar" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-0.5 shrink-0">
          {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/25 mx-0.5" />}
          <button
            onClick={() => onNavigate(item.level)}
            className={cn(
              "flex items-center gap-1 px-1.5 sm:px-2 py-1 rounded-lg transition-colors text-left",
              i === items.length - 1 ? "text-foreground font-semibold bg-muted/40" : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
            )}
            aria-current={i === items.length - 1 ? "page" : undefined}
          >
            <span className="shrink-0">{item.icon}</span>
            <span className="truncate max-w-[100px] sm:max-w-[160px] lg:max-w-[220px] text-xs sm:text-sm">{item.label}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}

/* ════════════════════════════════════════════════════════
   Empty State
   ════════════════════════════════════════════════════════ */
function EmptyState({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 sm:py-20 text-center px-4">
      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 sm:w-7 sm:h-7 text-muted-foreground/40" />
      </div>
      <h3 className="font-semibold text-sm sm:text-base text-foreground mb-0.5">{title}</h3>
      <p className="text-xs sm:text-sm text-muted-foreground max-w-xs">{desc}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN LEARN PAGE
   ════════════════════════════════════════════════════════ */
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

  const [view, setView] = useState<ViewLevel>("subjects");
  const [activeSubjectIdx, setActiveSubjectIdx] = useState<number | null>(null);
  const [activeChapterIdx, setActiveChapterIdx] = useState<number | null>(null);
  const [activePart, setActivePart] = useState<ExtendedPart | null>(null);
  const [likes, setLikes] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("lecture_likes") || "[]")); }
    catch { return new Set(); }
  });
  const [commentOpen, setCommentOpen] = useState(false);
  const [watchPct, setWatchPct] = useState(0);

  useSEO({ title: course ? `Learn: ${course.title}` : "Learning", description: "Continue your learning" });

  /* ── Phase 1 ── */
  useEffect(() => {
    let alive = true;
    if (!slug) { setCourseErr(true); return; }
    (async () => {
      try {
        const { data } = await supabase.from("courses").select("id,title,slug").eq("slug", slug).maybeSingle();
        if (!alive) return;
        if (data) setCourse(data as Course); else setCourseErr(true);
      } catch { if (alive) setCourseErr(true); }
    })();
    return () => { alive = false; };
  }, [slug]);

  /* ── Phase 2 ── */
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
          chapters: (s.chapters || []).sort((a: any, b: any) => a.position - b.position).map((c: any) => ({ ...c, parts: (c.parts || []).sort((a: any, b: any) => a.position - b.position) })),
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
      } catch (e) { console.error(e); }
      finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; };
  }, [course?.id, user?.id]);

  /* ── Derived ── */
  const allParts = useMemo(() => tree.flatMap((s) => s.chapters.flatMap((c) => c.parts.map((p) => ({ ...p, chapterName: c.name, subjectName: s.name })))), [tree]);
  const activeSubject = activeSubjectIdx !== null ? tree[activeSubjectIdx] : null;
  const activeChapter = activeSubject && activeChapterIdx !== null ? activeSubject.chapters[activeChapterIdx] : null;

  const breadcrumbs = useMemo(() => {
    const items: { label: string; level: ViewLevel; icon: React.ReactNode }[] = [
      { label: course?.title || "Course", level: "subjects", icon: <GraduationCap className="w-3.5 h-3.5" /> },
    ];
    if (activeSubject) items.push({ label: activeSubject.name, level: "chapters", icon: <BookOpen className="w-3.5 h-3.5" /> });
    if (activeChapter) items.push({ label: activeChapter.name, level: "lectures", icon: <ListChecks className="w-3.5 h-3.5" /> });
    if (activePart) items.push({ label: activePart.name, level: "player", icon: <Play className="w-3.5 h-3.5" /> });
    return items;
  }, [course, activeSubject, activeChapter, activePart]);

  /* ── Lock Helpers ── */
  const isSubjectLocked = useCallback((subj: Subject) => { if (enrolled) return false; return !subj.chapters.some((c) => c.parts.some((p) => p.is_preview)); }, [enrolled]);
  const isChapterLocked = useCallback((ch: Chapter) => { if (enrolled) return false; return !ch.parts.some((p) => p.is_preview); }, [enrolled]);
  const isPartLocked = useCallback((p: Part) => !enrolled && !p.is_preview, [enrolled]);

  /* ── Navigation ── */
  const navigateTo = useCallback((level: ViewLevel) => {
    if (level === "subjects") { setActiveSubjectIdx(null); setActiveChapterIdx(null); setActivePart(null); }
    else if (level === "chapters") { setActiveChapterIdx(null); setActivePart(null); }
    else if (level === "lectures") { setActivePart(null); }
    setView(level);
    setCommentOpen(false);
  }, []);

  const goBack = useCallback(() => {
    if (view === "player") navigateTo("lectures");
    else if (view === "lectures") navigateTo("chapters");
    else if (view === "chapters") navigateTo("subjects");
    else navigate(`/courses/${slug}`);
  }, [view, navigateTo, slug]);

  const openSubject = useCallback((idx: number) => {
    if (isSubjectLocked(tree[idx])) { toast.error("Enroll to unlock this section"); return; }
    setActiveSubjectIdx(idx); setActiveChapterIdx(null); setActivePart(null); setView("chapters"); setCommentOpen(false);
  }, [tree, isSubjectLocked]);

  const openChapter = useCallback((idx: number) => {
    if (!activeSubject) return;
    if (isChapterLocked(activeSubject.chapters[idx])) { toast.error("Enroll to unlock this chapter"); return; }
    setActiveChapterIdx(idx); setActivePart(null); setView("lectures"); setCommentOpen(false);
  }, [activeSubject, isChapterLocked]);

  const openLecture = useCallback((part: ExtendedPart) => {
    if (isPartLocked(part)) { toast.error("Enroll to unlock this lecture"); return; }
    setActivePart(part); setView("player"); setWatchPct(0); setCommentOpen(false);
  }, [isPartLocked]);

  /* ── Like ── */
  const toggleLike = useCallback((partId: string) => {
    setLikes((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) { next.delete(partId); toast("Removed like", { duration: 1000 }); }
      else { next.add(partId); toast("Liked!", { duration: 1000 }); }
      localStorage.setItem("lecture_likes", JSON.stringify([...next]));
      return next;
    });
  }, []);

  /* ── Video Callbacks (Gamification) ── */
  const handleComplete = useCallback(async () => {
    if (!user || !activePart || !course || completed.has(activePart.id)) return;
    try {
      await completePart(user.id, activePart.id, course.id);
      setCompleted((s) => new Set(s).add(activePart.id));
      toast.success("Lecture completed! 🎉");
    } catch (e) { console.error(e); }
  }, [user, activePart, course, completed]);

  const handleMinute = useCallback(async (min: number) => {
    if (!user || !activePart || !course || activePart.kind !== "recorded") return;
    try {
      const ok = await awardWatchedMinute(user.id, activePart.id, min, course.id);
      if (ok) toast.success("+1 coin 💰", { duration: 1200 });
    } catch (e) { console.error(e); }
  }, [user, activePart, course]);

  const isTestDone = useCallback((id: string) => testCompletions.has(id), [testCompletions]);

  /* ══════════════════════════════════════════════════════
     Error / Loading
     ══════════════════════════════════════════════════════ */
  if (courseErr) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] gap-3 bg-background px-4 text-center">
        <BookOpen className="w-10 h-10 text-muted-foreground/30" />
        <h2 className="font-bold text-base sm:text-lg">Course not found</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">This course may have been removed or the link is incorrect.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/courses")} className="mt-2">Browse Courses</Button>
      </div>
    );
  }
  if (!course || !ready) return <PageSkeleton />;

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-[100dvh] bg-background overflow-hidden">
      {/* ─── Header ─── */}
      <header className="shrink-0 flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 h-12 sm:h-14 border-b border-border/50 bg-card z-30">
        <Button variant="ghost" size="icon" className="shrink-0 h-9 w-9 -ml-1" onClick={goBack} aria-label="Go back">
          <ArrowLeft className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
        </Button>
        <div className="min-w-0 flex-1">
          <Breadcrumb items={breadcrumbs} onNavigate={navigateTo} />
        </div>
        {user && <GamifyChip />}
      </header>

      {/* ─── Content Area ─── */}
      {/* Player view: flex column on PC so video fills space. Other views: scrollable. */}
      <div className={cn(
        "flex-1 min-h-0",
        view === "player"
          ? "flex flex-col overflow-hidden lg:overflow-hidden"
          : "overflow-y-auto"
      )}>

        {/* ── VIEW: Subjects ── */}
        {view === "subjects" && (
          <div className="p-3 sm:p-5 lg:p-7 space-y-5">
            <div>
              <h2 className="font-bold text-base sm:text-lg text-foreground">Subjects</h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {tree.length} {tree.length === 1 ? "subject" : "subjects"} in this course
              </p>
            </div>
            {tree.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4">
                {tree.map((subj, i) => {
                  const parts = subj.chapters.flatMap((c) => c.parts);
                  const done = parts.filter((p) => completed.has(p.id)).length;
                  return (
                    <Card key={subj.id} name={subj.name} items={subj.chapters.length} done={done} total={parts.length}
                      color={PALETTE[i % PALETTE.length]} onClick={() => openSubject(i)} locked={isSubjectLocked(subj)}
                      label={subj.chapters.length === 1 ? "chapter" : "chapters"} index={i} />
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={BookOpen} title="No subjects yet" desc="Content is being prepared for this course." />
            )}
            {tests.filter((t) => t.scope === "course").length > 0 && (
              <div className="space-y-2.5 pt-1">
                <h3 className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-500" />Course Assessment
                </h3>
                <div className="max-w-xl">
                  {tests.filter((t) => t.scope === "course").map((t) => (
                    <TestCard key={t.id} test={t} done={isTestDone(t.id)} variant="prominent" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VIEW: Chapters ── */}
        {view === "chapters" && activeSubject && (
          <div className="p-3 sm:p-5 lg:p-7 space-y-5">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${PALETTE[activeSubjectIdx! % PALETTE.length].accent}10` }}>
                <BookOpen className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: PALETTE[activeSubjectIdx! % PALETTE.length].accent }} />
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-base sm:text-lg text-foreground">{activeSubject.name}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  {activeSubject.chapters.length} {activeSubject.chapters.length === 1 ? "chapter" : "chapters"} ·{" "}
                  {activeSubject.chapters.flatMap((c) => c.parts).length} lectures
                </p>
              </div>
            </div>
            {activeSubject.chapters.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 lg:gap-4">
                {activeSubject.chapters.map((ch, i) => {
                  const done = ch.parts.filter((p) => completed.has(p.id)).length;
                  return (
                    <Card key={ch.id} name={ch.name} items={ch.parts.length} done={done} total={ch.parts.length}
                      color={PALETTE[(activeSubjectIdx! + i + 1) % PALETTE.length]} onClick={() => openChapter(i)} locked={isChapterLocked(ch)}
                      label={ch.parts.length === 1 ? "lecture" : "lectures"} index={i} />
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={BookOpen} title="No chapters yet" desc="Chapters are being added to this subject." />
            )}
            {tests.filter((t) => t.scope === "subject" && t.subject_id === activeSubject.id).length > 0 && (
              <div className="space-y-2.5 pt-1">
                <h3 className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                  <ListChecks className="w-4 h-4 text-amber-500" />Subject Test
                </h3>
                <div className="max-w-xl space-y-2">
                  {tests.filter((t) => t.scope === "subject" && t.subject_id === activeSubject.id).map((t) => (
                    <TestCard key={t.id} test={t} done={isTestDone(t.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VIEW: Lectures ── */}
        {view === "lectures" && activeChapter && (
          <div className="p-3 sm:p-5 lg:p-7 space-y-4">
            <div className="flex items-start gap-2.5 sm:gap-3">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${PALETTE[(activeSubjectIdx! + activeChapterIdx! + 1) % PALETTE.length].accent}10` }}>
                <ListChecks className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: PALETTE[(activeSubjectIdx! + activeChapterIdx! + 1) % PALETTE.length].accent }} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-base sm:text-lg text-foreground">{activeChapter.name}</h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  {activeChapter.parts.filter((p) => completed.has(p.id)).length}/{activeChapter.parts.length} lectures completed
                </p>
                <ThinBar
                  value={activeChapter.parts.length > 0 ? (activeChapter.parts.filter((p) => completed.has(p.id)).length / activeChapter.parts.length) * 100 : 0}
                  className="mt-2 max-w-[200px] sm:max-w-xs"
                />
              </div>
            </div>
            {activeChapter.parts.length > 0 ? (
              <div className="space-y-1.5 sm:space-y-2">
                {activeChapter.parts.map((p, i) => {
                  const ext: ExtendedPart = { ...p, chapterName: activeChapter.name, subjectName: activeSubject?.name || "" };
                  return (
                    <LectureItem key={p.id} part={ext} active={activePart?.id === p.id} done={completed.has(p.id)}
                      locked={isPartLocked(p)} onClick={() => openLecture(ext)} liked={likes.has(p.id)}
                      onLike={() => toggleLike(p.id)} idx={i} />
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={BookOpen} title="No lectures yet" desc="Lectures are being uploaded for this chapter." />
            )}
            {tests.filter((t) => t.scope === "chapter" && t.chapter_id === activeChapter.id).length > 0 && (
              <div className="space-y-2.5 pt-1">
                <h3 className="font-bold text-xs sm:text-sm text-foreground flex items-center gap-1.5">
                  <ListChecks className="w-4 h-4 text-amber-500" />Chapter Test
                </h3>
                <div className="max-w-xl space-y-2">
                  {tests.filter((t) => t.scope === "chapter" && t.chapter_id === activeChapter.id).map((t) => (
                    <TestCard key={t.id} test={t} done={isTestDone(t.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VIEW: Player ── */}
        {view === "player" && activePart && (
          <div className="flex flex-col flex-1 min-h-0">
            {/* Video — aspect-video on mobile, flex-fill on PC */}
            <div className="shrink-0 relative w-full bg-black aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0">
              <div className="absolute inset-0">
                {activePart.kind === "recorded" ? (
                  <VideoPlayer
                    key={activePart.id}
                    video={{ id: activePart.video_id, title: activePart.name, duration: activePart.duration ?? undefined }}
                    onProgress={setWatchPct}
                    onComplete={handleComplete}
                    onMinuteWatched={handleMinute}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-zinc-500 text-xs sm:text-sm">
                    Video not available
                  </div>
                )}
              </div>
              {activePart.kind === "recorded" && watchPct > 0 && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 z-50">
                  <div className="h-full bg-primary/80 transition-all duration-700 ease-out" style={{ width: `${watchPct}%` }} />
                </div>
              )}
            </div>

            {/* Info + Actions */}
            <div className="shrink-0 bg-card border-t border-border/50">
              <div className="px-3 sm:px-5 lg:px-6 py-3 sm:py-3.5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-2.5 sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm sm:text-base lg:text-lg font-bold text-foreground leading-snug break-words">{activePart.name}</h2>
                    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-[11px] sm:text-xs lg:text-sm text-muted-foreground">
                      <span className="font-semibold text-primary">{activePart.subjectName}</span>
                      <span className="text-border">·</span>
                      <span>{activePart.chapterName}</span>
                      {activePart.duration && (
                        <><span className="text-border">·</span>
                          <span className="flex items-center gap-0.5"><Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />{activePart.duration}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap">
                    {completed.has(activePart.id) && (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-500 font-semibold text-[11px] sm:text-xs bg-green-50 dark:bg-green-900/20 px-2 sm:px-2.5 py-1 rounded-full border border-green-200 dark:border-green-900/30">
                        <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />Completed
                      </span>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => toggleLike(activePart.id)}
                      className={cn("h-8 sm:h-9 gap-1.5 text-xs transition-all min-w-[44px] sm:min-w-0", likes.has(activePart.id) && "text-red-500 hover:text-red-600")}>
                      <Heart className={cn("w-4 h-4", likes.has(activePart.id) && "fill-current")} />
                      <span className="hidden sm:inline">{likes.has(activePart.id) ? "Liked" : "Like"}</span>
                    </Button>
                    {activePart.notes_url && (
                      <Button variant="outline" size="sm" asChild className="h-8 sm:h-9 text-xs gap-1.5 min-w-[44px] sm:min-w-0">
                        <a href={activePart.notes_url} target="_blank" rel="noopener noreferrer">
                          <StickyNote className="w-3.5 h-3.5" /><span className="hidden sm:inline">Notes</span>
                        </a>
                      </Button>
                    )}
                    {activePart.kind === "recorded" && (
                      <Button variant={commentOpen ? "default" : "outline"} size="sm"
                        onClick={() => setCommentOpen((v) => !v)}
                        className={cn("h-8 sm:h-9 text-xs gap-1.5 transition-all min-w-[44px] sm:min-w-0", commentOpen && "shadow-sm shadow-primary/20")}>
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{commentOpen ? "Hide" : "Comments"}</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Comments — scrollable on PC when open, since video is fixed above */}
            {activePart.kind === "recorded" && commentOpen && (
              <div className="shrink-0 w-full border-t border-border/50 bg-card animate-in slide-in-from-bottom-2 duration-300 overflow-y-auto lg:overflow-y-auto"
                style={{ height: "clamp(200px, 38vh, 460px)" }}>
                <CommentUI partId={activePart.id} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}