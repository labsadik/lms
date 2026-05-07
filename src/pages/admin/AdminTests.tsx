import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Edit, ListChecks, Search } from 'lucide-react';
import { toast } from 'sonner';

type FormState = {
  course_id: string;
  title: string;
  description: string;
  duration_minutes: number;
  pass_score: number;
  scope: 'course' | 'subject' | 'chapter';
  test_type: 'dpp';
  subject_id: string | null;
  chapter_id: string | null;
  is_published: boolean;
};

const emptyForm: FormState = {
  course_id: '', title: '', description: '', duration_minutes: 30,
  pass_score: 40, scope: 'course', test_type: 'dpp', subject_id: null, chapter_id: null, is_published: true,
};

const emptyQ = { text: '', image_url: '', marks: 1, options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correct: 0 };

const AdminTests = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filterCourse, setFilterCourse] = useState('all');
  const [filterScope, setFilterScope] = useState('all');

  const [dialog, setDialog] = useState<{ open: boolean; editingId: string | null }>({ open: false, editingId: null });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);

  const [qDialog, setQDialog] = useState<{ open: boolean; testId: string | null; testTitle: string }>({ open: false, testId: null, testTitle: '' });
  const [qs, setQs] = useState<any[]>([]);
  const [qForm, setQForm] = useState<any>(emptyQ);
  const [qSaving, setQSaving] = useState(false);

  const load = async () => {
    const [{ data: c }, { data: t }] = await Promise.all([
      supabase.from('courses').select('id, title').order('title'),
      supabase.from('tests').select('*, courses(title)').order('created_at', { ascending: false }),
    ]);
    setCourses(c || []);
    setTests(t || []);
  };
  useEffect(() => { load(); }, []);

  // Load subjects/chapters when course changes in form
  useEffect(() => {
    if (!form.course_id) { setSubjects([]); setChapters([]); return; }
    supabase.from('subjects')
      .select('id, name, position, chapters(id, name, position)')
      .eq('course_id', form.course_id)
      .order('position')
      .then(({ data }) => setSubjects(data || []));
  }, [form.course_id]);

  useEffect(() => {
    if (!form.subject_id) { setChapters([]); return; }
    const sub = subjects.find((s: any) => s.id === form.subject_id);
    setChapters(((sub?.chapters || []) as any[]).slice().sort((a, b) => a.position - b.position));
  }, [form.subject_id, subjects]);

  const openNew = () => {
    setForm(emptyForm);
    setDialog({ open: true, editingId: null });
  };

  const openEdit = (t: any) => {
    setForm({
      course_id: t.course_id || '',
      title: t.title || '',
      description: t.description || '',
      duration_minutes: t.duration_minutes ?? 30,
      pass_score: t.pass_score ?? 40,
      scope: (t.scope as FormState['scope']) || 'course',
      test_type: 'dpp',
      subject_id: t.subject_id,
      chapter_id: t.chapter_id,
      is_published: t.is_published ?? true,
    });
    setDialog({ open: true, editingId: t.id });
  };

  const save = async () => {
    if (!form.course_id) { toast.error('Pick a course'); return; }
    if (!form.title.trim()) { toast.error('Title required'); return; }
    if (form.scope === 'subject' && !form.subject_id) { toast.error('Pick a subject'); return; }
    if (form.scope === 'chapter' && (!form.subject_id || !form.chapter_id)) { toast.error('Pick subject and chapter'); return; }
    const dur = Number(form.duration_minutes);
    const pass = Number(form.pass_score);
    if (!dur || dur < 1) { toast.error('Duration must be at least 1 min'); return; }
    if (isNaN(pass) || pass < 0 || pass > 100) { toast.error('Pass score must be 0-100'); return; }

    const payload = {
      course_id: form.course_id,
      title: form.title.trim(),
      description: form.description?.trim() || null,
      duration_minutes: dur,
      pass_score: pass,
      scope: form.scope,
      test_type: form.test_type,
      subject_id: form.scope === 'subject' || form.scope === 'chapter' ? form.subject_id : null,
      chapter_id: form.scope === 'chapter' ? form.chapter_id : null,
      is_published: form.is_published,
    };

    const res = dialog.editingId
      ? await supabase.from('tests').update(payload).eq('id', dialog.editingId)
      : await supabase.from('tests').insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success('Saved');
    setDialog({ open: false, editingId: null });
    setForm(emptyForm);
    load();
  };

  const del = async (id: string) => {
    if (!confirm('Delete test and all its questions?')) return;
    const { error } = await supabase.from('tests').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    load();
  };

  const openQs = async (t: any) => {
    setQDialog({ open: true, testId: t.id, testTitle: t.title });
    setQForm(emptyQ);
    const { data } = await supabase.from('questions').select('*, question_options(*)').eq('test_id', t.id).order('position');
    setQs(data || []);
  };

  const reloadQs = async (testId: string) => {
    const { data } = await supabase.from('questions').select('*, question_options(*)').eq('test_id', testId).order('position');
    setQs(data || []);
  };

  const addQuestion = async () => {
    if (!qDialog.testId) return;
    if (!qForm.text.trim()) { toast.error('Question text required'); return; }
    const filledOpts = qForm.options.filter((o: any) => o.text.trim());
    if (filledOpts.length < 2) { toast.error('At least 2 options required'); return; }
    if (qForm.correct >= qForm.options.length || !qForm.options[qForm.correct]?.text?.trim()) {
      toast.error('Mark a correct option that has text'); return;
    }
    setQSaving(true);
    try {
      const { data: q, error } = await supabase.from('questions').insert({
        test_id: qDialog.testId,
        text: qForm.text.trim(),
        image_url: qForm.image_url?.trim() || null,
        marks: Number(qForm.marks) || 1,
        position: qs.length,
      }).select().single();
      if (error || !q) { toast.error(error?.message || 'Insert failed'); return; }
      const optRows = qForm.options
        .map((o: any, i: number) => ({ text: o.text.trim(), idx: i }))
        .filter((o: any) => o.text)
        .map((o: any) => ({
          question_id: q.id,
          text: o.text,
          is_correct: o.idx === qForm.correct,
          position: o.idx,
        }));
      const { error: oErr } = await supabase.from('question_options').insert(optRows);
      if (oErr) { toast.error(oErr.message); return; }
      toast.success('Question added');
      setQForm(emptyQ);
      reloadQs(qDialog.testId);
    } finally {
      setQSaving(false);
    }
  };

  const delQ = async (id: string) => {
    if (!confirm('Delete question?')) return;
    const { error } = await supabase.from('questions').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    if (qDialog.testId) reloadQs(qDialog.testId);
  };

  const filtered = useMemo(() => {
    return tests.filter(t => {
      if (filterCourse !== 'all' && t.course_id !== filterCourse) return false;
      if (filterScope !== 'all' && t.scope !== filterScope) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const hay = `${t.title} ${t.description || ''} ${t.courses?.title || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tests, filterCourse, filterScope, search]);

  return (
    <div>
      <header className="flex justify-between items-start mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Tests</h1>
          <p className="text-xs text-muted-foreground">Quizzes scoped to course, subject or chapter</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New Test</Button>
      </header>

      <Card className="p-3 mb-4 bg-card border-border grid gap-2 md:grid-cols-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title…" className="pl-8" />
        </div>
        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">All courses</SelectItem>
            {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterScope} onValueChange={setFilterScope}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="course">Course (final)</SelectItem>
            <SelectItem value="subject">Subject</SelectItem>
            <SelectItem value="chapter">Chapter</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="space-y-2">
        {filtered.map(t => (
          <Card key={t.id} className="p-3 bg-card border-border flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-[200px]">
              <div className="font-semibold text-sm">{t.title}</div>
              <div className="text-[11px] text-muted-foreground">
                <span className="uppercase font-bold text-primary">DPP</span> • {t.courses?.title} • {t.duration_minutes}min • Pass {t.pass_score}% • scope: {t.scope}
                {!t.is_published && ' • DRAFT'}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => openQs(t)}><ListChecks className="w-3 h-3 mr-1" /> Questions</Button>
            <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Edit className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => del(t.id)}><Trash2 className="w-3 h-3" /></Button>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No tests match.</p>}
      </div>

      <Dialog open={dialog.open} onOpenChange={(v) => { if (!v) setDialog({ open: false, editingId: null }); }}>
        <DialogContent className="bg-card max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog.editingId ? 'Edit test' : 'New test'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Course *</Label>
              <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v, subject_id: null, chapter_id: null })}>
                <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent className="bg-card">{courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} /></div>
            <div><Label>Scope *</Label>
              <Select value={form.scope} onValueChange={(v: any) => setForm({ ...form, scope: v, subject_id: null, chapter_id: null })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card">
                  <SelectItem value="course">Whole course (final DPP)</SelectItem>
                  <SelectItem value="subject">Subject DPP</SelectItem>
                  <SelectItem value="chapter">Chapter DPP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.scope === 'subject' || form.scope === 'chapter') && (
              <div><Label>Subject *</Label>
                <Select value={form.subject_id || undefined} onValueChange={(v) => setForm({ ...form, subject_id: v, chapter_id: null })}>
                  <SelectTrigger><SelectValue placeholder={subjects.length ? 'Select subject' : 'No subjects in this course'} /></SelectTrigger>
                  <SelectContent className="bg-card">{subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.scope === 'chapter' && (
              <div><Label>Chapter *</Label>
                <Select value={form.chapter_id || undefined} onValueChange={(v) => setForm({ ...form, chapter_id: v })}>
                  <SelectTrigger><SelectValue placeholder={chapters.length ? 'Select chapter' : 'No chapters in this subject'} /></SelectTrigger>
                  <SelectContent className="bg-card">{chapters.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Duration (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} min={1} max={300} /></div>
              <div><Label>Pass score (%)</Label><Input type="number" value={form.pass_score} onChange={(e) => setForm({ ...form, pass_score: Number(e.target.value) })} min={0} max={100} /></div>
            </div>
            <div className="flex items-center gap-2">
              <input id="published" type="checkbox" checked={form.is_published} onChange={(e) => setForm({ ...form, is_published: e.target.checked })} />
              <Label htmlFor="published" className="cursor-pointer">Published (visible to enrolled students)</Label>
            </div>
            <Button onClick={save} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={qDialog.open} onOpenChange={(v) => { if (!v) setQDialog({ open: false, testId: null, testTitle: '' }); }}>
        <DialogContent className="bg-card max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Questions — {qDialog.testTitle}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {qs.map((q, i) => (
              <Card key={q.id} className="p-3 bg-background/40">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">Q{i + 1}. {q.text} <span className="text-[10px] text-muted-foreground">({q.marks} mark{q.marks > 1 ? 's' : ''})</span></div>
                    {q.image_url && <img src={q.image_url} alt="" className="max-h-40 mt-2 rounded" />}
                    <ul className="text-xs mt-2 space-y-0.5">
                      {(q.question_options || []).slice().sort((a: any, b: any) => a.position - b.position).map((o: any, oi: number) => (
                        <li key={o.id} className={o.is_correct ? 'text-green-500 font-semibold' : 'text-muted-foreground'}>
                          {String.fromCharCode(65 + oi)}. {o.text} {o.is_correct && '✓'}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => delQ(q.id)}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </Card>
            ))}

            <Card className="p-3 bg-background/40 border-dashed space-y-2">
              <Label className="text-xs font-semibold">Add question</Label>
              <Textarea placeholder="Question text *" value={qForm.text} onChange={(e) => setQForm({ ...qForm, text: e.target.value })} maxLength={1000} />
              <Input placeholder="Image URL (optional)" value={qForm.image_url} onChange={(e) => setQForm({ ...qForm, image_url: e.target.value })} maxLength={500} />
              {qForm.image_url && <img src={qForm.image_url} alt="preview" className="max-h-32 rounded" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
              <div className="flex items-center gap-2">
                <Label className="text-xs">Marks</Label>
                <Input type="number" value={qForm.marks} onChange={(e) => setQForm({ ...qForm, marks: e.target.value })} className="w-24" min={1} max={20} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Options (select the correct one)</Label>
                {qForm.options.map((o: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="correct"
                      checked={qForm.correct === i}
                      onChange={() => setQForm({ ...qForm, correct: i })}
                      className="accent-primary w-4 h-4 shrink-0"
                    />
                    <Input
                      placeholder={`Option ${String.fromCharCode(65 + i)}`}
                      value={o.text}
                      onChange={(e) => {
                        const opts = qForm.options.map((x: any, idx: number) => idx === i ? { text: e.target.value } : x);
                        setQForm({ ...qForm, options: opts });
                      }}
                      maxLength={300}
                    />
                  </div>
                ))}
              </div>
              <Button onClick={addQuestion} disabled={qSaving} size="sm" className="w-full">
                <Plus className="w-3 h-3 mr-1" /> {qSaving ? 'Saving…' : 'Add question'}
              </Button>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTests;
