import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Trash2, Plus, Megaphone, Search, AlertTriangle, ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

const emptyForm = { course_id: '', title: '', body: '', image_url: '' };

const AdminAnnouncements = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCourse, setFilterCourse] = useState('all');
  
  // Delete Dialog State
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string | null; title: string }>({ open: false, id: null, title: '' });
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('courses').select('id, title').order('title'),
      supabase.from('announcements').select('*, courses(title)').order('created_at', { ascending: false }).limit(500),
    ]);
    setCourses(c || []);
    setItems(a || []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.course_id) { toast.error('Please select a course', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); return; }
    if (!form.title.trim()) { toast.error('Title is required', { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); return; }
    
    setSaving(true);
    try {
      const { error } = await supabase.from('announcements').insert({
        course_id: form.course_id,
        title: form.title.trim(),
        body: form.body?.trim() || null,
        image_url: form.image_url?.trim() || null,
      });
      if (error) { toast.error(error.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> }); return; }
      toast.success('Announcement posted successfully');
      setForm(emptyForm);
      load();
    } finally {
      setSaving(false);
    }
  };

  const openDeleteDialog = (id: string, title: string) => {
    setDeleteDialog({ open: true, id, title });
  };

  const confirmDelete = async () => {
    if (!deleteDialog.id) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', deleteDialog.id);
      if (error) throw error;
      toast.success('Announcement deleted');
      setDeleteDialog({ open: false, id: null, title: '' });
      load();
    } catch (err: any) {
      toast.error(err.message, { icon: <AlertTriangle className="h-4 w-4 text-red-500" /> });
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => items.filter(a => {
    if (filterCourse !== 'all' && a.course_id !== filterCourse) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const hay = `${a.title} ${a.body || ''} ${a.courses?.title || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [items, filterCourse, search]);

  return (
    // Fixed Admin Layout Wrapper
    <div className="flex flex-col h-full overflow-hidden">
      
      {/* Header */}
      <div className="shrink-0 mb-4">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-primary" /> Announcements
        </h1>
        <p className="text-xs text-muted-foreground mt-1">Post real-time updates to enrolled students per course.</p>
      </div>

      {/* Create Form Section */}
      <Card className="shrink-0 p-4 sm:p-5 bg-card border-border shadow-sm mb-4 space-y-4">
        <h2 className="text-sm font-bold flex items-center gap-2">
          <Plus className="w-4 h-4 text-primary" /> Post New Announcement
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Label>Course <span className="text-destructive">*</span></Label>
            <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
              <SelectTrigger className="mt-1.5 bg-background"><SelectValue placeholder="Select target course" /></SelectTrigger>
              <SelectContent className="bg-card">
                {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          
          <div className="sm:col-span-2">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input 
              value={form.title} 
              onChange={(e) => setForm({ ...form, title: e.target.value })} 
              maxLength={200} 
              className="mt-1.5 bg-background"
              placeholder="e.g., Welcome to the batch!"
            />
          </div>
          
          <div className="sm:col-span-2">
            <Label>Body Text</Label>
            <Textarea 
              value={form.body} 
              onChange={(e) => setForm({ ...form, body: e.target.value })} 
              maxLength={2000} 
              rows={3} 
              className="mt-1.5 bg-background resize-none"
              placeholder="Write your announcement details here..."
            />
          </div>

          <div className="sm:col-span-2">
            <Label>Image URL (Optional)</Label>
            <Input 
              value={form.image_url} 
              onChange={(e) => setForm({ ...form, image_url: e.target.value })} 
              placeholder="https://example.com/image.png" 
              maxLength={500}
              className="mt-1.5 bg-background"
            />
          </div>
        </div>

        {form.image_url && (
          <div className="relative w-full max-w-xs h-40 bg-muted rounded-lg border border-border overflow-hidden">
            <img src={form.image_url} alt="preview" className="w-full h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <ImageOff className="absolute inset-0 m-auto w-8 h-8 text-muted-foreground hidden" id="img-fallback" />
          </div>
        )}

        <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
          {saving ? 'Posting…' : <><Plus className="w-4 h-4 mr-1" /> Post Announcement</>}
        </Button>
      </Card>

      {/* Filters Section */}
      <Card className="shrink-0 p-3 bg-card border-border shadow-sm mb-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Search title or content…" 
              className="pl-9 h-9 bg-background text-xs"
            />
          </div>
          <Select value={filterCourse} onValueChange={setFilterCourse}>
            <SelectTrigger className="h-9 bg-background text-xs"><SelectValue placeholder="Filter by course" /></SelectTrigger>
            <SelectContent className="bg-card">
              <SelectItem value="all">All Courses</SelectItem>
              {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Scrollable Announcements List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-muted-foreground">History ({filtered.length})</h3>
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 border border-dashed rounded-lg text-muted-foreground text-sm">
            No announcements found.
          </div>
        )}

        {filtered.map(a => (
          <Card key={a.id} className="p-4 bg-card border-border shadow-sm hover:shadow-md transition-shadow group">
            <div className="flex items-start gap-4">
              {/* Image */}
              {a.image_url ? (
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted shrink-0 border border-border">
                  <img src={a.image_url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-lg bg-muted shrink-0 flex items-center justify-center border border-border">
                  <Megaphone className="w-6 h-6 text-muted-foreground/30" />
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="font-semibold text-sm truncate">{a.title}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        {a.courses?.title || 'Unknown Course'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="h-8 w-8 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 hover:text-destructive"
                    onClick={() => openDeleteDialog(a.id, a.title)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
                
                {a.body && (
                  <div className="text-xs mt-2 text-muted-foreground line-clamp-3 whitespace-pre-wrap leading-relaxed">
                    {a.body}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
        
        {/* Bottom Spacing */}
        <div className="h-4" />
      </div>

      {/* --- DELETE CONFIRMATION DIALOG --- */}
      <Dialog open={deleteDialog.open} onOpenChange={(v) => setDeleteDialog({ ...deleteDialog, open: v })}>
        <DialogContent className="bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Delete Announcement
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete: <span className="font-bold text-foreground">"{deleteDialog.title}"</span>? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: null, title: '' })}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default AdminAnnouncements;