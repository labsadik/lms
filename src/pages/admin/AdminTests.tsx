import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Plus, Trash2, Edit, ListChecks, Search, Loader2, AlertTriangle, CheckCircle2, Clock, Target, Users } from 'lucide-react';
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
  const [initialLoading, setInitialLoading] = useState(true);

  // User Data Caching
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [emails, setEmails] = useState<Record<string, string>>({});

  // Dialogs State
  const [dialog, setDialog] = useState<{ open: boolean; editingId: string | null }>({ open: false, editingId: null });
  const [form, setForm] = useState<FormState>(emptyForm);
  const [subjects, setSubjects] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  const [qDialog, setQDialog] = useState<{ open: boolean; testId: string | null; testTitle: string; testCourse: string }>({ open: false, testId: null, testTitle: '', testCourse: '' });
  const [qs, setQs] = useState<any[]>([]);
  const [qForm, setQForm] = useState<any>(emptyQ);
  const [qSaving, setQSaving] = useState(false);

  const [attempts, setAttempts] = useState<any[]>([]);
  const [loadingAttempts, setLoadingAttempts] = useState(false);

  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null; title: string }>({ open: false, id: null, title: '' });
  const [deleteQDialog, setDeleteQDialog] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });
  const [isDeleting, setIsDeleting] = useState(false);

  const load = async () => {
    setInitialLoading(true);
    try {
      const [cRes, tRes, profRes, fnRes] = await Promise.all([
        supabase.from('courses').select('id, title').order('title'),
        supabase.from('tests').select('*, courses(title)').order('created_at', { ascending: false }),
        supabase.from('profiles').select('user_id, display_name, phone, avatar_url'),
        supabase.functions.invoke('admin-users'),
      ]);

      setCourses(cRes.data || []);
      setTests(tRes.data || []);

      const pMap: Record<string, any> = {};
      (profRes.data || []).forEach((p: any) => { pMap[p.user_id] = p; });
      setProfiles(pMap);

      const eMap: Record<string, string> = {};
      (((fnRes.data as any)?.users) || []).forEach((u: any) => { eMap[u.id] = u.email; });
      setEmails(eMap);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setInitialLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!form.course_id) { setSubjects([]); setChapters([]); return; }
    supabase.from('subjects')
      .select('id, name, position, chapters(id, name, position)')
      .eq('course_id', form.course_id).order('position')
      .then(({ data }) => setSubjects(data || []));
  }, [form.course_id]);

  useEffect(() => {
    if (!form.subject_id) { setChapters([]); return; }
    const sub = subjects.find((s: any) => s.id === form.subject_id);
    setChapters(((sub?.chapters || []) as any[]).slice().sort((a: any, b: any) => a.position - b.position));
  }, [form.subject_id, subjects]);

  const openNew = () => { setForm(emptyForm); setDialog({ open: true, editingId: null }); };

  const openEdit = (t: any) => {
    setForm({
      course_id: t.course_id || '', title: t.title || '', description: t.description || '',
      duration_minutes: t.duration_minutes ?? 30, pass_score: t.pass_score ?? 40,
      scope: (t.scope as FormState['scope']) || 'course', test_type: 'dpp',
      subject_id: t.subject_id, chapter_id: t.chapter_id, is_published: t.is_published ?? true,
    });
    setDialog({ open: true, editingId: t.id });
  };

  const save = async () => {
    if (!form.course_id || !form.title.trim()) {
      toast.error('Course and Title are required', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
      return;
    }
    
    setSaving(true);
    const payload = {
      course_id: form.course_id, title: form.title.trim(), description: form.description?.trim() || null,
      duration_minutes: Number(form.duration_minutes), pass_score: Number(form.pass_score),
      scope: form.scope, test_type: form.test_type,
      subject_id: form.scope !== 'course' ? form.subject_id : null,
      chapter_id: form.scope === 'chapter' ? form.chapter_id : null, is_published: form.is_published,
    };

    const res = dialog.editingId
      ? await supabase.from('tests').update(payload).eq('id', dialog.editingId)
      : await supabase.from('tests').insert(payload);
      
    if (res.error) { toast.error(res.error.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); setSaving(false); return; }
    toast.success('Test saved', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> });
    setDialog({ open: false, editingId: null }); setForm(emptyForm); load(); setSaving(false);
  };

  const confirmDeleteTest = async () => {
    if (!deleteDialog.id) return;
    setIsDeleting(true);
    const { error } = await supabase.from('tests').delete().eq('id', deleteDialog.id);
    if (error) toast.error(error.message); 
    else { toast.success('Test deleted', { icon: <CheckCircle2 className="h-4 w-4 text-green-500" /> }); load(); }
    setDeleteDialog({ open: false, id: null, title: '' }); setIsDeleting(false);
  };

  const openQs = async (t: any) => {
    setQDialog({ open: true, testId: t.id, testTitle: t.title, testCourse: t.courses?.title || 'Unknown Course' });
    setQForm(emptyQ);
    setLoadingAttempts(true);
    try {
      const [qRes, aRes] = await Promise.all([
        supabase.from('questions').select('*, question_options(*)').eq('test_id', t.id).order('position'),
        supabase.from('test_attempts').select('*').eq('test_id', t.id).order('finished_at', { ascending: false })
      ]);
      setQs(qRes.data || []);
      setAttempts(aRes.data || []);
    } catch { toast.error('Failed to load test data'); }
    finally { setLoadingAttempts(false); }
  };

  const addQuestion = async () => {
    if (!qDialog.testId || !qForm.text.trim()) { toast.error('Question text required'); return; }
    if (qForm.options.filter((o: any) => o.text.trim()).length < 2) { toast.error('At least 2 options required'); return; }
    
    setQSaving(true);
    try {
      const { data: q, error } = await supabase.from('questions').insert({
        test_id: qDialog.testId, text: qForm.text.trim(), image_url: qForm.image_url?.trim() || null,
        marks: Number(qForm.marks) || 1, position: qs.length,
      }).select().single();
      if (error || !q) throw error;

      const optRows = qForm.options.map((o: any, i: number) => ({ text: o.text.trim(), idx: i }))
        .filter((o: any) => o.text)
        .map((o: any) => ({ question_id: q.id, text: o.text, is_correct: o.idx === qForm.correct, position: o.idx }));
        
      const { error: oErr } = await supabase.from('question_options').insert(optRows);
      if (oErr) throw oErr;
      
      toast.success('Question added');
      setQForm(emptyQ);
      const { data: newQs } = await supabase.from('questions').select('*, question_options(*)').eq('test_id', qDialog.testId).order('position');
      setQs(newQs || []);
    } catch (err: any) { toast.error(err?.message || 'Failed'); }
    finally { setQSaving(false); }
  };

  const confirmDeleteQ = async () => {
    if (!deleteQDialog.id || !qDialog.testId) return;
    setIsDeleting(true);
    const { error } = await supabase.from('questions').delete().eq('id', deleteQDialog.id);
    if (error) toast.error(error.message);
    else { 
      toast.success('Question removed'); 
      setQs(prev => prev.filter(q => q.id !== deleteQDialog.id)); 
    }
    setDeleteQDialog({ open: false, id: null }); setIsDeleting(false);
  };

  const filtered = useMemo(() => {
    return tests.filter(t => {
      if (filterCourse !== 'all' && t.course_id !== filterCourse) return false;
      if (filterScope !== 'all' && t.scope !== filterScope) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!`${t.title} ${t.description || ''} ${t.courses?.title || ''}`.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tests, filterCourse, filterScope, search]);

  const attemptStats = useMemo(() => {
    const total = attempts.length;
    const finished = attempts.filter(a => a.finished_at).length;
    const passed = attempts.filter(a => a.passed).length;
    const failed = finished - passed;
    const avgScore = finished > 0 ? Math.round(attempts.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / finished) : 0;
    return { total, finished, passed, failed, avgScore, inProgress: total - finished };
  }, [attempts]);

  if (initialLoading) return <div className="flex items-center justify-center py-20 h-full"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /><span className="ml-2 text-sm text-muted-foreground">Loading tests…</span></div>;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="shrink-0 mb-4">
        <div className="flex justify-between items-start gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Tests & DPP</h1>
            <p className="text-xs text-muted-foreground mt-1">Quizzes scoped to course, subject, or chapter</p>
          </div>
          <Button onClick={openNew} className="shadow-sm"><Plus className="w-4 h-4 mr-1" /> Create Test</Button>
        </div>
      </div>

      <Card className="shrink-0 p-3 mb-4 bg-card border-border shadow-sm">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title or course…" className="pl-9 h-9 bg-background text-xs" />
          </div>
          <Select value={filterCourse} onValueChange={setFilterCourse}>
            <SelectTrigger className="h-9 bg-background text-xs"><SelectValue placeholder="All Courses" /></SelectTrigger>
            <SelectContent className="bg-card">
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterScope} onValueChange={setFilterScope}>
            <SelectTrigger className="h-9 bg-background text-xs"><SelectValue placeholder="All Scopes" /></SelectTrigger>
            <SelectContent className="bg-card">
              <SelectItem value="all">All Scopes</SelectItem>
              <SelectItem value="course">Course</SelectItem>
              <SelectItem value="subject">Subject</SelectItem>
              <SelectItem value="chapter">Chapter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1 pb-10">
        {filtered.length === 0 && <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground text-sm">No tests found.</div>}
        {filtered.map(t => (
          <Card key={t.id} className="p-4 bg-card border-border shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{t.title}</h3>
                  <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">DPP</span>
                  <span className="text-[10px] font-bold bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded uppercase">{t.scope}</span>
                  {!t.is_published && <span className="text-[10px] font-bold bg-orange-500/10 text-orange-500 px-1.5 py-0.5 rounded">DRAFT</span>}
                </div>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/80 truncate max-w-[200px]">{t.courses?.title}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {t.duration_minutes}m</span>
                  <span className="flex items-center gap-1"><Target className="w-3 h-3" /> Pass {t.pass_score}%</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => openQs(t)}><ListChecks className="w-3 h-3 mr-1" /> Manage</Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(t)}><Edit className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive" onClick={() => setDeleteDialog({ open: true, id: t.id, title: t.title })}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* --- CREATE/EDIT TEST DIALOG --- */}
      <Dialog open={dialog.open} onOpenChange={(v) => { if (!v) setDialog({ open: false, editingId: null }); }}>
        <DialogContent className="bg-card max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{dialog.editingId ? 'Edit Test' : 'Create New Test'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Course <span className="text-destructive">*</span></Label>
              <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v, subject_id: null, chapter_id: null })}>
                <SelectTrigger className="mt-1.5 bg-background"><SelectValue placeholder="Select course" /></SelectTrigger>
                <SelectContent className="bg-card">{courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} className="mt-1.5 bg-background" placeholder="e.g., Thermodynamics DPP 01" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={500} rows={2} className="mt-1.5 bg-background resize-none" />
            </div>
            <div>
              <Label>Scope <span className="text-destructive">*</span></Label>
              <Select value={form.scope} onValueChange={(v: any) => setForm({ ...form, scope: v, subject_id: null, chapter_id: null })}>
                <SelectTrigger className="mt-1.5 bg-background"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card">
                  <SelectItem value="course">Whole Course</SelectItem>
                  <SelectItem value="subject">Specific Subject</SelectItem>
                  <SelectItem value="chapter">Specific Chapter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(form.scope === 'subject' || form.scope === 'chapter') && (
              <div>
                <Label>Subject <span className="text-destructive">*</span></Label>
                <Select value={form.subject_id || undefined} onValueChange={(v) => setForm({ ...form, subject_id: v, chapter_id: null })}>
                  <SelectTrigger className="mt-1.5 bg-background"><SelectValue placeholder={subjects.length ? "Select subject" : "No subjects"} /></SelectTrigger>
                  <SelectContent className="bg-card">{subjects.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {form.scope === 'chapter' && (
              <div>
                <Label>Chapter <span className="text-destructive">*</span></Label>
                <Select value={form.chapter_id || undefined} onValueChange={(v) => setForm({ ...form, chapter_id: v })}>
                  <SelectTrigger className="mt-1.5 bg-background"><SelectValue placeholder={chapters.length ? "Select chapter" : "No chapters"} /></SelectTrigger>
                  <SelectContent className="bg-card">{chapters.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Duration (min)</Label><Input type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })} min={1} max={300} className="mt-1.5 bg-background" /></div>
              <div><Label>Pass Score (%)</Label><Input type="number" value={form.pass_score} onChange={(e) => setForm({ ...form, pass_score: Number(e.target.value) })} min={0} max={100} className="mt-1.5 bg-background" /></div>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
              <div><Label className="text-sm font-medium">Published</Label><p className="text-[11px] text-muted-foreground">Visible to students</p></div>
              <Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog({ open: false, editingId: null })}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} {dialog.editingId ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- QUESTIONS & COMPLETIONS DIALOG --- */}
      <Dialog open={qDialog.open} onOpenChange={(v) => { if (!v) setQDialog({ open: false, testId: null, testTitle: '', testCourse: '' }); }}>
        <DialogContent className="bg-card max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Test Management</DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-sm font-medium text-foreground">
              <span className="text-primary">{qDialog.testTitle}</span>
              <span className="text-muted-foreground">•</span>
              <span className="text-muted-foreground">{qDialog.testCourse}</span>
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="questions" className="mt-2">
            <TabsList className="bg-muted/50 w-full">
              <TabsTrigger value="questions" className="flex-1 text-xs">Questions ({qs.length})</TabsTrigger>
              <TabsTrigger value="completions" className="flex-1 text-xs flex items-center justify-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> User Completions ({attemptStats.total})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="questions" className="space-y-4 mt-4">
              {qs.map((q, i) => (
                <Card key={q.id} className="p-4 bg-muted/30 border-border">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">Q{i + 1}. {q.text} <span className="text-[10px] text-muted-foreground ml-1">({q.marks}m)</span></p>
                      {q.image_url && <img src={q.image_url} alt="" className="max-h-40 mt-2 rounded-md border" />}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                        {(q.question_options || []).slice().sort((a: any, b: any) => a.position - b.position).map((o: any, oi: number) => (
                          <div key={o.id} className={`text-xs p-1.5 rounded border ${o.is_correct ? 'bg-green-500/10 border-green-500/50 text-green-600 font-semibold' : 'text-muted-foreground'}`}>
                            {String.fromCharCode(65 + oi)}. {o.text} {o.is_correct && '✓'}
                          </div>
                        ))}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive shrink-0" onClick={() => setDeleteQDialog({ open: true, id: q.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </Card>
              ))}

              <Card className="p-4 bg-background border-dashed space-y-3">
                <h4 className="text-sm font-bold">Add New Question</h4>
                <Textarea placeholder="Question text *" value={qForm.text} onChange={(e) => setQForm({ ...qForm, text: e.target.value })} maxLength={1000} rows={2} className="resize-none" />
                <div className="flex gap-2">
                  <Input placeholder="Image URL (optional)" value={qForm.image_url} onChange={(e) => setQForm({ ...qForm, image_url: e.target.value })} maxLength={500} className="flex-1 h-9 text-xs" />
                  <Input type="number" placeholder="Marks" value={qForm.marks} onChange={(e) => setQForm({ ...qForm, marks: e.target.value })} className="w-20 h-9 text-xs" min={1} max={20} />
                </div>
                {qForm.image_url && <img src={qForm.image_url} alt="preview" className="max-h-24 rounded" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Options (Select Correct Answer)</Label>
                  {qForm.options.map((o: any, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="radio" name="correct" checked={qForm.correct === i} onChange={() => setQForm({ ...qForm, correct: i })} className="accent-primary w-4 h-4 shrink-0 cursor-pointer" />
                      <span className="text-xs font-bold text-muted-foreground w-4">{String.fromCharCode(65 + i)}.</span>
                      <Input placeholder={`Option ${i + 1}`} value={o.text} onChange={(e) => { const opts = qForm.options.map((x: any, idx: number) => idx === i ? { text: e.target.value } : x); setQForm({ ...qForm, options: opts }); }} maxLength={300} className="h-8 text-xs" />
                    </div>
                  ))}
                </div>
                <Button onClick={addQuestion} disabled={qSaving} size="sm" className="w-full">
                  {qSaving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />} Add Question
                </Button>
              </Card>
            </TabsContent>

            <TabsContent value="completions" className="mt-4 space-y-4">
              {loadingAttempts ? (
                <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <Card className="p-3 bg-muted/50 border-border text-center">
                      <div className="text-lg font-bold">{attemptStats.total}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Attempts</div>
                    </Card>
                    <Card className="p-3 bg-green-500/5 border-green-500/20 text-center">
                      <div className="text-lg font-bold text-green-500">{attemptStats.passed}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Passed</div>
                    </Card>
                    <Card className="p-3 bg-red-500/5 border-red-500/20 text-center">
                      <div className="text-lg font-bold text-red-500">{attemptStats.failed}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Failed</div>
                    </Card>
                    <Card className="p-3 bg-blue-500/5 border-blue-500/20 text-center">
                      <div className="text-lg font-bold text-blue-500">{attemptStats.inProgress}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">In Progress</div>
                    </Card>
                    <Card className="p-3 bg-orange-500/5 border-orange-500/20 text-center col-span-2 sm:col-span-1">
                      <div className="text-lg font-bold text-orange-500">{attemptStats.avgScore}%</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Score</div>
                    </Card>
                  </div>

                  {attempts.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">No student attempts yet.</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden bg-card">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-muted-foreground border-b">
                          <tr>
                            <th className="text-left p-2.5 font-semibold">Student</th>
                            <th className="text-left p-2.5 font-semibold hidden sm:table-cell">Contact</th>
                            <th className="text-center p-2.5 font-semibold">Score</th>
                            <th className="text-center p-2.5 font-semibold">Status</th>
                            <th className="text-right p-2.5 font-semibold hidden sm:table-cell">Time</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {attempts.map(a => {
                            const user = profiles[a.user_id] || {};
                            const email = emails[a.user_id] || '—';
                            const pct = a.total ? Math.round((a.score / a.total) * 100) : 0;
                            return (
                              <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                                <td className="p-2.5">
                                  <div className="flex items-center gap-2.5">
                                    <Avatar className="w-7 h-7">
                                      <AvatarImage src={user.avatar_url} />
                                      <AvatarFallback className="text-[10px] bg-muted">{(user.display_name || '?')[0]}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                      <div className="font-medium truncate max-w-[120px]">{user.display_name || 'Unknown'}</div>
                                      <div className="text-[10px] text-muted-foreground sm:hidden truncate max-w-[120px]">{email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-2.5 hidden sm:table-cell">
                                  <div className="text-muted-foreground truncate max-w-[150px]">{email}</div>
                                  <div className="text-muted-foreground truncate max-w-[120px]">{user.phone || '—'}</div>
                                </td>
                                <td className="p-2.5 text-center">
                                  {a.finished_at ? (
                                    <div className="flex flex-col items-center justify-center leading-tight">
                                      <span className="font-bold text-sm text-foreground">{a.score}/{a.total}</span>
                                      <span className="text-[10px] text-muted-foreground mt-0.5">{pct}%</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-center">
                                  {!a.finished_at ? (
                                    <span className="text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded text-[10px] font-bold">IN PROGRESS</span>
                                  ) : a.passed ? (
                                    <span className="text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded text-[10px] font-bold">PASSED</span>
                                  ) : (
                                    <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded text-[10px] font-bold">FAILED</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                                  {a.finished_at ? new Date(a.finished_at).toLocaleString() : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* --- DELETE TEST DIALOG --- */}
      <Dialog open={deleteDialog.open} onOpenChange={(v) => setDeleteDialog({ ...deleteDialog, open: v })}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Delete Test</DialogTitle>
            <DialogDescription>Are you sure you want to delete <span className="font-bold text-foreground">"{deleteDialog.title}"</span>? This will permanently delete all its questions and student attempts.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null, title: '' })}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteTest} disabled={isDeleting}>{isDeleting ? 'Deleting…' : 'Yes, Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- DELETE QUESTION DIALOG --- */}
      <Dialog open={deleteQDialog.open} onOpenChange={(v) => setDeleteQDialog({ ...deleteQDialog, open: v })}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-5 h-5" /> Delete Question</DialogTitle>
            <DialogDescription>Are you sure you want to delete this question? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteQDialog({ open: false, id: null })}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteQ} disabled={isDeleting}>{isDeleting ? 'Deleting…' : 'Yes, Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default AdminTests;