import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Loader2, Clock, Trophy, CheckCircle2, XCircle, Coins,
  ChevronLeft, ChevronRight, LayoutGrid, X, AlertTriangle,
  ArrowLeft, Target, Zap, ShieldCheck, RotateCcw, BookOpen,
  SkipForward,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSEO } from '@/lib/seo';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════ */
interface Test {
  id: string;
  title: string;
  duration_minutes: number;
  pass_score: number;
  scope: string;
  [k: string]: unknown;
}

interface QuestionOption {
  id: string;
  text: string;
  position: number;
  is_correct: boolean;
}

interface Question {
  id: string;
  text: string;
  image_url: string | null;
  marks: number;
  position: number;
  question_options: QuestionOption[];
}

interface Result {
  score: number;
  total: number;
  pct: number;
  passed: boolean;
  correct: number;
  wrong: number;
  coins_delta: number;
  xp_delta: number;
  locked: boolean;
}

/* ════════════════════════════════════════════════════════
   Skeleton
   ════════════════════════════════════════════════════════ */
function TestSkeleton() {
  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full min-h-0">
      <header className="px-4 md:px-6 py-3 border-b border-border/30 bg-card/50">
        <div className="flex justify-between items-center gap-3">
          <div className="h-5 w-48 rounded-md bg-muted animate-pulse" />
          <div className="h-8 w-20 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="flex items-center gap-3 mt-2.5">
          <div className="h-1.5 flex-1 rounded-full bg-muted animate-pulse" />
          <div className="h-4 w-8 rounded bg-muted animate-pulse" />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6">
        <div className="h-4 w-24 mx-auto rounded bg-muted animate-pulse mb-6" />
        <div className="rounded-xl border border-border/30 p-5 space-y-4">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded bg-muted animate-pulse shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-full rounded bg-muted animate-pulse" />
              <div className="h-4 w-3/4 rounded bg-muted animate-pulse" />
            </div>
          </div>
          <div className="space-y-2.5 pt-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border/20">
                <div className="w-5 h-5 rounded-full border-2 border-muted animate-pulse shrink-0" />
                <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-border/30 px-4 md:px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-muted animate-pulse" />
          <div className="h-9 w-20 rounded-lg bg-muted animate-pulse" />
          <div className="flex-1" />
          <div className="h-9 w-24 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Confirm Dialog
   ════════════════════════════════════════════════════════ */
function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmText = "Submit",
  variant = "default",
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  confirmText?: string;
  variant?: "default" | "warning";
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div
        className="relative bg-card border border-border/50 rounded-2xl p-5 sm:p-6 w-full max-w-sm shadow-xl"
        style={{ animation: 'scaleIn .2s ease-out' }}
      >
        <style>{`@keyframes scaleIn{from{transform:scale(.95);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
        <div className={cn(
          "w-11 h-11 rounded-xl flex items-center justify-center mb-4",
          variant === "warning" ? "bg-amber-100 dark:bg-amber-900/30" : "bg-primary/10",
        )}>
          {variant === "warning"
            ? <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            : <Target className="w-5 h-5 text-primary" />
          }
        </div>
        <h3 className="font-semibold text-base text-foreground mb-1.5">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-6">{description}</p>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={onCancel} className="w-full sm:w-auto h-10 rounded-lg text-sm">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            className={cn(
              "w-full sm:w-auto h-10 rounded-lg text-sm font-medium",
              variant === "warning" && "bg-amber-600 hover:bg-amber-700 text-white",
            )}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   Timer Display
   ════════════════════════════════════════════════════════ */
const TimerDisplay = memo(function TimerDisplay({ seconds }: { seconds: number }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isWarning = seconds < 120;
  const isCritical = seconds < 30;

  return (
    <div className={cn(
      "flex items-center gap-1.5 sm:gap-2 font-mono px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg border transition-all duration-300",
      isCritical
        ? "bg-destructive/15 border-destructive/30 text-destructive animate-pulse"
        : isWarning
          ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400"
          : "bg-muted/50 border-border/40 text-foreground",
    )}>
      <Clock className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4", isCritical && "animate-spin")} />
      <span className="text-xs sm:text-sm font-semibold tabular-nums">
        {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
      </span>
    </div>
  );
});

/* ════════════════════════════════════════════════════════
   Option Badge
   ════════════════════════════════════════════════════════ */
function OptionBadge({ letter, selected }: { letter: string; selected: boolean }) {
  return (
    <span className={cn(
      "w-6 h-6 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-all duration-200",
      selected ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted/60 text-muted-foreground",
    )}>
      {letter}
    </span>
  );
}

/* ════════════════════════════════════════════════════════
   Question Grid
   ════════════════════════════════════════════════════════ */
const QuestionGrid = memo(function QuestionGrid({
  questions,
  answers,
  currentQ,
  onSelect,
  onClose,
  onSubmit,
  canSubmit,
  submitting,
}: {
  questions: Question[];
  answers: Record<string, string>;
  currentQ: number;
  onSelect: (idx: number) => void;
  onClose: () => void;
  onSubmit: () => void;
  canSubmit: boolean;
  submitting: boolean;
}) {
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-card border border-border/50 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp .25s ease-out' }}
      >
        <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/30">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Question Navigator</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{answeredCount} of {questions.length} answered</p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
            {questions.map((q, i) => {
              const isAnswered = !!answers[q.id];
              const isCurrent = i === currentQ;
              return (
                <button
                  key={q.id}
                  onClick={() => onSelect(i)}
                  className={cn(
                    "aspect-square rounded-lg text-xs font-bold transition-all duration-150 active:scale-95",
                    isCurrent
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 scale-105 ring-2 ring-primary/30"
                      : isAnswered
                        ? "bg-primary/15 text-primary border border-primary/25 hover:bg-primary/20"
                        : "bg-muted/40 text-muted-foreground/70 border border-border/30 hover:bg-muted/60",
                  )}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary shadow-sm" /> Current
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary/15 border border-primary/25" /> Answered
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-muted/40 border border-border/30" /> Unanswered
            </span>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-border/30 bg-muted/20">
          <Button onClick={onSubmit} disabled={!canSubmit || submitting} className="w-full h-11 rounded-lg text-sm font-medium">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Target className="w-4 h-4 mr-2" />}
            Submit Test ({answeredCount}/{questions.length})
          </Button>
        </div>
      </div>
    </div>
  );
});

/* ════════════════════════════════════════════════════════
   Review Card
   ════════════════════════════════════════════════════════ */
const ReviewCard = memo(function ReviewCard({
  question,
  index,
  selectedOptionId,
}: {
  question: Question;
  index: number;
  selectedOptionId?: string;
}) {
  const correctOpt = question.question_options.find(o => o.is_correct);
  const yourOpt = question.question_options.find(o => o.id === selectedOptionId);
  const isCorrect = yourOpt?.id === correctOpt?.id;
  const isSkipped = !selectedOptionId;

  return (
    <div className={cn(
      "rounded-xl border p-4 sm:p-5 transition-colors",
      isCorrect
        ? "border-green-300/50 dark:border-green-700/40 bg-green-50/40 dark:bg-green-950/10"
        : isSkipped
          ? "border-border/40 bg-card"
          : "border-red-300/50 dark:border-red-700/40 bg-red-50/40 dark:bg-red-950/10",
    )}>
      <div className="flex items-start gap-3 mb-3">
        <span className="text-xs font-bold text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md shrink-0 mt-0.5">
          Q{index + 1}
        </span>
        <p className="text-sm font-medium text-foreground leading-relaxed flex-1 break-words">{question.text}</p>
        <div className="shrink-0 mt-0.5">
          {isCorrect ? (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          ) : isSkipped ? (
            <SkipForward className="w-5 h-5 text-muted-foreground/40" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500" />
          )}
        </div>
      </div>
      {question.image_url && (
        <img src={question.image_url} alt="" loading="lazy" className="mt-2 mb-3 max-h-40 rounded-lg w-auto ml-9" />
      )}
      <div className="ml-9 space-y-1.5 text-xs">
        {!isCorrect && (
          <div className={cn(
            "flex items-start gap-2 px-3 py-2 rounded-lg",
            isSkipped ? "bg-muted/40 text-muted-foreground" : "bg-red-100/60 dark:bg-red-950/20 text-red-600 dark:text-red-400",
          )}>
            <span className="font-medium shrink-0">Your answer:</span>
            <span className={isSkipped ? "italic" : ""}>{yourOpt?.text || "Skipped"}</span>
          </div>
        )}
        {(!isCorrect || !isSkipped) && correctOpt && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-green-100/60 dark:bg-green-950/20 text-green-600 dark:text-green-400">
            <span className="font-medium shrink-0">Correct:</span>
            <span>{correctOpt.text}</span>
          </div>
        )}
      </div>
    </div>
  );
});

/* ════════════════════════════════════════════════════════
   MAIN TEST PAGE
   ════════════════════════════════════════════════════════ */
const TestPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();

  // ── All state declarations first ──
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reattempting, setReattempting] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [showGrid, setShowGrid] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const submitRef = useRef<(force?: boolean) => Promise<void>>();

  useSEO({ title: test ? `${test.title} — Test` : 'Test', description: 'Take your assessment test.' });

  /* ── Load Test ── */
  const loadTest = useCallback(async (forceFresh = false) => {
    if (!user || !id) return;
    setLoading(true);
    setCurrentQ(0);

    const { data: t } = await supabase.from('tests').select('*').eq('id', id).maybeSingle();
    if (!t) { toast.error('Test not found or not accessible'); nav(-1); return; }
    setTest(t as Test);

    const { data: qs } = await supabase
      .from('questions')
      .select('id, text, image_url, marks, position, question_options(id, text, position, is_correct)')
      .eq('test_id', id)
      .order('position');

    const sorted = (qs || []).map((q: any) => ({
      ...q,
      question_options: (q.question_options || []).sort((a: any, b: any) => a.position - b.position),
    })) as Question[];

    setQuestions(sorted);
    setSecondsLeft((t as Test).duration_minutes * 60);
    setAnswers({});

    if (!forceFresh) {
      const { data: lastAttempt } = await supabase
        .from('test_attempts')
        .select('id, score, total, passed, finished_at')
        .eq('user_id', user.id).eq('test_id', id)
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(1).maybeSingle();

      if (lastAttempt) {
        const { data: ans } = await supabase
          .from('test_answers')
          .select('question_id, selected_option_id, is_correct')
          .eq('attempt_id', lastAttempt.id);

        const ansMap: Record<string, string> = {};
        let correct = 0;
        let wrong = 0;
        for (const a of ans || []) {
          if (a.selected_option_id) ansMap[a.question_id] = a.selected_option_id;
          if (a.is_correct) correct++;
          else if (a.selected_option_id) wrong++;
        }
        setAnswers(ansMap);
        const pct = lastAttempt.total > 0 ? Math.round((lastAttempt.score / lastAttempt.total) * 100) : 0;
        setResult({ score: lastAttempt.score, total: lastAttempt.total, pct, passed: lastAttempt.passed, correct, wrong, coins_delta: 0, xp_delta: 0, locked: true });
        setLoading(false);
        return;
      }
    }
    setResult(null);
    setLoading(false);
  }, [id, user, nav]);

  /* ── Submit (declared BEFORE effects that use it) ── */
  const submit = useCallback(async (force = false) => {
    if (!user || !test || submitting) return;
    const answered = Object.keys(answers).length;
    if (!force && answered < questions.length) {
      setShowConfirm(true);
      return;
    }
    setSubmitting(true);
    setShowConfirm(false);
    try {
      const { data, error } = await supabase.functions.invoke('grade-test', { body: { test_id: test.id, answers } });
      if (error) { toast.error(error.message || 'Could not submit test'); return; }
      if (!data || data.error) { toast.error(data?.error || 'Could not submit test'); return; }
      setResult(data);
      toast.success('Test submitted!');
    } catch (e: any) {
      toast.error(e.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  }, [user, test, answers, questions.length, submitting]);

  // Keep ref in sync
  submitRef.current = submit;

  /* ── Handle Reattempt ── */
  const handleReattempt = useCallback(async () => {
    if (!test) return;
    setReattempting(true);
    try {
      const { data, error } = await supabase.functions.invoke('start-test-attempt', { body: { test_id: test.id } });
      if (error || data?.error) { toast.error(data?.error || error?.message || 'Could not start re-attempt'); return; }
      await loadTest(true);
      toast.success('New attempt started!');
    } finally {
      setReattempting(false);
    }
  }, [test, loadTest]);

  /* ── Select Answer ── */
  const selectAnswer = useCallback((questionId: string, optionId: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: prev[questionId] === optionId ? undefined as unknown as string : optionId,
    }));
  }, []);

  /* ── Go To Question ── */
  const goToQuestion = useCallback((idx: number) => {
    setCurrentQ(idx);
    setShowGrid(false);
  }, []);

  /* ══════════════════════════════════════════════════════
     EFFECTS (all after callbacks)
     ══════════════════════════════════════════════════════ */

  /* ── Load test on mount ── */
  useEffect(() => { loadTest(false); }, [loadTest]);

  /* ── Timer ── */
  useEffect(() => {
    if (result || secondsLeft <= 0 || loading) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    };
  }, [result, loading]);

  /* ── Auto-submit on time up ── */
  useEffect(() => {
    if (!loading && !result && secondsLeft === 0 && test) {
      toast.warning('Time is up! Auto-submitting...');
      submitRef.current?.(true);
    }
  }, [secondsLeft, loading, result, test]);

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */
  if (loading) return <TestSkeleton />;
  if (!test) return null;

  /* ── Result Screen ── */
  if (result) {
    return (
      <div className="flex-1 overflow-y-auto">
        {reattempting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3 p-6">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Starting new attempt…</p>
            </div>
          </div>
        )}
        <div className="px-4 md:px-6 py-6 md:py-8 max-w-3xl mx-auto w-full space-y-6">
          <div className={cn(
            "rounded-2xl border p-6 sm:p-8 text-center",
            result.passed
              ? "border-green-300/50 dark:border-green-700/40 bg-gradient-to-b from-green-50/80 to-card dark:from-green-950/20 dark:to-card"
              : "border-red-300/50 dark:border-red-700/40 bg-gradient-to-b from-red-50/80 to-card dark:from-red-950/20 dark:to-card",
          )}>
            <div className={cn(
              "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4",
              result.passed ? "bg-green-500/15" : "bg-red-500/15",
            )}>
              {result.passed ? <Trophy className="w-8 h-8 text-green-500" /> : <XCircle className="w-8 h-8 text-red-500" />}
            </div>
            <div className={cn(
              "inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3",
              result.passed ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-red-500/15 text-red-600 dark:text-red-400",
            )}>
              {result.passed ? <><ShieldCheck className="w-3.5 h-3.5" /> Passed</> : <><XCircle className="w-3.5 h-3.5" /> Failed</>}
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-1">
              {result.score}<span className="text-lg sm:text-xl text-muted-foreground font-normal"> / {result.total}</span>
            </h2>
            <p className="text-sm text-muted-foreground mb-5">{result.pct}% · Pass mark: {test.pass_score}%</p>
            <div className="flex items-center justify-center gap-6 sm:gap-8 mb-6">
              <div className="text-center">
                <div className="text-lg sm:text-xl font-bold text-green-600 dark:text-green-400">{result.correct}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Correct</div>
              </div>
              <div className="w-px h-8 bg-border/50" />
              <div className="text-center">
                <div className="text-lg sm:text-xl font-bold text-red-600 dark:text-red-400">{result.wrong}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Wrong</div>
              </div>
              <div className="w-px h-8 bg-border/50" />
              <div className="text-center">
                <div className="text-lg sm:text-xl font-bold text-muted-foreground">{questions.length - result.correct - result.wrong}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Skipped</div>
              </div>
            </div>
            {!result.locked && (result.coins_delta !== 0 || result.xp_delta > 0) && (
              <div className="flex items-center justify-center gap-4 mb-6 p-3 rounded-xl bg-muted/30 border border-border/30">
                {result.coins_delta !== 0 && (
                  <div className={cn("flex items-center gap-1.5 text-sm font-bold", result.coins_delta >= 0 ? "text-[hsl(var(--coin))]" : "text-destructive")}>
                    <Coins className="w-4 h-4" />{result.coins_delta >= 0 ? '+' : ''}{result.coins_delta} coins
                  </div>
                )}
                {result.xp_delta > 0 && (
                  <div className="flex items-center gap-1.5 text-sm font-bold text-[hsl(var(--xp))]">
                    <Zap className="w-4 h-4" />+{result.xp_delta} XP
                  </div>
                )}
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
              <Button variant="outline" onClick={() => nav(-1)} className="w-full sm:w-auto h-10 sm:h-11 rounded-xl text-sm gap-2">
                <ArrowLeft className="w-4 h-4" />Go Back
              </Button>
              <Button onClick={handleReattempt} disabled={reattempting} className="w-full sm:w-auto h-10 sm:h-11 rounded-xl text-sm gap-2">
                {reattempting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                Re-attempt
              </Button>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Answer Review</h3>
            </div>
            <div className="space-y-2.5 pb-8">
              {questions.map((q, i) => (
                <ReviewCard key={q.id} question={q} index={i} selectedOptionId={answers[q.id]} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── Active Test ── */
  const q = questions[currentQ];
  if (!q) return null;

  const answered = Object.keys(answers).length;
  const isLast = currentQ === questions.length - 1;
  const isFirst = currentQ === 0;

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full min-h-0">
      <header className="px-4 md:px-6 py-3 border-b border-border/30 bg-background/95 backdrop-blur-sm sticky top-14 z-20 shrink-0">
        <div className="flex justify-between items-center gap-3">
          <h1 className="font-semibold text-sm sm:text-base text-foreground truncate">{test.title}</h1>
          <TimerDisplay seconds={secondsLeft} />
        </div>
        <div className="flex items-center gap-3 mt-2.5">
          <Progress value={questions.length ? (answered / questions.length) * 100 : 0} className="h-1 flex-1" />
          <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0 tabular-nums font-medium">{answered}/{questions.length}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-5 sm:py-6">
        <div className="text-center mb-4 sm:mb-5">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-full">
            <span className="font-semibold text-foreground">{currentQ + 1}</span>
            <span>of</span>
            <span className="font-semibold text-foreground">{questions.length}</span>
          </span>
        </div>

        <div className="rounded-xl border border-border/40 bg-card overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-border/20">
            <div className="flex items-start gap-3">
              <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md shrink-0 mt-0.5">Q{currentQ + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm sm:text-[15px] text-foreground leading-relaxed break-words">{q.text}</p>
                {q.image_url && <img src={q.image_url} alt="" loading="lazy" className="mt-3 max-h-48 sm:max-h-64 rounded-lg w-auto" />}
                <span className="text-[11px] text-muted-foreground mt-2 inline-block">{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
          <div className="p-3 sm:p-4 space-y-1.5 sm:space-y-2">
            {q.question_options.map((opt, oi) => {
              const isSelected = answers[q.id] === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => selectAnswer(q.id, opt.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 sm:gap-3 p-3 sm:p-3.5 rounded-lg border text-left transition-all duration-150 active:scale-[0.995]",
                    "focus-visible:ring-2 focus-visible:ring-primary/30 outline-none",
                    isSelected
                      ? "bg-primary/8 border-primary/30 shadow-sm shadow-primary/5 hover:bg-primary/12"
                      : "border-border/30 hover:border-border/50 hover:bg-muted/30",
                  )}
                  style={{ touchAction: 'manipulation' }}
                >
                  <OptionBadge letter={String.fromCharCode(65 + oi)} selected={isSelected} />
                  <span className="text-sm sm:text-[14px] text-foreground/90 leading-relaxed break-words flex-1">{opt.text}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm border-t border-border/30 px-4 md:px-6 py-2.5 sm:py-3 z-20 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowGrid(true)} className="shrink-0 h-9 w-9 p-0 sm:h-10 sm:w-auto sm:px-3 rounded-lg" title="Question navigator">
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline text-xs ml-1.5 font-medium">{answered}/{questions.length}</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentQ(c => Math.max(0, c - 1))} disabled={isFirst} className="shrink-0 h-9 sm:h-10 rounded-lg gap-1">
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline text-xs">Prev</span>
          </Button>
          <div className="flex-1" />
          {isLast ? (
            <Button onClick={() => submit(false)} disabled={submitting || answered === 0} size="sm" className="h-9 sm:h-10 px-4 sm:px-5 rounded-lg gap-1.5 text-xs sm:text-sm font-medium">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
              Submit
            </Button>
          ) : (
            <Button size="sm" onClick={() => setCurrentQ(c => c + 1)} className="h-9 sm:h-10 px-4 sm:px-5 rounded-lg gap-1 text-xs sm:text-sm font-medium">
              Next<ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {showGrid && (
        <QuestionGrid
          questions={questions} answers={answers} currentQ={currentQ}
          onSelect={goToQuestion} onClose={() => setShowGrid(false)}
          onSubmit={() => { setShowGrid(false); submit(false); }}
          canSubmit={answered > 0} submitting={submitting}
        />
      )}

      <ConfirmDialog
        open={showConfirm} onConfirm={() => submit(true)} onCancel={() => setShowConfirm(false)}
        title="Submit Test?"
        description={`${questions.length - answered} question${questions.length - answered > 1 ? 's are' : ' is'} unanswered. Are you sure you want to submit?`}
        confirmText="Submit Anyway" variant="warning"
      />
    </div>
  );
};

export default TestPage;