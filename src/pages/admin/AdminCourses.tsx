import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, ListTree } from 'lucide-react';
import { toast } from 'sonner';
import { slugify, formatPriceINR } from '@/lib/format';

const AdminCourses = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ title: '', slug: '', description: '', meta_description: '', thumbnail_url: '', instructor: '', price_inr: 0, is_published: false });

  const load = async () => {
    const { data } = await supabase.from('courses').select('*').order('created_at', { ascending: false });
    setCourses(data || []);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ title: '', slug: '', description: '', meta_description: '', thumbnail_url: '', instructor: '', price_inr: 0, is_published: false });
    setOpen(true);
  };
  const openEdit = (c: any) => {
    setEditing(c);
    setForm({ title: c.title, slug: c.slug, description: c.description || '', meta_description: c.meta_description || '', thumbnail_url: c.thumbnail_url || '', instructor: c.instructor || '', price_inr: c.price_inr, is_published: c.is_published });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error('Title required'); return; }
    const payload = { ...form, slug: form.slug || slugify(form.title) };
    if (editing) {
      const { error } = await supabase.from('courses').update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Course updated');
    } else {
      const { error } = await supabase.from('courses').insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success('Course created');
    }
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete course and ALL its content?')) return;
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Deleted'); load(); }
  };

  return (
    <div>
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Courses</h1>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New Course</Button>
      </header>
      <div className="space-y-2">
        {courses.map((c) => (
          <Card key={c.id} className="p-3 bg-card border-border flex items-center gap-3">
            {c.thumbnail_url && <img src={c.thumbnail_url} className="w-20 h-12 object-cover rounded flex-shrink-0" alt="" />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{c.title}</div>
              <div className="text-xs text-muted-foreground">/{c.slug} • {formatPriceINR(c.price_inr)} • {c.is_published ? 'Published' : 'Draft'}</div>
            </div>
            <Button asChild variant="outline" size="sm"><Link to={`/admin/courses/${c.id}`}><ListTree className="w-4 h-4" /></Link></Button>
            <Button variant="outline" size="sm" onClick={() => openEdit(c)}><Edit className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => remove(c.id)}><Trash2 className="w-4 h-4" /></Button>
          </Card>
        ))}
        {courses.length === 0 && <p className="text-muted-foreground text-sm">No courses yet.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit course' : 'New course'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: editing ? form.slug : slugify(e.target.value) })} maxLength={200} /></div>
            <div><Label>Slug (URL)</Label><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} maxLength={100} /></div>
            <div><Label>Instructor</Label><Input value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} maxLength={100} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={2000} rows={3} /></div>
            <div><Label>Meta description (SEO, &lt;160 chars)</Label><Textarea value={form.meta_description} onChange={(e) => setForm({ ...form, meta_description: e.target.value })} maxLength={160} rows={2} /></div>
            <div><Label>Thumbnail URL</Label><Input value={form.thumbnail_url} onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })} maxLength={500} /></div>
            <div><Label>Price (₹ INR)</Label><Input type="number" min={0} value={form.price_inr} onChange={(e) => setForm({ ...form, price_inr: parseInt(e.target.value) || 0 })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_published} onCheckedChange={(v) => setForm({ ...form, is_published: v })} /> <Label>Published</Label></div>
            <Button onClick={save} className="w-full">Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCourses;
