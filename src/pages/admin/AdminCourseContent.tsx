import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, ChevronLeft, Edit, ChevronDown, ChevronRight, BookOpen, FolderOpen, Video } from 'lucide-react';
import { toast } from 'sonner';

const AdminCourseContent = () => {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<any>(null);
  const [tree, setTree] = useState<any[]>([]);
  
  // UI State for Accordions
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());

  // Dialog States
  const [subjectDialog, setSubjectDialog] = useState(false);
  const [chapterDialog, setChapterDialog] = useState<{ open: boolean; subjectId: string | null }>({ open: false, subjectId: null });
  const [partDialog, setPartDialog] = useState<{ open: boolean; chapterId: string | null; editing: any }>({ open: false, chapterId: null, editing: null });

  // Form States
  const [subjectName, setSubjectName] = useState('');
  const [chapterName, setChapterName] = useState('');
  const [partForm, setPartForm] = useState({ name: '', kind: 'recorded' as 'recorded' | 'live', video_id: '', live_url: '', notes_url: '', duration: '', is_preview: false });

  const load = async () => {
    const { data: c } = await supabase.from('courses').select('*').eq('id', id).maybeSingle();
    setCourse(c);
    const { data: subjects } = await supabase
      .from('subjects')
      .select('id, name, position, chapters(id, name, position, parts(id, name, video_id, notes_url, duration, position, is_preview, kind))')
      .eq('course_id', id)
      .order('position');
    const sorted = (subjects || []).map((s: any) => ({
      ...s,
      chapters: (s.chapters || []).sort((a: any, b: any) => a.position - b.position).map((ch: any) => ({
        ...ch,
        parts: (ch.parts || []).sort((a: any, b: any) => a.position - b.position),
      })),
    }));
    setTree(sorted);
  };

  useEffect(() => { load(); }, [id]);

  // Toggle Accordion Functions
  const toggleSubject = (id: string) => {
    setOpenSubjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleChapter = (id: string) => {
    setOpenChapters(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Create Functions
  const addSubject = async () => {
    if (!subjectName.trim()) { toast.error('Subject name is required'); return; }
    const { error } = await supabase.from('subjects').insert({ course_id: id, name: subjectName.trim(), position: tree.length });
    if (error) toast.error(error.message); 
    else {
      toast.success('Subject added');
      setSubjectDialog(false);
      setSubjectName('');
      load();
    }
  };

  const addChapter = async () => {
    if (!chapterName.trim()) { toast.error('Chapter name is required'); return; }
    const subject = tree.find(s => s.id === chapterDialog.subjectId);
    const { error } = await supabase.from('chapters').insert({ subject_id: chapterDialog.subjectId, name: chapterName.trim(), position: subject?.chapters?.length || 0 });
    if (error) toast.error(error.message); 
    else {
      toast.success('Chapter added');
      setChapterDialog({ open: false, subjectId: null });
      setChapterName('');
      load();
    }
  };

  // Part Functions
  const openPart = (chapterId: string, count: number, editing: any = null) => {
    if (editing) setPartForm({ name: editing.name, kind: editing.kind || 'recorded', video_id: editing.video_id || '', live_url: editing.live_url || '', notes_url: editing.notes_url || '', duration: editing.duration || '', is_preview: editing.is_preview });
    else setPartForm({ name: '', kind: 'recorded', video_id: '', live_url: '', notes_url: '', duration: '', is_preview: false });
    setPartDialog({ open: true, chapterId, editing: editing ? { ...editing, _count: count } : { _count: count } });
  };

  const savePart = async () => {
    if (!partForm.name) { toast.error('Name required'); return; }
    if (partForm.kind === 'recorded' && !partForm.video_id) { toast.error('Video ID required'); return; }
    if (partForm.kind === 'live' && !partForm.live_url) { toast.error('Live URL required'); return; }
    const payload: any = { ...partForm, video_id: partForm.video_id || '' };
    
    const req = partDialog.editing?.id
      ? supabase.from('parts').update(payload).eq('id', partDialog.editing.id)
      : supabase.from('parts').insert({ ...payload, chapter_id: partDialog.chapterId, position: partDialog.editing._count });
      
    const { error } = await req;
    if (error) toast.error(error.message); 
    else {
      toast.success('Lecture saved');
      setPartDialog({ open: false, chapterId: null, editing: null });
      load();
    }
  };

  const del = async (table: 'subjects' | 'chapters' | 'parts', rid: string) => {
    if (!confirm('Are you sure you want to delete this? It cannot be undone.')) return;
    const { error } = await supabase.from(table).delete().eq('id', rid);
    if (error) toast.error(error.message); else {
      toast.success('Deleted');
      load();
    }
  };

  if (!course) return <div className="flex-1 flex items-center justify-center p-6"><div className="animate-pulse text-muted-foreground">Loading…</div></div>;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Fixed Header - Prevents full page scroll, stays at top */}
      <header className="shrink-0 px-4 sm:px-6 py-4 border-b border-border bg-background z-10">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button asChild variant="ghost" size="icon" className="shrink-0"><Link to="/admin/courses"><ChevronLeft className="w-4 h-4" /></Link></Button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold truncate">{course.title}</h1>
              <p className="text-xs text-muted-foreground">Manage curriculum structure</p>
            </div>
          </div>
          <Button onClick={() => setSubjectDialog(true)} size="sm"><Plus className="w-4 h-4 mr-1" /> Subject</Button>
        </div>
      </header>

      {/* Scrollable Content Area - Only this part scrolls */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/30">
        <div className="space-y-3 max-w-4xl mx-auto">
          {tree.length === 0 && (
            <Card className="p-8 text-center border-dashed bg-card">
              <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm font-medium">No subjects yet</p>
              <p className="text-xs text-muted-foreground mb-4">Start building your course curriculum by adding a subject.</p>
              <Button variant="outline" onClick={() => setSubjectDialog(true)} size="sm"><Plus className="w-4 h-4 mr-1" /> Add First Subject</Button>
            </Card>
          )}

          {tree.map((s: any) => (
            <Card key={s.id} className="bg-card border-border overflow-hidden">
              {/* Subject Header (Clickable Accordion) */}
              <button 
                onClick={() => toggleSubject(s.id)} 
                className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-secondary/30 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {openSubjects.has(s.id) ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />}
                  <BookOpen className="w-4 h-4 text-primary shrink-0" />
                  <h2 className="font-bold text-sm sm:text-base truncate">{s.name}</h2>
                  <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded shrink-0">{s.chapters.length} ch</span>
                </div>
                <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setChapterDialog({ open: true, subjectId: s.id }); setChapterName(''); }}><Plus className="w-3 h-3" /> Chapter</Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => del('subjects', s.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </button>

              {/* Subject Body (Collapsible) */}
              {openSubjects.has(s.id) && (
                <div className="border-t border-border bg-background/50 px-2 sm:px-4 pb-3 pt-2 space-y-2">
                  {s.chapters.length === 0 && <p className="text-xs text-muted-foreground text-center py-3 italic">Empty subject. Add a chapter below.</p>}
                  
                  {s.chapters.map((ch: any) => (
                    <div key={ch.id} className="border border-border rounded-md bg-card overflow-hidden">
                      {/* Chapter Header (Clickable Accordion) */}
                      <button 
                        onClick={() => toggleChapter(ch.id)} 
                        className="w-full flex items-center justify-between p-2.5 pl-4 hover:bg-secondary/30 transition-colors text-left border-l-2 border-primary/30"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {openChapters.has(ch.id) ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                          <span className="font-semibold text-sm truncate">📖 {ch.name}</span>
                          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded shrink-0">{ch.parts.length} pt</span>
                        </div>
                        <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => openPart(ch.id, ch.parts.length)}><Plus className="w-3 h-3" /> Lecture</Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => del('chapters', ch.id)}><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      </button>

                      {/* Chapter Body / Parts List (Collapsible) */}
                      {openChapters.has(ch.id) && (
                        <div className="border-t border-border bg-muted/20 px-2 pb-2 pt-1">
                          {ch.parts.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-2 italic">No lectures yet.</p>}
                          <ul className="space-y-0.5">
                            {ch.parts.map((p: any) => (
                              <li key={p.id} className="flex items-center justify-between gap-2 bg-card rounded px-2 py-1.5 text-xs group hover:bg-secondary/40 transition-colors">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <Video className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate font-medium">{p.name}</span>
                                  <span className="text-[10px] text-muted-foreground truncate shrink-0 hidden sm:inline">({p.kind === 'live' ? '🔴 Live' : p.video_id})</span>
                                  {p.is_preview && <span className="text-[10px] font-bold text-primary shrink-0">FREE</span>}
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openPart(ch.id, ch.parts.length, p)}><Edit className="w-3 h-3" /></Button>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => del('parts', p.id)}><Trash2 className="w-3 h-3" /></Button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>

      {/* --- DIALOGS --- */}

      {/* 1. Add Subject Dialog */}
      <Dialog open={subjectDialog} onOpenChange={setSubjectDialog}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader><DialogTitle>Add New Subject</DialogTitle></DialogHeader>
          <div className="py-4">
            <Label>Subject Name</Label>
            <Input value={subjectName} onChange={(e) => setSubjectName(e.target.value)} placeholder="e.g., Mathematics, Physics..." autoFocus onKeyDown={(e) => e.key === 'Enter' && addSubject()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubjectDialog(false)}>Cancel</Button>
            <Button onClick={addSubject}>Add Subject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Add Chapter Dialog */}
      <Dialog open={chapterDialog.open} onOpenChange={(v) => setChapterDialog({ ...chapterDialog, open: v })}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader><DialogTitle>Add New Chapter</DialogTitle></DialogHeader>
          <div className="py-4">
            <Label>Chapter Name</Label>
            <Input value={chapterName} onChange={(e) => setChapterName(e.target.value)} placeholder="e.g., Algebra Basics, Thermodynamics..." autoFocus onKeyDown={(e) => e.key === 'Enter' && addChapter()} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChapterDialog({ open: false, subjectId: null })}>Cancel</Button>
            <Button onClick={addChapter}>Add Chapter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Add/Edit Lecture (Part) Dialog */}
      <Dialog open={partDialog.open} onOpenChange={(v) => setPartDialog({ ...partDialog, open: v })}>
        <DialogContent className="bg-card sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{partDialog.editing?.id ? 'Edit Lecture' : 'Add New Lecture'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Lecture name</Label>
              <Input value={partForm.name} onChange={(e) => setPartForm({ ...partForm, name: e.target.value })} maxLength={200} autoFocus />
            </div>
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-secondary/40 border border-border">
              <Switch checked={partForm.kind === 'live'} onCheckedChange={(v) => setPartForm({ ...partForm, kind: v ? 'live' : 'recorded' })} />
              <Label className="cursor-pointer">{partForm.kind === 'live' ? '🔴 Live class' : '📹 Recorded video'}</Label>
            </div>
            {partForm.kind === 'recorded' ? (
              <div>
                <Label>Video ID</Label>
                <Input value={partForm.video_id} onChange={(e) => setPartForm({ ...partForm, video_id: e.target.value.trim() })} placeholder="YouTube id or Bunny UUID" maxLength={64} />
                <p className="text-[10px] text-muted-foreground mt-1">Auto-detects YouTube (11 chars) vs Bunny.net (UUID).</p>
              </div>
            ) : (
              <div>
                <Label>Live URL (Google Meet / Zoom)</Label>
                <Input value={partForm.live_url} onChange={(e) => setPartForm({ ...partForm, live_url: e.target.value.trim() })} placeholder="https://meet.google.com/..." maxLength={500} />
              </div>
            )}
            <div>
              <Label>Notes URL (PDF link)</Label>
              <Input value={partForm.notes_url} onChange={(e) => setPartForm({ ...partForm, notes_url: e.target.value })} placeholder="https://drive.google.com/..." maxLength={500} />
            </div>
            <div>
              <Label>Duration (display text)</Label>
              <Input value={partForm.duration} onChange={(e) => setPartForm({ ...partForm, duration: e.target.value })} placeholder="e.g. 1:45:30" maxLength={20} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={partForm.is_preview} onCheckedChange={(v) => setPartForm({ ...partForm, is_preview: v })} />
              <Label className="cursor-pointer">Free preview (visible without enrollment)</Label>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setPartDialog({ open: false, chapterId: null, editing: null })}>Cancel</Button>
            <Button onClick={savePart}>Save Lecture</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCourseContent;