import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, ChevronLeft, Edit, ChevronDown, ChevronRight, BookOpen, FolderOpen, Video, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Types
interface Part {
  id: string;
  name: string;
  video_id: string;
  notes_url: string | null;
  duration: string | null;
  position: number;
  is_preview: boolean;
  kind: 'recorded' | 'live';
  live_chat_enabled: boolean;
}

interface Chapter {
  id: string;
  name: string;
  position: number;
  parts: Part[];
}

interface Subject {
  id: string;
  name: string;
  position: number;
  chapters: Chapter[];
}

interface Course {
  id: string;
  title: string;
}

interface PartForm {
  name: string;
  kind: 'recorded' | 'live';
  video_id: string;
  notes_url: string;
  duration: string;
  is_preview: boolean;
  live_chat_enabled: boolean;
}

interface PartDialogState {
  open: boolean;
  chapterId: string | null;
  editing: Part | null;
  count: number;
}

const EMPTY_PART_FORM: PartForm = {
  name: '',
  kind: 'recorded',
  video_id: '',
  notes_url: '',
  duration: '',
  is_preview: false,
  live_chat_enabled: false,
};

const INITIAL_PART_DIALOG: PartDialogState = {
  open: false,
  chapterId: null,
  editing: null,
  count: 0,
};

const AdminCourseContent = () => {
  const { id: courseId } = useParams<{ id: string }>();
  const [course, setCourse] = useState<Course | null>(null);
  const [tree, setTree] = useState<Subject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());
  const [openChapters, setOpenChapters] = useState<Set<string>>(new Set());

  const [subjectDialog, setSubjectDialog] = useState(false);
  const [chapterDialog, setChapterDialog] = useState<{ open: boolean; subjectId: string | null }>({ open: false, subjectId: null });
  const [partDialog, setPartDialog] = useState<PartDialogState>(INITIAL_PART_DIALOG);

  const [subjectName, setSubjectName] = useState('');
  const [chapterName, setChapterName] = useState('');
  const [partForm, setPartForm] = useState<PartForm>(EMPTY_PART_FORM);

  const load = useCallback(async () => {
    if (!courseId) return;

    const [courseRes, subjectsRes] = await Promise.all([
      supabase.from('courses').select('*').eq('id', courseId).maybeSingle(),
      supabase
        .from('subjects')
        .select('id, name, position, chapters(id, name, position, parts(id, name, video_id, notes_url, duration, position, is_preview, kind, live_chat_enabled))')
        .eq('course_id', courseId)
        .order('position'),
    ]);

    setCourse(courseRes.data);

    const sorted: Subject[] = (subjectsRes.data || []).map((s) => ({
      ...s,
      chapters: (s.chapters || [])
        .sort((a: any, b: any) => a.position - b.position)
        .map((ch: any) => ({
          ...ch,
          parts: (ch.parts || []).sort((a: any, b: any) => a.position - b.position),
        })),
    }));

    setTree(sorted);
    setIsLoading(false);
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSet = useCallback((setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleAccordionKeyDown = useCallback((e: React.KeyboardEvent, toggleFn: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleFn();
    }
  }, []);

  const addSubject = async () => {
    if (!subjectName.trim()) {
      toast.error('Subject name is required');
      return;
    }

    const { error } = await supabase
      .from('subjects')
      .insert({ course_id: courseId, name: subjectName.trim(), position: tree.length });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Subject added');
      setSubjectDialog(false);
      setSubjectName('');
      load();
    }
  };

  const addChapter = async () => {
    if (!chapterName.trim()) {
      toast.error('Chapter name is required');
      return;
    }

    const subject = tree.find((s) => s.id === chapterDialog.subjectId);
    const { error } = await supabase.from('chapters').insert({
      subject_id: chapterDialog.subjectId,
      name: chapterName.trim(),
      position: subject?.chapters?.length || 0,
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Chapter added');
      setChapterDialog({ open: false, subjectId: null });
      setChapterName('');
      load();
    }
  };

  const openPartDialog = (chapterId: string, count: number, editing: Part | null = null) => {
    setPartForm(
      editing
        ? {
            name: editing.name,
            kind: editing.kind,
            video_id: editing.video_id || '',
            notes_url: editing.notes_url || '',
            duration: editing.duration || '',
            is_preview: editing.is_preview,
            live_chat_enabled: editing.live_chat_enabled ?? false,
          }
        : { ...EMPTY_PART_FORM }
    );
    setPartDialog({ open: true, chapterId, editing, count });
  };

  const savePart = async () => {
    if (!partForm.name.trim()) {
      toast.error('Name is required');
      return;
    }

    if (!partForm.video_id.trim()) {
      toast.error(partForm.kind === 'live' ? 'FastPix Live UUID is required' : 'Video UUID is required');
      return;
    }

    const payload = {
      name: partForm.name.trim(),
      kind: partForm.kind,
      video_id: partForm.video_id.trim(),
      notes_url: partForm.notes_url || null,
      duration: partForm.duration || null,
      is_preview: partForm.is_preview,
      // Force false if not live
      live_chat_enabled: partForm.kind === 'live' ? partForm.live_chat_enabled : false,
    };

    const req = partDialog.editing?.id
      ? supabase.from('parts').update(payload).eq('id', partDialog.editing.id)
      : supabase.from('parts').insert({ ...payload, chapter_id: partDialog.chapterId, position: partDialog.count });

    const { error } = await req;

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Lecture saved');
      setPartDialog(INITIAL_PART_DIALOG);
      load();
    }
  };

  const deleteItem = async (table: 'subjects' | 'chapters' | 'parts', itemId: string) => {
    if (!confirm('Are you sure you want to delete this? This cannot be undone.')) return;

    const { error } = await supabase.from(table).delete().eq('id', itemId);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Deleted');
      load();
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="animate-pulse text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!course) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <header className="shrink-0 px-4 sm:px-6 py-4 border-b border-border bg-background z-10">
        <div className="flex justify-between items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button asChild variant="ghost" size="icon" className="shrink-0">
              <Link to="/admin/courses">
                <ChevronLeft className="w-4 h-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold truncate">{course.title}</h1>
              <p className="text-xs text-muted-foreground">Manage curriculum structure</p>
            </div>
          </div>
          <Button onClick={() => setSubjectDialog(true)} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Subject
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-muted/30">
        <div className="space-y-3 max-w-4xl mx-auto">
          {tree.length === 0 && (
            <Card className="p-8 text-center border-dashed bg-card">
              <FolderOpen className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm font-medium">No subjects yet</p>
              <p className="text-xs text-muted-foreground mb-4">Start building your course curriculum by adding a subject.</p>
              <Button variant="outline" onClick={() => setSubjectDialog(true)} size="sm">
                <Plus className="w-4 h-4 mr-1" /> Add First Subject
              </Button>
            </Card>
          )}

          {tree.map((subject) => (
            <Card key={subject.id} className="bg-card border-border overflow-hidden">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleSet(setOpenSubjects, subject.id)}
                onKeyDown={(e) => handleAccordionKeyDown(e, () => toggleSet(setOpenSubjects, subject.id))}
                className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-secondary/30 transition-colors text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {openSubjects.has(subject.id) ? (
                    <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                  )}
                  <BookOpen className="w-4 h-4 text-primary shrink-0" />
                  <h2 className="font-bold text-sm sm:text-base truncate">{subject.name}</h2>
                  <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded shrink-0">
                    {subject.chapters.length} ch
                  </span>
                </div>
                <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setChapterDialog({ open: true, subjectId: subject.id });
                      setChapterName('');
                    }}
                  >
                    <Plus className="w-3 h-3" /> Chapter
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteItem('subjects', subject.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {openSubjects.has(subject.id) && (
                <div className="border-t border-border bg-background/50 px-2 sm:px-4 pb-3 pt-2 space-y-2">
                  {subject.chapters.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-3 italic">Empty subject. Add a chapter below.</p>
                  )}

                  {subject.chapters.map((chapter) => (
                    <div key={chapter.id} className="border border-border rounded-md bg-card overflow-hidden">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleSet(setOpenChapters, chapter.id)}
                        onKeyDown={(e) => handleAccordionKeyDown(e, () => toggleSet(setOpenChapters, chapter.id))}
                        className="w-full flex items-center justify-between p-2.5 pl-4 hover:bg-secondary/30 transition-colors text-left border-l-2 border-primary/30 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {openChapters.has(chapter.id) ? (
                            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="font-semibold text-sm truncate">📖 {chapter.name}</span>
                          <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded shrink-0">
                            {chapter.parts.length} pt
                          </span>
                        </div>
                        <div className="flex items-center gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px] px-2"
                            onClick={() => openPartDialog(chapter.id, chapter.parts.length)}
                          >
                            <Plus className="w-3 h-3" /> Lecture
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={() => deleteItem('chapters', chapter.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {openChapters.has(chapter.id) && (
                        <div className="border-t border-border bg-muted/20 px-2 pb-2 pt-1">
                          {chapter.parts.length === 0 && (
                            <p className="text-[11px] text-muted-foreground text-center py-2 italic">No lectures yet.</p>
                          )}
                          <ul className="space-y-0.5">
                            {chapter.parts.map((part) => (
                              <li
                                key={part.id}
                                className="flex items-center justify-between gap-2 bg-card rounded px-2 py-1.5 text-xs group hover:bg-secondary/40 transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <Video className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                  <span className="truncate font-medium">{part.name}</span>
                                  
                                  {/* Tags */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                      ({part.kind === 'live' ? '🔴 Live' : '📹 Rec'}: {part.video_id})
                                    </span>
                                    {part.is_preview && (
                                      <span className="text-[10px] font-bold text-primary">Guest</span>
                                    )}
                                    {part.kind === 'live' && part.live_chat_enabled && (
                                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-500">
                                        <MessageCircle className="w-3 h-3" /> Chat
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0"
                                    onClick={() => openPartDialog(chapter.id, chapter.parts.length, part)}
                                  >
                                    <Edit className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                    onClick={() => deleteItem('parts', part.id)}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
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

      {/* Subject Dialog */}
      <Dialog open={subjectDialog} onOpenChange={setSubjectDialog}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Subject</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Subject Name</Label>
            <Input
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="e.g., Mathematics, Physics..."
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && addSubject()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubjectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addSubject}>Add Subject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Chapter Dialog */}
      <Dialog open={chapterDialog.open} onOpenChange={(v) => setChapterDialog((prev) => ({ ...prev, open: v }))}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Chapter</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>Chapter Name</Label>
            <Input
              value={chapterName}
              onChange={(e) => setChapterName(e.target.value)}
              placeholder="e.g., Algebra Basics, Thermodynamics..."
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && addChapter()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChapterDialog({ open: false, subjectId: null })}>
              Cancel
            </Button>
            <Button onClick={addChapter}>Add Chapter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Part Dialog */}
      <Dialog open={partDialog.open} onOpenChange={(v) => setPartDialog((prev) => ({ ...prev, open: v }))}>
        <DialogContent className="bg-card sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{partDialog.editing?.id ? 'Edit Lecture' : 'Add New Lecture'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Lecture Name</Label>
              <Input
                value={partForm.name}
                onChange={(e) => setPartForm((prev) => ({ ...prev, name: e.target.value }))}
                maxLength={200}
                autoFocus
              />
            </div>

            {/* Recorded / Live Toggle */}
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-secondary/40 border border-border">
              <Switch
                checked={partForm.kind === 'live'}
                onCheckedChange={(v) => 
                  setPartForm((prev) => ({ 
                    ...prev, 
                    kind: v ? 'live' : 'recorded',
                    // Automatically disable chat if switching back to recorded
                    live_chat_enabled: v ? prev.live_chat_enabled : false
                  }))
                }
              />
              <Label className="cursor-pointer">
                {partForm.kind === 'live' ? '🔴 Live class (FastPix)' : '📹 Recorded video (Bunny)'}
              </Label>
            </div>

            {/* Live Chat Toggle (Visible ONLY for Live kind) */}
            {partForm.kind === 'live' && (
              <div className={cn(
                "flex items-center gap-2 p-2.5 rounded-md border transition-all duration-200",
                "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
              )}>
                <Switch
                  checked={partForm.live_chat_enabled}
                  onCheckedChange={(v) => setPartForm((prev) => ({ ...prev, live_chat_enabled: v }))}
                  className="data-[state=checked]:bg-red-500"
                />
                <Label className="cursor-pointer flex items-center gap-1.5 text-sm">
                  <MessageCircle className="w-4 h-4 text-red-500" />
                  Enable Live Chat
                </Label>
              </div>
            )}

            <div>
              <Label>{partForm.kind === 'live' ? 'FastPix Live UUID' : 'Bunny Video UUID'}</Label>
              <Input
                value={partForm.video_id}
                onChange={(e) => setPartForm((prev) => ({ ...prev, video_id: e.target.value.trim() }))}
                placeholder={partForm.kind === 'live' ? 'e.g. 798af3fa-4f15-...' : 'e.g. abc123-def456-...'}
                maxLength={64}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                {partForm.kind === 'live'
                  ? 'Paste the FastPix Playback ID for the live stream.'
                  : 'Paste the Bunny Stream Video ID.'}
              </p>
            </div>

            <div>
              <Label>Notes URL (PDF link)</Label>
              <Input
                value={partForm.notes_url}
                onChange={(e) => setPartForm((prev) => ({ ...prev, notes_url: e.target.value }))}
                placeholder="https://drive.google.com/..."
                maxLength={500}
              />
            </div>

            <div>
              <Label>Duration (display text)</Label>
              <Input
                value={partForm.duration}
                onChange={(e) => setPartForm((prev) => ({ ...prev, duration: e.target.value }))}
                placeholder="e.g. 1:45:30"
                maxLength={20}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={partForm.is_preview}
                onCheckedChange={(v) => setPartForm((prev) => ({ ...prev, is_preview: v }))}
              />
              <Label className="cursor-pointer">Free preview (visible without enrollment)</Label>
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setPartDialog(INITIAL_PART_DIALOG)}>
              Cancel
            </Button>
            <Button onClick={savePart}>Save Lecture</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCourseContent;