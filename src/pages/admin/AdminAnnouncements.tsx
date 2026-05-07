import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Megaphone, Search } from 'lucide-react';
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

  const load = async () => {
    const [{ data: c }, { data: a }] = await Promise.all([
      supabase.from('courses').select('id, title').order('title'),
      supabase.from('announcements').select('*, courses(title)').order('created_at', { ascending: false }).limit(200),
    ]);
    setCourses(c || []);
    setItems(a || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.course_id) { toast.error('Pick a course'); return; }
    if (!form.title.trim()) { toast.error('Title required'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from('announcements').insert({
        course_id: form.course_id,
        title: form.title.trim(),
        body: form.body?.trim() || null,
        image_url: form.image_url?.trim() || null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Announcement posted');
      setForm(emptyForm);
      load();
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm('Delete announcement?')) return;
    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    load();
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
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2"><Megaphone className="text-primary" /> Announcements</h1>
      <p className="text-xs text-muted-foreground mb-4">Post updates to enrolled students. They appear in the bell icon in real-time.</p>

      <Card className="p-4 bg-card border-border mb-6 space-y-3">
        <div>
          <Label>Course *</Label>
          <Select value={form.course_id} onValueChange={(v) => setForm({ ...form, course_id: v })}>
            <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
            <SelectContent className="bg-card">
              {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div><Label>Title *</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} /></div>
        <div><Label>Body</Label><Textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={2000} rows={3} /></div>
        <div>
          <Label>Image URL</Label>
          <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://…" maxLength={500} />
        </div>
        {form.image_url && <img src={form.image_url} alt="preview" className="max-h-40 rounded" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
        <Button onClick={save} disabled={saving} className="w-full"><Plus className="w-4 h-4 mr-1" /> {saving ? 'Posting…' : 'Post Announcement'}</Button>
      </Card>

      <Card className="p-3 mb-3 bg-card border-border grid gap-2 md:grid-cols-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-8" />
        </div>
        <Select value={filterCourse} onValueChange={setFilterCourse}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent className="bg-card">
            <SelectItem value="all">All courses</SelectItem>
            {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <div className="space-y-2">
        {filtered.map(a => (
          <Card key={a.id} className="p-3 bg-card border-border flex items-start gap-3">
            {a.image_url && <img src={a.image_url} alt="" className="w-16 h-16 object-cover rounded shrink-0" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{a.title}</div>
              <div className="text-[11px] text-muted-foreground">{a.courses?.title} • {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</div>
              {a.body && <div className="text-xs mt-1 line-clamp-3 whitespace-pre-wrap">{a.body}</div>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => del(a.id)}><Trash2 className="w-3 h-3" /></Button>
          </Card>
        ))}
        {filtered.length === 0 && <p className="text-sm text-muted-foreground">No announcements match.</p>}
      </div>
    </div>
  );
};

export default AdminAnnouncements;
