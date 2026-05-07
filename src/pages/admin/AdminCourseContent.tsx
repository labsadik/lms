import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, ChevronLeft, Edit } from 'lucide-react';
import { toast } from 'sonner';

const AdminCourseContent = () => {
  const { id } = useParams<{ id: string }>();
  const [course, setCourse] = useState<any>(null);
  const [tree, setTree] = useState<any[]>([]);
  const [partDialog, setPartDialog] = useState<{ open: boolean; chapterId: string | null; editing: any }>({ open: false, chapterId: null, editing: null });
  const [partForm, setPartForm] = useState({ name: '', kind: 'recorded' as 'recorded' | 'live', video_id: '', live_url: '', notes_url: '', duration: '', is_preview: false });

  const load = async () => {
    const { data: c } = await supabase.from('courses').select('*').eq('id', id).maybeSingle();
    setCourse(c);
    const { data: subjects } = await supabase
      .from('subjects')
      .select('id, name, position, chapters(id, name, position, parts(id, name, video_id, notes_url, duration, position, is_preview))')
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

  const addSubject = async () => {
    const name = prompt('Subject name?'); if (!name) return;
    const { error } = await supabase.from('subjects').insert({ course_id: id, name, position: tree.length });
    if (error) toast.error(error.message); else load();
  };
  const addChapter = async (sid: string, count: number) => {
    const name = prompt('Chapter name?'); if (!name) return;
    const { error } = await supabase.from('chapters').insert({ subject_id: sid, name, position: count });
    if (error) toast.error(error.message); else load();
  };
  const openPart = (chapterId: string, count: number, editing: any = null) => {
    if (editing) setPartForm({ name: editing.name, kind: editing.kind || 'recorded', video_id: editing.video_id || '', live_url: editing.live_url || '', notes_url: editing.notes_url || '', duration: editing.duration || '', is_preview: editing.is_preview });
    else setPartForm({ name: '', kind: 'recorded', video_id: '', live_url: '', notes_url: '', duration: '', is_preview: false });
    setPartDialog({ open: true, chapterId, editing: editing ? { ...editing, _count: count } : { _count: count } });
  };
  const savePart = async () => {
    if (!partForm.name) { toast.error('Name required'); return; }
    if (partForm.kind === 'recorded' && !partForm.video_id) { toast.error('Video ID required (YouTube ID or Bunny UUID)'); return; }
    if (partForm.kind === 'live' && !partForm.live_url) { toast.error('Live URL required'); return; }
    const payload: any = { ...partForm, video_id: partForm.video_id || '' };
    if (partDialog.editing?.id) {
      const { error } = await supabase.from('parts').update(payload).eq('id', partDialog.editing.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from('parts').insert({ ...payload, chapter_id: partDialog.chapterId, position: partDialog.editing._count });
      if (error) { toast.error(error.message); return; }
    }
    toast.success('Saved');
    setPartDialog({ open: false, chapterId: null, editing: null });
    load();
  };
  const del = async (table: 'subjects' | 'chapters' | 'parts', rid: string) => {
    if (!confirm('Delete?')) return;
    const { error } = await supabase.from(table).delete().eq('id', rid);
    if (error) toast.error(error.message); else load();
  };

  if (!course) return <div>Loading…</div>;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3"><Link to="/admin/courses"><ChevronLeft className="w-4 h-4" /> Back</Link></Button>
      <header className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-bold">{course.title}</h1>
          <p className="text-xs text-muted-foreground">Manage subjects, chapters, parts</p>
        </div>
        <Button onClick={addSubject}><Plus className="w-4 h-4 mr-1" /> Subject</Button>
      </header>

      <div className="space-y-3">
        {tree.map((s: any) => (
          <Card key={s.id} className="p-3 bg-card border-border">
            <div className="flex justify-between items-center">
              <h2 className="font-bold">📚 {s.name}</h2>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => addChapter(s.id, s.chapters.length)}><Plus className="w-3 h-3" /> Chapter</Button>
                <Button size="sm" variant="outline" onClick={() => del('subjects', s.id)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
            <div className="ml-4 mt-2 space-y-2">
              {s.chapters.map((ch: any) => (
                <div key={ch.id} className="border-l-2 border-border pl-3">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold text-sm">📖 {ch.name}</h3>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openPart(ch.id, ch.parts.length)}><Plus className="w-3 h-3" /> Part</Button>
                      <Button size="sm" variant="ghost" onClick={() => del('chapters', ch.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <ul className="ml-2 mt-1 space-y-1">
                    {ch.parts.map((p: any) => (
                      <li key={p.id} className="flex justify-between items-center text-xs py-1">
                        <span className="truncate flex-1">▶ {p.name} <span className="text-muted-foreground">({p.video_id})</span> {p.is_preview && <span className="text-primary">[Preview]</span>}</span>
                        <Button size="sm" variant="ghost" onClick={() => openPart(ch.id, ch.parts.length, p)}><Edit className="w-3 h-3" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => del('parts', p.id)}><Trash2 className="w-3 h-3" /></Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>
        ))}
        {tree.length === 0 && <p className="text-muted-foreground text-sm">No subjects yet. Click "Subject" to start building.</p>}
      </div>

      <Dialog open={partDialog.open} onOpenChange={(v) => setPartDialog({ ...partDialog, open: v })}>
        <DialogContent className="bg-card">
          <DialogHeader><DialogTitle>{partDialog.editing?.id ? 'Edit lecture' : 'New lecture'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Lecture name</Label><Input value={partForm.name} onChange={(e) => setPartForm({ ...partForm, name: e.target.value })} maxLength={200} /></div>
            <div className="flex items-center gap-2 p-2 rounded bg-secondary/40">
              <Switch checked={partForm.kind === 'live'} onCheckedChange={(v) => setPartForm({ ...partForm, kind: v ? 'live' : 'recorded' })} />
              <Label>{partForm.kind === 'live' ? '🔴 Live class' : '📹 Recorded video'}</Label>
            </div>
            {partForm.kind === 'recorded' ? (
              <div><Label>Video ID</Label><Input value={partForm.video_id} onChange={(e) => setPartForm({ ...partForm, video_id: e.target.value.trim() })} placeholder="YouTube id (jfC07vrz0Z0) or Bunny UUID" maxLength={64} /><p className="text-[10px] text-muted-foreground mt-1">Auto-detects YouTube (11 chars) vs Bunny.net (UUID). Live URLs supported too.</p></div>
            ) : (
              <div><Label>Live URL (Google Meet / Zoom)</Label><Input value={partForm.live_url} onChange={(e) => setPartForm({ ...partForm, live_url: e.target.value.trim() })} placeholder="https://meet.google.com/..." maxLength={500} /></div>
            )}
            <div><Label>Notes URL (PDF link)</Label><Input value={partForm.notes_url} onChange={(e) => setPartForm({ ...partForm, notes_url: e.target.value })} placeholder="https://..." maxLength={500} /></div>
            <div><Label>Duration (display)</Label><Input value={partForm.duration} onChange={(e) => setPartForm({ ...partForm, duration: e.target.value })} placeholder="e.g. 1:45:30" maxLength={20} /></div>
            <div className="flex items-center gap-2"><Switch checked={partForm.is_preview} onCheckedChange={(v) => setPartForm({ ...partForm, is_preview: v })} /><Label>Free preview (visible without enrollment)</Label></div>
            <Button onClick={savePart} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCourseContent;
