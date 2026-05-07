import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Clock, Trophy, CheckCircle2, XCircle, Coins } from 'lucide-react';
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

  useSEO({ title: test ? `${test.title} — Test` : 'Test', description: 'Take your test.' });

  const loadTest = useCallback(async (forceFresh = false) => {
    if (!user || !id) return;
    setLoading(true);
    const { data: t } = await supabase.from('tests').select('*').eq('id', id).maybeSingle();
    if (!t) { toast.error('Test not found or not accessible'); nav(-1); return; }
    setTest(t);
    const { data: qs } = await supabase
      .from('questions')
      .select('id, text, image_url, marks, position, question_options(id, text, position, is_correct)')
      .eq('test_id', id)
      .order('position');
    const sorted = (qs || []).map((q: any) => ({ ...q, question_options: (q.question_options || []).sort((a: any, b: any) => a.position - b.position) }));
    setQuestions(sorted);
    setSecondsLeft(t.duration_minutes * 60);
    setAnswers({});

    // If the user already has a finished attempt, show the locked result instead of starting a new one,
    // unless they explicitly clicked "Re-attempt".
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
        let correct = 0; let wrong = 0;
        for (const a of ans || []) {
          if (a.selected_option_id) ansMap[a.question_id] = a.selected_option_id;
          if (a.is_correct) correct++; else if (a.selected_option_id) wrong++;
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

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!test) return null;

  if (result) {
    return (
      <div className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
        <Card className="p-6 bg-card border-border text-center mb-4">
          {result.passed ? <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-2" /> : <XCircle className="w-14 h-14 text-destructive mx-auto mb-2" />}
          <div className={`inline-block text-xs font-bold uppercase px-2 py-0.5 rounded mb-2 ${result.passed ? 'bg-green-500/15 text-green-500' : 'bg-destructive/15 text-destructive'}`}>
            {result.passed ? 'Passed' : 'Failed'} · Attempt locked
          </div>
          <h2 className="text-2xl font-bold mb-1">Score: {result.score} / {result.total}</h2>
          <p className="text-muted-foreground mb-2">{result.pct}% · pass mark {test.pass_score}%</p>
          <div className="text-xs text-muted-foreground mb-4">
            <span className="text-green-500">{result.correct} correct</span> · <span className="text-destructive">{result.wrong} wrong</span> · <span>{questions.length - result.correct - result.wrong} skipped</span>
          </div>
          {!result.locked && (
            <div className={`flex items-center justify-center gap-1 text-sm font-bold mb-4 ${result.coins_delta >= 0 ? 'text-[hsl(var(--coin))]' : 'text-destructive'}`}>
              <Coins className="w-4 h-4" /> {result.coins_delta >= 0 ? '+' : ''}{result.coins_delta} coins
              {result.xp_delta > 0 && <span className="ml-2 flex items-center gap-1 text-[hsl(var(--xp))]"><Trophy className="w-4 h-4" /> +{result.xp_delta} XP</span>}
            </div>
          )}
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => nav(-1)}>Back</Button>
            <Button onClick={async () => {
              const { data, error } = await supabase.functions.invoke('start-test-attempt', { body: { test_id: test.id } });
              if (error || data?.error) { toast.error(data?.error || error?.message || 'Could not start re-attempt'); return; }
              loadTest(true);
            }}>Re-attempt (new attempt)</Button>
          </div>
        </Card>
        <h3 className="text-sm font-bold uppercase text-muted-foreground mb-2">Answer review</h3>
        <div className="space-y-3">
          {questions.map((q, i) => {
            const correctOpt = q.question_options.find((o: any) => o.is_correct);
            const yourOpt = q.question_options.find((o: any) => o.id === answers[q.id]);
            const isCorrect = yourOpt && correctOpt && yourOpt.id === correctOpt.id;
            return (
              <Card key={q.id} className="p-3 bg-card border-border">
                <div className="text-sm font-medium mb-2 flex items-start gap-2">
                  <span className="text-xs font-bold text-primary mt-0.5">Q{i + 1}</span>
                  <span className="flex-1 break-words">{q.text}</span>
                  {isCorrect ? <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-destructive shrink-0" />}
                </div>
                <div className="text-xs space-y-1 ml-6">
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

  const mins = Math.floor(secondsLeft / 60); const secs = secondsLeft % 60;
  const answered = Object.keys(answers).length;

  return (
    <div className="flex-1 px-4 py-6 max-w-3xl mx-auto w-full">
      <header className="flex justify-between items-center mb-4 sticky top-14 bg-background/95 backdrop-blur py-2 z-10">
        <h1 className="font-bold text-lg truncate pr-2">{test.title}</h1>
        <div className={`flex items-center gap-1.5 text-sm font-mono px-3 py-1 rounded shrink-0 ${secondsLeft < 60 ? 'bg-destructive/20 text-destructive' : 'bg-secondary'}`}>
          <Clock className="w-4 h-4" /> {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </div>
      </header>
      <Progress value={questions.length ? (answered / questions.length) * 100 : 0} className="h-1 mb-4" />
      <div className="space-y-4">
        {questions.map((q, i) => (
          <Card key={q.id} className="p-4 bg-card border-border">
            <div className="flex items-start gap-2 mb-3">
              <span className="text-xs font-bold text-primary mt-1">Q{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm break-words">{q.text}</p>
                {q.image_url && <img src={q.image_url} alt="" loading="lazy" className="mt-2 max-h-72 rounded" />}
                <span className="text-[11px] text-muted-foreground">{q.marks} mark{q.marks > 1 && 's'}</span>
              </div>
            </div>
            <div className="space-y-2">
              {q.question_options.map((opt: any, oi: number) => (
                <label key={opt.id} className={`flex items-center gap-2 p-2.5 rounded border cursor-pointer text-sm transition-colors ${answers[q.id] === opt.id ? 'bg-primary/10 border-primary' : 'border-border hover:bg-secondary/50'}`}>
                  <input type="radio" name={q.id} checked={answers[q.id] === opt.id} onChange={() => setAnswers({ ...answers, [q.id]: opt.id })} className="accent-primary" />
                  <span className="font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + oi)}.</span>
                  <span className="break-words">{opt.text}</span>
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>
      <div className="text-xs text-muted-foreground mt-2 text-center">{answered} / {questions.length} answered</div>
      <Button onClick={() => submit(false)} disabled={submitting} className="w-full mt-3" size="lg">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Test'}
      </Button>
    </div>
  );
};

export default TestPage;
