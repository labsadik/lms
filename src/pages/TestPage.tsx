import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Clock, Trophy, CheckCircle2, XCircle, Coins, ChevronLeft, ChevronRight, LayoutGrid, X } from 'lucide-react';
import { toast } from 'sonner';
import { useSEO } from '@/lib/seo';

const TestPage = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const [test, setTest] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reattempting, setReattempting] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [showGrid, setShowGrid] = useState(false);

  useSEO({ title: test ? `${test.title} — Test` : 'Test', description: 'Take your test.' });

  const loadTest = useCallback(async (forceFresh = false) => {
    if (!user || !id) return;
    setLoading(true);
    setCurrentQ(0);
    const { data: t } = await supabase.from('tests').select('*').eq('id', id).maybeSingle();
    if (!t) { toast.error('Test not found or not accessible'); nav(-1); return; }
    setTest(t);
    const { data: qs } = await supabase
      .from('questions')
      .select('id, text, image_url, marks, position, question_options(id, text, position, is_correct)')
      .eq('test_id', id)
      .order('position');
    const sorted = (qs || []).map((q: any) => ({
      ...q,
      question_options: (q.question_options || []).sort((a: any, b: any) => a.position - b.position),
    }));
    setQuestions(sorted);
    setSecondsLeft(t.duration_minutes * 60);
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
        setResult({
          score: lastAttempt.score, total: lastAttempt.total, pct,
          passed: lastAttempt.passed, correct, wrong,
          coins_delta: 0, xp_delta: 0, locked: true,
        });
        setLoading(false);
        return;
      }
    }

    setResult(null);
    setLoading(false);
  }, [id, user, nav]);

  useEffect(() => { loadTest(false); }, [loadTest]);

  useEffect(() => {
    if (result || secondsLeft <= 0 || loading) return;
    const t = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [result, secondsLeft, loading]);

  const submit = useCallback(async (force = false) => {
    if (!user || !test || submitting) return;
    const answered = Object.keys(answers).length;
    if (!force && answered < questions.length) {
      const missing = questions.length - answered;
      if (!confirm(`${missing} question${missing > 1 ? 's are' : ' is'} unanswered. Submit anyway?`)) return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('grade-test', {
        body: { test_id: test.id, answers },
      });
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

  useEffect(() => {
    if (!loading && !result && secondsLeft === 0 && test) submit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  /* ─── Question Navigator Grid ─── */
  const QuestionGrid = () => (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => setShowGrid(false)}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-card border border-border rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 w-full sm:max-w-md max-h-[75vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'slideUp .25s ease-out' }}
      >
        <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm">Question Navigator</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowGrid(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        <div className="grid grid-cols-5 sm:grid-cols-6 gap-1.5 sm:gap-2">
          {questions.map((q, i) => {
            const isAnswered = !!answers[q.id];
            const isCurrent = i === currentQ;
            return (
              <button
                key={q.id}
                onClick={() => { setCurrentQ(i); setShowGrid(false); }}
                className={`aspect-square rounded-lg text-xs font-bold transition-all ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground scale-105 shadow-md'
                    : isAnswered
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
                }`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 sm:gap-4 mt-4 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary inline-block" /> Current</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-primary/15 border border-primary/30 inline-block" /> Answered</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-secondary inline-block" /> Unanswered</span>
        </div>
      </div>
    </div>
  );

  /* ─── Loading ─── */
  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
  if (!test) return null;

  /* ─── Result Screen ─── */
  if (result) {
    return (
      <div className="flex-1 px-3 sm:px-4 py-4 sm:py-6 max-w-3xl mx-auto w-full">
        {/* Re-attempt loading overlay */}
        {reattempting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm font-medium text-muted-foreground">Starting new attempt…</p>
            </div>
          </div>
        )}

        <Card className="p-5 sm:p-6 bg-card border-border text-center mb-4 sm:mb-6">
          {result.passed
            ? <CheckCircle2 className="w-12 h-12 sm:w-14 sm:h-14 text-green-500 mx-auto mb-2" />
            : <XCircle className="w-12 h-12 sm:w-14 sm:h-14 text-destructive mx-auto mb-2" />
          }
          <div className={`inline-block text-[11px] sm:text-xs font-bold uppercase px-2.5 py-0.5 rounded-full mb-2 ${result.passed ? 'bg-green-500/15 text-green-500' : 'bg-destructive/15 text-destructive'}`}>
            {result.passed ? 'Passed' : 'Failed'} · Attempt locked
          </div>
          <h2 className="text-xl sm:text-2xl font-bold mb-1">Score: {result.score} / {result.total}</h2>
          <p className="text-sm text-muted-foreground mb-2">{result.pct}% · pass mark {test.pass_score}%</p>
          <div className="text-xs text-muted-foreground mb-4">
            <span className="text-green-500">{result.correct} correct</span> ·{' '}
            <span className="text-destructive">{result.wrong} wrong</span> ·{' '}
            <span>{questions.length - result.correct - result.wrong} skipped</span>
          </div>
          {!result.locked && (
            <div className={`flex items-center justify-center gap-1 text-sm font-bold mb-4 ${result.coins_delta >= 0 ? 'text-[hsl(var(--coin))]' : 'text-destructive'}`}>
              <Coins className="w-4 h-4" /> {result.coins_delta >= 0 ? '+' : ''}{result.coins_delta} coins
              {result.xp_delta > 0 && (
                <span className="ml-2 flex items-center gap-1 text-[hsl(var(--xp))]">
                  <Trophy className="w-4 h-4" /> +{result.xp_delta} XP
                </span>
              )}
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button variant="outline" onClick={() => nav(-1)} className="w-full sm:w-auto">Back</Button>
            <Button
              onClick={async () => {
                setReattempting(true);
                try {
                  const { data, error } = await supabase.functions.invoke('start-test-attempt', { body: { test_id: test.id } });
                  if (error || data?.error) { toast.error(data?.error || error?.message || 'Could not start re-attempt'); return; }
                  await loadTest(true);
                } finally {
                  setReattempting(false);
                }
              }}
              disabled={reattempting}
              className="w-full sm:w-auto"
            >
              {reattempting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />Starting…</>
              ) : (
                'Re-attempt (new attempt)'
              )}
            </Button>
          </div>
        </Card>

        <h3 className="text-xs sm:text-sm font-bold uppercase text-muted-foreground mb-2 sm:mb-3">Answer Review</h3>
        <div className="space-y-2 sm:space-y-3 pb-8">
          {questions.map((q, i) => {
            const correctOpt = q.question_options.find((o: any) => o.is_correct);
            const yourOpt = q.question_options.find((o: any) => o.id === answers[q.id]);
            const isCorrect = yourOpt && correctOpt && yourOpt.id === correctOpt.id;
            return (
              <Card key={q.id} className="p-3 sm:p-4 bg-card border-border">
                <div className="text-sm font-medium mb-2 flex items-start gap-2">
                  <span className="text-xs font-bold text-primary mt-0.5 shrink-0">Q{i + 1}</span>
                  <span className="flex-1 break-words">{q.text}</span>
                  {isCorrect
                    ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  }
                </div>
                <div className="text-xs space-y-1 ml-5 sm:ml-6">
                  <div className={isCorrect ? 'text-green-500' : 'text-destructive'}>
                    Your answer: {yourOpt ? yourOpt.text : <span className="italic">skipped</span>}
                  </div>
                  {!isCorrect && correctOpt && <div className="text-green-500">Correct: {correctOpt.text}</div>}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  /* ─── Active Test — One-by-One ─── */
  const q = questions[currentQ];
  if (!q) return null;

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const answered = Object.keys(answers).length;
  const isLast = currentQ === questions.length - 1;

  return (
    <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full min-h-0">
      {/* ── Sticky Header ── */}
      <header className="px-3 sm:px-6 py-2.5 sm:py-3 sticky top-14 bg-background/95 backdrop-blur z-10 border-b border-border/50 shrink-0">
        <div className="flex justify-between items-center gap-2">
          <h1 className="font-bold text-sm sm:text-lg truncate">{test.title}</h1>
          <div className={`flex items-center gap-1.5 text-xs sm:text-sm font-mono px-2 sm:px-3 py-1 rounded-md shrink-0 ${secondsLeft < 60 ? 'bg-destructive/20 text-destructive animate-pulse' : 'bg-secondary text-foreground'}`}>
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <Progress value={questions.length ? (answered / questions.length) * 100 : 0} className="h-1.5 flex-1" />
          <span className="text-[11px] sm:text-xs text-muted-foreground shrink-0 tabular-nums">{answered}/{questions.length}</span>
        </div>
      </header>

      {/* ── Scrollable Question Area ── */}
      <div className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6">
        {/* Question counter */}
        <div className="text-center text-xs text-muted-foreground mb-3 sm:mb-4">
          Question <span className="font-bold text-foreground">{currentQ + 1}</span> of <span className="font-bold text-foreground">{questions.length}</span>
        </div>

        <Card className="p-4 sm:p-6 bg-card border-border">
          <div className="flex items-start gap-2 sm:gap-3 mb-4">
            <span className="text-xs font-bold text-primary mt-1 shrink-0">Q{currentQ + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm sm:text-base leading-relaxed break-words">{q.text}</p>
              {q.image_url && (
                <img src={q.image_url} alt="" loading="lazy" className="mt-3 max-h-48 sm:max-h-72 rounded-lg w-auto" />
              )}
              <span className="text-[11px] text-muted-foreground mt-1 inline-block">{q.marks} mark{q.marks > 1 && 's'}</span>
            </div>
          </div>

          <div className="space-y-2">
            {q.question_options.map((opt: any, oi: number) => (
              <label
                key={opt.id}
                className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border cursor-pointer text-sm transition-all ${
                  answers[q.id] === opt.id
                    ? 'bg-primary/10 border-primary shadow-sm'
                    : 'border-border hover:bg-secondary/50 active:bg-secondary'
                }`}
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={answers[q.id] === opt.id}
                  onChange={() => setAnswers({ ...answers, [q.id]: opt.id })}
                  className="accent-primary shrink-0"
                />
                <span className="font-mono text-xs text-muted-foreground shrink-0">{String.fromCharCode(65 + oi)}.</span>
                <span className="break-words leading-relaxed">{opt.text}</span>
              </label>
            ))}
          </div>
        </Card>
      </div>

      {/* ── Sticky Bottom Navigation Bar ── */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur border-t border-border/50 px-3 sm:px-6 py-2.5 sm:py-3 z-10 shrink-0">
        <div className="flex items-center gap-2">
          {/* Grid navigator button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGrid(true)}
            className="shrink-0 h-9 w-9 p-0 sm:h-10 sm:w-auto sm:px-3"
            title="Question navigator"
          >
            <LayoutGrid className="w-4 h-4" />
            <span className="hidden sm:inline text-xs ml-1.5">{answered}/{questions.length}</span>
          </Button>

          {/* Previous */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentQ(c => Math.max(0, c - 1))}
            disabled={currentQ === 0}
            className="shrink-0 h-9 sm:h-10"
          >
            <ChevronLeft className="w-4 h-4 sm:mr-1" />
            <span className="hidden sm:inline text-xs">Prev</span>
          </Button>

          <div className="flex-1" />

          {/* Next or Submit */}
          {isLast ? (
            <Button
              onClick={() => submit(false)}
              disabled={submitting}
              size="sm"
              className="h-9 sm:h-10 px-4 sm:px-6"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Test'}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => setCurrentQ(c => c + 1)}
              className="h-9 sm:h-10 px-4 sm:px-6"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
      </div>

      {/* Question Grid Overlay */}
      {showGrid && <QuestionGrid />}
    </div>
  );
};

export default TestPage;