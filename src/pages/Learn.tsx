import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import VideoPlayer from "@/components/VideoPlayer";
import GamifyChip from "@/components/GamifyChip";
import CommentUI from "@/components/CommentUI";
import { Button } from "@/components/ui/button";
import {
  Play, Clock, ChevronRight, ListChecks, Trophy,
  Lock, CheckCircle2, BookOpen, GraduationCap,
  ArrowLeft, MessageCircle, Heart, StickyNote,
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
  { accent: "#3b82f6", light: "rgba(59,130,246,0.07)", border: "rgba(59,130,246,0.18)" },
  { accent: "#8b5cf6", light: "rgba(139,92,246,0.07)", border: "rgba(139,92,246,0.18)" },
  { accent: "#10b981", light: "rgba(16,185,129,0.07)", border: "rgba(16,185,129,0.18)" },
  { accent: "#f59e0b", light: "rgba(245,158,11,0.07)", border: "rgba(245,158,11,0.18)" },
  { accent: "#ef4444", light: "rgba(239,68,68,0.07)", border: "rgba(239,68,68,0.18)" },
  { accent: "#06b6d4", light: "rgba(6,182,212,0.07)", border: "rgba(6,182,212,0.18)" },
  { accent: "#ec4899", light: "rgba(236,72,153,0.07)", border: "rgba(236,72,153,0.18)" },
  { accent: "#14b8a6", light: "rgba(20,184,166,0.07)", border: "rgba(20,184,166,0.18)" },
  { accent: "#6366f1", light: "rgba(99,102,241,0.07)", border: "rgba(99,102,241,0.18)" },
  { accent: "#f97316", light: "rgba(249,115,22,0.07)", border: "rgba(249,115,22,0.18)" },
];

/* ════════════════════════════════════════════════════════
   Progress Bar
   ════════════════════════════════════════════════════════ */
function ProgressBar({ value, color, className }: { value: number; color?: string; className?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("h-[5px] w-full rounded-full bg-black/[0.06] dark:bg-white/[0.06] overflow-hidden", className)}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ width: `${pct}%`, backgroundColor: color || "var(--primary)" }}
      />
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Skeleton helpers
   ════════════════════════════════════════════════════════ */
function Skel({ className }: { className?: string }) {
  return <div className={cn("rounded-md bg-muted animate-pulse", className)} />;
}

function ViewSkeleton({ view }: { view: ViewLevel }) {
  const hdr = (
    <header className="shrink-0 flex items-center px-4 border-b border-border/40 bg-muted/30">
      <Skel className="w-10 h-10 rounded-xl shrink-0" />
      <Skel className="w-32 h-8 rounded-lg ml-2.5" />
    </header>
  );

  if (view === "player") {
    return (
      <div className="flex flex-col h-[100dvh]">
        <header className="shrink-0 flex items-center px-4 border-b border-border/40 bg-muted/30 h-[64px]">
          <Skel className="w-10 h-10 rounded-xl shrink-0" />
          <Skel className="w-32 h-8 rounded-lg ml-2.5" />
        </header>
        <main className="flex-1 flex flex-col min-h-0">
          <div className="shrink-0 aspect-video bg-neutral-900" />
          <div className="shrink-0 border-t border-border/40 bg-card p-4 space-y-3">
            <Skel className="w-3/4 h-5" />
            <Skel className="w-1/2 h-4" />
            <div className="flex gap-2 pt-1">
              <Skel className="w-16 h-9 rounded-lg" />
              <Skel className="w-16 h-9 rounded-lg" />
              <Skel className="w-20 h-9 rounded-lg" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (view === "lectures") {
    return (
      <div className="flex flex-col h-[100dvh]">
        {hdr}
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-start gap-3">
            <Skel className="w-12 h-12 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2 pt-0.5">
              <Skel className="w-48 h-5" />
              <Skel className="w-20 h-3" />
              <Skel className="w-40 h-[5px] rounded-full mt-1" />
            </div>
          </div>
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-400 dark:border-gray-600">
                <Skel className="w-4 h-4" />
                <Skel className="w-10 h-10 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skel className="w-3/4 h-4" />
                  <Skel className="w-16 h-3" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (view === "chapters") {
    return (
      <div className="flex flex-col h-[100dvh]">
        {hdr}
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-start gap-3">
            <Skel className="w-12 h-12 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2 pt-0.5">
              <Skel className="w-48 h-5" />
              <Skel className="w-28 h-3" />
              <Skel className="w-40 h-[5px] rounded-full mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-gray-400 dark:border-gray-600 bg-card p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <Skel className="w-11 h-11 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skel className="w-3/4 h-4" />
                    <Skel className="w-16 h-3" />
                  </div>
                </div>
                <Skel className="w-full h-[5px] rounded-full" />
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh]">
      {hdr}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-1.5">
          <Skel className="w-24 h-5" />
          <Skel className="w-40 h-3" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-400 dark:border-gray-600 bg-card p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Skel className="w-11 h-11 rounded-xl shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skel className="w-3/4 h-4" />
                  <Skel className="w-16 h-3" />
                </div>
              </div>
              <Skel className="w-full h-[5px] rounded-full" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Card
   ════════════════════════════════════════════════════════ */
function Card({
  name, items, done, total, color, onClick, locked, label, index,
}: {
  name: string; items: number; done: number; total: number;
  color: typeof PALETTE[0]; onClick: () => void; locked?: boolean;
  label: string; index: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isComplete = total > 0 && done === total;
  const barColor = isComplete ? "#22c55e" : color.accent;
  const pctColor = isComplete ? "#22c55e" : color.accent;

  return (
    <button
      onClick={onClick}
      disabled={locked}
      className="group relative flex text-left rounded-2xl border border-gray-400 dark:border-gray-600 bg-card transition-all duration-200 w-full focus-visible:ring-2 focus-visible:ring-primary/30 outline-none active:scale-[0.98] hover:bg-[var(--card-hover-bg)] hover:border-[var(--card-hover-border)]"
      style={{
        "--card-hover-bg": color.light,
        "--card-hover-border": color.border,
      } as React.CSSProperties}
    >
      {locked && (
        <div className="absolute inset-0 rounded-2xl bg-background/60 backdrop-blur-[2px] flex items-center justify-center z-10">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground">Enroll to unlock</span>
          </div>
        </div>
      )}
      <div className="flex items-start gap-3 p-4 w-full">
        <div
          className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105"
          style={{ backgroundColor: `${color.accent}12` }}
        >
          <span className="text-base font-black tabular-nums leading-none" style={{ color: color.accent }}>
            {String(index + 1).padStart(2, "0")}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-bold text-sm text-foreground line-clamp-2 leading-snug flex-1">{name}</h3>
            {isComplete && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground mb-2.5">{items} {label}</p>
          {total > 0 && (
            <div className="space-y-1">
              <ProgressBar value={pct} color={barColor} />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{done}/{total} done</span>
                {pct > 0 && <span className="font-bold tabular-nums" style={{ color: pctColor }}>{pct}%</span>}
              </div>
            </div>
          )}
        </div>
      </div>
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
      role={locked ? undefined : "button"}
      tabIndex={locked ? -1 : 0}
      onClick={locked ? undefined : onClick}
      onKeyDown={(e) => { if (e.key === "Enter" && !locked) onClick(); }}
      className={cn(
        "group w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-150 text-left active:scale-[0.99] cursor-pointer",
        active && "bg-primary/[0.07] border-primary/20",
        !active && !locked && "border-gray-400 dark:border-gray-600 hover:border-gray-500 dark:hover:border-gray-500 hover:bg-muted/20",
        locked && "!opacity-50 !cursor-not-allowed",
      )}
      style={{ touchAction: "manipulation" }}
    >
      <span className="text-[11px] font-mono text-muted-foreground/20 w-4 shrink-0 text-right select-none tabular-nums">
        {idx + 1}
      </span>
      <div className={cn(
        "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
        done && "bg-green-500 text-white",
        !done && active && "bg-primary text-primary-foreground",
        !done && !active && !locked && "bg-muted/70 text-muted-foreground/40 group-hover:bg-primary/10 group-hover:text-primary",
        locked && "bg-muted/30 text-muted-foreground/20",
      )}>
        {locked ? <Lock className="w-4 h-4" /> : done ? <CheckCircle2 className="w-4.5 h-4.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-sm font-semibold leading-snug line-clamp-1", active ? "text-primary" : "text-foreground")}>
          {part.name}
        </p>
        <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
          {part.duration && <span className="flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{part.duration}</span>}
          {part.is_preview && !locked && <span className="text-primary/60 font-medium">Free</span>}
        </div>
      </div>
      {!locked && (
        <div className="flex items-center shrink-0 gap-0.5">
          {part.notes_url && (
            <a
              href={part.notes_url} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-muted/50 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
              aria-label="Notes"
            >
              <StickyNote className="w-4 h-4 text-muted-foreground/40" />
            </a>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onLike(); }}
            className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-muted/50 transition-colors"
            aria-label={liked ? "Unlike" : "Like"}
          >
            <Heart className={cn("w-4 h-4 transition-colors", liked ? "fill-red-500 text-red-500" : "text-muted-foreground/20")} />
          </button>
          {active && <span className="w-[3px] h-6 rounded-full bg-primary" />}
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
      <Link to={`/test/${test.id}`}
        className={cn(
          "flex items-center gap-3 p-4 rounded-2xl border transition-all duration-200 active:scale-[0.99]",
          done ? "border-green-400 dark:border-green-700 bg-green-50 dark:bg-green-950/20"
            : "border-primary bg-gradient-to-r from-primary to-primary/90 text-primary-foreground",
        )}
        style={{ touchAction: "manipulation" }}
      >
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", done ? "bg-green-500 text-white" : "bg-white/15")}>
          {done ? <CheckCircle2 className="w-5 h-5" /> : <Trophy className="w-5 h-5 text-yellow-300" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("font-bold text-sm truncate", done && "text-green-700 dark:text-green-400")}>
            {done ? "Assessment Completed" : "Full Course Test"}
          </p>
          <p className={cn("text-xs truncate mt-0.5", done ? "text-green-600/70 dark:text-green-500/60" : "text-primary-foreground/75")}>
            {test.title}{test.duration_minutes ? ` · ${test.duration_minutes} min` : ""}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />
      </Link>
    );
  }

  return (
    <Link to={`/test/${test.id}`}
      className={cn(
        "flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all duration-150 active:scale-[0.99]",
        done ? "border-green-400 dark:border-green-700 bg-green-50/80 dark:bg-green-950/15"
          : "border-amber-400 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/15 hover:border-amber-500 dark:hover:border-amber-600",
      )}
      style={{ touchAction: "manipulation" }}
    >
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", done ? "bg-green-500 text-white" : "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400")}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : <ListChecks className="w-4 h-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("font-semibold text-sm truncate", done && "text-green-700 dark:text-green-400")}>{test.title}</p>
        {test.duration_minutes && <p className="text-[11px] text-muted-foreground mt-0.5">{test.duration_minutes} minutes</p>}
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/25 shrink-0" />
    </Link>
  );
}

/* ════════════════════════════════════════════════════════
   Breadcrumb
   ════════════════════════════════════════════════════════ */
function Breadcrumb({ items, onNavigate }: { items: { label: string; level: ViewLevel; icon: React.ReactNode }[]; onNavigate: (level: ViewLevel) => void }) {
  return (
    <nav className="flex items-center gap-0.5 overflow-x-auto no-scrollbar" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <div key={i} className="flex items-center shrink-0">
          {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground/20 mx-0.5" />}
          <button
            onClick={() => onNavigate(item.level)}
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors",
              i === items.length - 1
                ? "text-foreground font-semibold bg-muted/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30",
            )}
            style={{ touchAction: "manipulation" }}
          >
            <span className="shrink-0 w-4 h-4 flex items-center justify-center">{item.icon}</span>
            <span className="truncate max-w-[80px] sm:max-w-[140px] lg:max-w-[200px] text-xs sm:text-sm leading-tight">{item.label}</span>
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
    <div className="flex flex-col items-center justify-center py-20 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
        <Icon className="w-7 h-7 text-muted-foreground/30" />
      </div>
      <h3 className="font-semibold text-sm text-foreground mb-1">{title}</h3>
      <p className="text-xs text-muted-foreground max-w-[240px] leading-relaxed">{desc}</p>
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
  const [courseErr, setCourseErr] = useState<boolean>(false);
  const [tree, setTree] = useState<Subject[]>([]);
  const [tests, setTests] = useState<TestItem[]>([]);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [testCompletions, setTestCompletions] = useState<Set<string>>(new Set());
  const [enrolled, setEnrolled] = useState<boolean>(false);
  const [ready, setReady] = useState<boolean>(false);

  const [view, setView] = useState<ViewLevel>("subjects");
  const [activeSubjectIdx, setActiveSubjectIdx] = useState<number | null>(null);
  const [activeChapterIdx, setActiveChapterIdx] = useState<number | null>(null);
  const [activePart, setActivePart] = useState<ExtendedPart | null>(null);
  const [likes, setLikes] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("lecture_likes") || "[]")); }
    catch { return new Set(); }
  });

  const [commentOpen, setCommentOpen] = useState<boolean>(false);
  const [watchPct, setWatchPct] = useState<number>(0);

  const isPopRef = useRef<boolean>(false);
  const isRestoringRef = useRef<boolean>(false);
  const STORAGE_KEY = `learn_state_${slug}`;

  const [skeletonView, setSkeletonView] = useState<ViewLevel>("subjects");

  useEffect(() => {
    if (!slug) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.view && s.view !== "subjects") setSkeletonView(s.view);
      }
    } catch { /* noop */ }
  }, [slug]);

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
          supabase.from("subjects").select("id,name,position,chapters(id,name,position,parts(id,name,kind,live_url,video_id,notes_url,duration,position,is_preview)))").eq("course_id", course.id).order("position"),
          supabase.from("tests").select("id,title,scope,subject_id,chapter_id,duration_minutes").eq("course_id", course.id).eq("is_published", true),
        ]);
        if (!alive) return;
        if (er?.data) setEnrolled(true);
        setTree((tr.data || []).map((s: any) => ({
          ...s,
          chapters: (s.chapters || []).sort((a: any, b: any) => a.position - b.position).map((c: any) => ({
            ...c, parts: (c.parts || []).sort((a: any, b: any) => a.position - b.position),
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
      } catch (e) { console.error(e); }
      finally { if (alive) setReady(true); }
    })();
    return () => { alive = false; };
  }, [course?.id, user?.id]);

  /* ── Restore view on reload ── */
  useEffect(() => {
    if (!ready || tree.length === 0) return;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (!s.view || s.view === "subjects") return;
      isRestoringRef.current = true;
      if (s.sIdx != null && tree[s.sIdx]) {
        setActiveSubjectIdx(s.sIdx);
        const subj = tree[s.sIdx];
        if (s.cIdx != null && subj.chapters[s.cIdx]) {
          setActiveChapterIdx(s.cIdx);
          const ch = subj.chapters[s.cIdx];
          if (s.pId) {
            const part = ch.parts.find((p: Part) => p.id === s.pId);
            if (part) setActivePart({ ...part, chapterName: ch.name, subjectName: subj.name });
          }
        }
      }
      setView(s.view);
      setTimeout(() => { isRestoringRef.current = false; }, 50);
    } catch { isRestoringRef.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tree]);

  /* ── Save view ── */
  useEffect(() => {
    if (!ready || isRestoringRef.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        view, sIdx: activeSubjectIdx, cIdx: activeChapterIdx, pId: activePart?.id ?? null,
      }));
    } catch { /* noop */ }
  }, [ready, view, activeSubjectIdx, activeChapterIdx, activePart?.id]);

  /* ── Device back button ── */
  useEffect(() => {
    if (view !== "subjects" && !isPopRef.current && !isRestoringRef.current) {
      window.history.pushState(null, "");
    }
  }, [view]);

  useEffect(() => {
    const onPop = () => {
      if (view !== "subjects") {
        isPopRef.current = true;
        goBack();
        setTimeout(() => { isPopRef.current = false; }, 50);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  /* ── Derived ── */
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

  const isSubjectLocked = useCallback((subj: Subject) => {
    if (enrolled) return false;
    return !subj.chapters.some((c) => c.parts.some((p) => p.is_preview));
  }, [enrolled]);

  const isChapterLocked = useCallback((ch: Chapter) => {
    if (enrolled) return false;
    return !ch.parts.some((p) => p.is_preview);
  }, [enrolled]);

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

  const toggleLike = useCallback((partId: string) => {
    setLikes((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) { next.delete(partId); toast("Removed like", { duration: 1000 }); }
      else { next.add(partId); toast("Liked!", { duration: 1000 }); }
      localStorage.setItem("lecture_likes", JSON.stringify([...next]));
      return next;
    });
  }, []);

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
    if (min <= 0) return;
    try {
      const ok = await awardWatchedMinute(user.id, activePart.id, min, course.id);
      if (ok) toast.success("+1 coin 💰", { duration: 1200 });
    } catch (e) { console.error(e); }
  }, [user, activePart, course]);

  const isTestDone = useCallback((id: string) => testCompletions.has(id), [testCompletions]);

  /* ══════════════════════════════════════════════════════
     Error / Loading
     ════════════════════════════════════════════════════════ */
  if (courseErr) {
    return (
      <div className="flex flex-col items-center justify-center h-[100dvh] gap-3 bg-background px-6 text-center">
        <BookOpen className="w-8 h-8 text-muted-foreground/30" />
        <h2 className="font-bold text-base">Course not found</h2>
        <p className="text-xs text-muted-foreground max-w-[240px]">This course may have been removed or the link is incorrect.</p>
        <Button variant="outline" onClick={() => navigate("/courses")} className="mt-1 rounded-xl h-10 px-5 text-sm">Browse Courses</Button>
      </div>
    );
  }
  if (!course || !ready) return <ViewSkeleton view={skeletonView} />;

  /* ════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col h-[100dvh] bg-background">

      {/* ─── HEADER ─── */}
      <header
        className={cn(
          "shrink-0 flex items-center gap-2 px-4 border-b border-border/40 bg-card z-30",
          view === "player" ? "h-[64px] sm:h-14" : "h-14",
        )}
      >
        <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10 rounded-xl" onClick={goBack} aria-label="Go back">
          <ArrowLeft className="w-[18px] h-[18px]" />
        </Button>
        <div className="min-w-0 flex-1 overflow-hidden">
          <Breadcrumb items={breadcrumbs} onNavigate={navigateTo} />
        </div>
        <div className="shrink-0 ml-1">
          {user && <GamifyChip />}
        </div>
      </header>

      {/* ─── CONTENT ─── */}
      <main className={cn(
        "flex-1 min-h-0",
        view === "player" ? "flex flex-col lg:flex-row overflow-hidden" : "overflow-y-auto scroll-smooth",
      )}>

        {/* ══════ SUBJECTS ══════ */}
        {view === "subjects" && (
          <div className="p-4 sm:p-5 lg:p-6 space-y-5">
            <div>
              <h2 className="font-bold text-base sm:text-lg text-foreground">Subjects</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {tree.length} {tree.length === 1 ? "subject" : "subjects"} in this course
              </p>
            </div>
            {tree.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {tree.map((subj, i) => {
                  const parts = subj.chapters.flatMap((c) => c.parts);
                  const done = parts.filter((p) => completed.has(p.id)).length;
                  return (
                    <Card key={subj.id} name={subj.name} items={subj.chapters.length}
                      done={done} total={parts.length} color={PALETTE[i % PALETTE.length]}
                      onClick={() => openSubject(i)} locked={isSubjectLocked(subj)}
                      label={subj.chapters.length === 1 ? "chapter" : "chapters"} index={i} />
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={BookOpen} title="No subjects yet" desc="Content is being prepared for this course." />
            )}
            {tests.filter((t) => t.scope === "course").length > 0 && (
              <div className="space-y-2 pt-1">
                <h3 className="font-semibold text-xs text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" />Course Assessment
                </h3>
                <div className="max-w-lg">
                  {tests.filter((t) => t.scope === "course").map((t) => (
                    <TestCard key={t.id} test={t} done={isTestDone(t.id)} variant="prominent" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════ CHAPTERS ══════ */}
        {view === "chapters" && activeSubject && (
          <div className="p-4 sm:p-5 lg:p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${PALETTE[activeSubjectIdx! % PALETTE.length].accent}12` }}>
                <BookOpen className="w-6 h-6" style={{ color: PALETTE[activeSubjectIdx! % PALETTE.length].accent }} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-base sm:text-lg text-foreground leading-tight">{activeSubject.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeSubject.chapters.length} {activeSubject.chapters.length === 1 ? "chapter" : "chapters"} ·{" "}
                  {activeSubject.chapters.flatMap((c) => c.parts).length} lectures
                </p>
                {(() => {
                  const all = activeSubject.chapters.flatMap((c) => c.parts);
                  if (all.length === 0) return null;
                  const done = all.filter((p) => completed.has(p.id)).length;
                  return (
                    <div className="mt-2.5 space-y-1">
                      <ProgressBar value={(done / all.length) * 100} color={PALETTE[activeSubjectIdx! % PALETTE.length].accent} />
                      <span className="text-[11px] text-muted-foreground">{done}/{all.length} completed</span>
                    </div>
                  );
                })()}
              </div>
            </div>
            {activeSubject.chapters.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {activeSubject.chapters.map((ch, i) => {
                  const done = ch.parts.filter((p) => completed.has(p.id)).length;
                  return (
                    <Card key={ch.id} name={ch.name} items={ch.parts.length}
                      done={done} total={ch.parts.length} color={PALETTE[(activeSubjectIdx! + i + 1) % PALETTE.length]}
                      onClick={() => openChapter(i)} locked={isChapterLocked(ch)}
                      label={ch.parts.length === 1 ? "lecture" : "lectures"} index={i} />
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={BookOpen} title="No chapters yet" desc="Chapters are being added to this subject." />
            )}
            {tests.filter((t) => t.scope === "subject" && t.subject_id === activeSubject.id).length > 0 && (
              <div className="space-y-2 pt-1">
                <h3 className="font-semibold text-xs text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                  <ListChecks className="w-3.5 h-3.5 text-amber-500" />Subject Test
                </h3>
                <div className="max-w-lg space-y-2">
                  {tests.filter((t) => t.scope === "subject" && t.subject_id === activeSubject.id).map((t) => (
                    <TestCard key={t.id} test={t} done={isTestDone(t.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════ LECTURES ══════ */}
        {view === "lectures" && activeChapter && (
          <div className="p-4 sm:p-5 lg:p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${PALETTE[(activeSubjectIdx! + activeChapterIdx! + 1) % PALETTE.length].accent}12` }}>
                <ListChecks className="w-6 h-6" style={{ color: PALETTE[(activeSubjectIdx! + activeChapterIdx! + 1) % PALETTE.length].accent }} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-base sm:text-lg text-foreground leading-tight">{activeChapter.name}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeChapter.parts.filter((p) => completed.has(p.id)).length}/{activeChapter.parts.length} completed
                </p>
                <ProgressBar
                  value={activeChapter.parts.length > 0
                    ? (activeChapter.parts.filter((p) => completed.has(p.id)).length / activeChapter.parts.length) * 100 : 0}
                  color={PALETTE[(activeSubjectIdx! + activeChapterIdx! + 1) % PALETTE.length].accent}
                  className="mt-2 max-w-[200px] sm:max-w-[260px]"
                />
              </div>
            </div>
            {activeChapter.parts.length > 0 ? (
              <div className="space-y-2">
                {activeChapter.parts.map((p, i) => {
                  const ext: ExtendedPart = { ...p, chapterName: activeChapter.name, subjectName: activeSubject?.name || "" };
                  return (
                    <LectureItem key={p.id} part={ext} active={activePart?.id === p.id}
                      done={completed.has(p.id)} locked={isPartLocked(p)}
                      onClick={() => openLecture(ext)} liked={likes.has(p.id)}
                      onLike={() => toggleLike(p.id)} idx={i} />
                  );
                })}
              </div>
            ) : (
              <EmptyState icon={BookOpen} title="No lectures yet" desc="Lectures are being uploaded for this chapter." />
            )}
            {tests.filter((t) => t.scope === "chapter" && t.chapter_id === activeChapter.id).length > 0 && (
              <div className="space-y-2 pt-1">
                <h3 className="font-semibold text-xs text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
                  <ListChecks className="w-3.5 h-3.5 text-amber-500" />Chapter Test
                </h3>
                <div className="max-w-lg space-y-2">
                  {tests.filter((t) => t.scope === "chapter" && t.chapter_id === activeChapter.id).map((t) => (
                    <TestCard key={t.id} test={t} done={isTestDone(t.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════ PLAYER ══════ */}
        {view === "player" && activePart && (
          <>
            <div className="flex flex-col min-h-0 w-full lg:flex-1">
              <div className="shrink-0 relative w-full bg-black aspect-video lg:aspect-auto lg:flex-1 lg:min-h-0">
                <div className="absolute inset-0">
                  {activePart.kind === "recorded" ? (
                    <VideoPlayer
                      key={activePart.id}
                      video={{ id: activePart.video_id, title: activePart.name, duration: activePart.duration ?? undefined }}
                      onProgress={setWatchPct} onComplete={handleComplete} onMinuteWatched={handleMinute}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-zinc-500 text-sm">
                      Video not available
                    </div>
                  )}
                </div>
                {activePart.kind === "recorded" && watchPct > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10 z-50">
                    <div className="h-full bg-primary/80 transition-all duration-700 ease-out rounded-r-full" style={{ width: `${watchPct}%` }} />
                  </div>
                )}
              </div>

              <div className="shrink-0 bg-card border-t border-border/40">
                <div className="px-4 sm:px-5 lg:px-6 py-3 sm:py-4">
                  <h2 className="text-sm sm:text-base font-bold text-foreground leading-snug">{activePart.name}</h2>
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1.5 text-xs sm:text-[13px] text-muted-foreground">
                    <span className="font-semibold text-primary">{activePart.subjectName}</span>
                    <span className="text-border/60">·</span>
                    <span>{activePart.chapterName}</span>
                    {activePart.duration && (
                      <>
                        <span className="text-border/60">·</span>
                        <span className="flex items-center gap-0.5"><Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />{activePart.duration}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="px-4 sm:px-5 lg:px-6 pb-3 sm:pb-4 flex items-center gap-2 flex-wrap">
                  {completed.has(activePart.id) && (
                    <span className="flex items-center gap-1.5 text-green-600 dark:text-green-500 font-semibold text-xs bg-green-50 dark:bg-green-900/20 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-lg border border-green-400 dark:border-green-700 h-9 sm:h-10">
                      <CheckCircle2 className="w-3.5 h-3.5" />Done
                    </span>
                  )}
                  <Button
                    variant="ghost" size="sm"
                    onClick={() => toggleLike(activePart.id)}
                    className={cn("h-9 sm:h-10 gap-1.5 text-xs sm:text-[13px] font-medium rounded-lg px-3 sm:px-3.5",
                      likes.has(activePart.id) && "text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20")}
                  >
                    <Heart className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4", likes.has(activePart.id) && "fill-current")} />
                    {likes.has(activePart.id) ? "Liked" : "Like"}
                  </Button>
                  {activePart.notes_url && (
                    <Button variant="outline" size="sm" asChild className="h-9 sm:h-10 text-xs sm:text-[13px] font-medium gap-1.5 rounded-lg px-3 sm:px-3.5">
                      <a href={activePart.notes_url} target="_blank" rel="noopener noreferrer">
                        <StickyNote className="w-3.5 h-3.5 sm:w-4 sm:h-4" />Notes
                      </a>
                    </Button>
                  )}
                  {activePart.kind === "recorded" && (
                    <Button
                      variant={commentOpen ? "secondary" : "outline"}
                      size="sm"
                      onClick={() => setCommentOpen((v: boolean) => !v)}
                      className="h-9 sm:h-10 text-xs sm:text-[13px] font-medium gap-1.5 rounded-lg px-3 sm:px-3.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      {commentOpen ? "Hide Comments" : "Comments"}
                    </Button>
                  )}
                </div>
              </div>

              {activePart.kind === "recorded" && commentOpen && (
                <div className="flex lg:hidden flex-col flex-1 min-h-[50dvh] border-t border-border/40 bg-card overflow-hidden animate-in slide-in-from-bottom-2 duration-300">
                  <CommentUI partId={activePart.id} />
                </div>
              )}
            </div>

            {activePart.kind === "recorded" && commentOpen && (
              <div className="hidden lg:flex w-[340px] xl:w-[400px] shrink-0 border-l border-border/40 bg-card flex-col overflow-hidden animate-in slide-in-from-right-2 duration-300">
                <CommentUI partId={activePart.id} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}