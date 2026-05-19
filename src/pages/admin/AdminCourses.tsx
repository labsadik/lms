import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, ListTree, Eye, Loader2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { slugify, formatPriceINR } from '@/lib/format';

interface EnrolledUser {
  id: string;
  user_id: string;
  course_id: string;
  amount_paid_inr: number;
  promocode: string | null;
  enrolled_at: string;
  profiles: {
    display_name: string | null;
    avatar_url: string | null;
    phone: string | null;
  } | null;
  completion_percentage: number;
}

const AdminCourses = () => {
  const [courses, setCourses] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({
    title: '', slug: '', description: '', meta_description: '', 
    thumbnail_url: '', instructor: '', price_inr: 0, is_published: false,
  });

  const [viewingCourseId, setViewingCourseId] = useState<string | null>(null);
  const [enrolledUsers, setEnrolledUsers] = useState<EnrolledUser[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  
  // Email Map for Admin view (Fetched securely via Edge Function)
  const [emailMap, setEmailMap] = useState<Record<string, string>>({});
  
  // Date Filter State
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Fetch Courses & Auth Emails on mount
  useEffect(() => { 
    loadCourses(); 
    loadAuthEmails();
  }, []);

  const loadCourses = async () => {
    const { data } = await supabase.from('courses').select('*').order('created_at', { ascending: false });
    setCourses(data || []);
  };

  const loadAuthEmails = async () => {
    try {
      const { data } = await supabase.functions.invoke('admin-users');
      if (data?.users) {
        const map: Record<string, string> = {};
        data.users.forEach((u: any) => { map[u.id] = u.email; });
        setEmailMap(map);
      }
    } catch (error) {
      console.error('Failed to load auth emails', error);
    }
  };

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
    loadCourses();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete course and ALL its content?')) return;
    const { error } = await supabase.from('courses').delete().eq('id', id);
    if (error) toast.error(error.message); else { toast.success('Deleted'); loadCourses(); }
  };

  const handleViewEnrollments = async (courseId: string) => {
    setViewingCourseId(courseId);
    setLoadingEnrollments(true);
    setEnrolledUsers([]);
    setFilterStartDate('');
    setFilterEndDate('');

    try {
      // 1. Fetch Enrollments & Profiles
      const { data: enrollData, error: enrollError } = await supabase
        .from('enrollments')
        .select('*')
        .eq('course_id', courseId);

      if (enrollError) throw enrollError;
      if (!enrollData || enrollData.length === 0) return;

      const userIds = enrollData.map((e: any) => e.user_id);
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, phone')
        .in('user_id', userIds);

      if (profilesError) throw profilesError;

      const profilesMap: Record<string, any> = {};
      profilesData?.forEach((p: any) => { profilesMap[p.user_id] = p; });

      // 2. Calculate Course Structure & Progress
      const { data: subjects } = await supabase.from('subjects').select('id').eq('course_id', courseId);
      const subjectIds = subjects?.map((s: any) => s.id) || [];

      let totalParts = 0;
      let partIds: string[] = [];

      if (subjectIds.length > 0) {
        const { data: chapters } = await supabase.from('chapters').select('id').in('subject_id', subjectIds);
        const chapterIds = chapters?.map((c: any) => c.id) || [];

        if (chapterIds.length > 0) {
          const { data: parts } = await supabase.from('parts').select('id').in('chapter_id', chapterIds);
          totalParts = parts?.length || 0;
          partIds = parts?.map((p: any) => p.id) || [];
        }
      }

      const userCompletedParts: Record<string, number> = {};
      if (partIds.length > 0) {
        const { data: progressData } = await supabase
          .from('progress')
          .select('user_id')
          .in('part_id', partIds)
          .eq('completed', true);

        progressData?.forEach((p: any) => {
          userCompletedParts[p.user_id] = (userCompletedParts[p.user_id] || 0) + 1;
        });
      }

      // 3. Combine Data
      const mergedData = enrollData.map((e: any) => ({
        ...e,
        profiles: profilesMap[e.user_id] || null,
        completion_percentage: totalParts > 0 ? Math.round(((userCompletedParts[e.user_id] || 0) / totalParts) * 100) : 0,
      }));

      setEnrolledUsers(mergedData);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load enrollments');
    } finally {
      setLoadingEnrollments(false);
    }
  };

  // Get current course price for relative display
  const currentCourse = courses.find((c) => c.id === viewingCourseId);
  const coursePrice = currentCourse?.price_inr || 0;

  // Filter Enrollments by Date Range
  const filteredEnrollments = useMemo(() => {
    return enrolledUsers.filter((enroll) => {
      if (!filterStartDate && !filterEndDate) return true;
      const enrolledDate = new Date(enroll.enrolled_at).toISOString().split('T')[0];
      const startValid = !filterStartDate || enrolledDate >= filterStartDate;
      const endValid = !filterEndDate || enrolledDate <= filterEndDate;
      return startValid && endValid;
    });
  }, [enrolledUsers, filterStartDate, filterEndDate]);

  return (
    <div>
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Courses</h1>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> New Course</Button>
      </header>

      <div className="space-y-2">
        {courses.map((c) => (
          <Card key={c.id} className="p-3 bg-card border-border flex items-center gap-4">
            {c.thumbnail_url && <img src={c.thumbnail_url} className="w-20 h-12 object-cover rounded flex-shrink-0" alt="" />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{c.title}</div>
              <div className="text-xs text-muted-foreground">/{c.slug} • {formatPriceINR(c.price_inr)} • {c.is_published ? 'Published' : 'Draft'}</div>
            </div>
            
            <div className="flex items-center gap-2 shrink-0 ml-auto">
              <Button variant="default" size="sm" onClick={() => handleViewEnrollments(c.id)} title="View Enrolled Users" className="gap-1.5">
                <Eye className="w-4 h-4" /> Users
              </Button>

              <Button asChild variant="outline" size="sm" title="Course Content">
                <Link to={`/admin/courses/${c.id}`}><ListTree className="w-4 h-4" /></Link>
              </Button>
              
              <Button variant="outline" size="sm" onClick={() => openEdit(c)} title="Edit Course">
                <Edit className="w-4 h-4" />
              </Button>
              
              <Button variant="destructive" size="sm" onClick={() => remove(c.id)} title="Delete Course">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
        {courses.length === 0 && <p className="text-muted-foreground text-sm">No courses yet.</p>}
      </div>

      {/* Create/Edit Dialog */}
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

      {/* Enrollments Popup Dialog */}
      <Dialog open={!!viewingCourseId} onOpenChange={(isOpen) => { if (!isOpen) setViewingCourseId(null); }}>
        <DialogContent className="bg-card max-h-[90vh] overflow-y-auto max-w-3xl">
          <DialogHeader>
            <DialogTitle>Enrolled Users ({filteredEnrollments.length})</DialogTitle>
          </DialogHeader>

          {/* Date Filters */}
          <div className="grid grid-cols-2 gap-3 py-2 border-b border-border mb-2">
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> From</Label>
              <Input 
                type="date" 
                value={filterStartDate} 
                onChange={(e) => setFilterStartDate(e.target.value)} 
                className="mt-1 h-9 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" /> To</Label>
              <Input 
                type="date" 
                value={filterEndDate} 
                onChange={(e) => setFilterEndDate(e.target.value)} 
                className="mt-1 h-9 text-sm"
              />
            </div>
          </div>

          {loadingEnrollments ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Loading enrollments…</span>
            </div>
          ) : filteredEnrollments.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center border border-dashed rounded-md p-6">
              {enrolledUsers.length === 0 ? 'No enrollments yet.' : 'No enrollments found for selected dates.'}
            </p>
          ) : (
            <div className="space-y-2 mt-2">
              {filteredEnrollments.map((enroll) => (
                <div key={enroll.id} className="p-2.5 bg-background rounded-md border group">
                  <div className="flex items-center gap-3">
                    
                    {/* Avatar Logic */}
                    <div className="w-9 h-9 rounded-full bg-secondary shrink-0 flex items-center justify-center text-sm font-bold text-muted-foreground overflow-hidden">
                      {enroll.profiles?.avatar_url ? (
                        <img src={enroll.profiles.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        (enroll.profiles?.display_name || emailMap[enroll.user_id] || '?')[0].toUpperCase()
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate flex items-center gap-2">
                        {enroll.profiles?.display_name || 'Unnamed User'}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {/* Email rendered securely from Edge Function */}
                        {emailMap[enroll.user_id] || '—'} 
                        {enroll.profiles?.phone ? ` · ${enroll.profiles.phone}` : ''}
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-2">
                      {/* Relative Price Display (Paid vs Total) */}
                      <div className="font-bold text-xs text-green-500 flex items-center justify-end gap-1">
                        <span>₹{(enroll.amount_paid_inr || 0).toLocaleString()}</span>
                        {coursePrice > 0 && enroll.amount_paid_inr < coursePrice && (
                          <span className="text-muted-foreground line-through font-normal text-[10px]">/ ₹{coursePrice.toLocaleString()}</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(enroll.enrolled_at).toLocaleDateString()} &bull; {new Date(enroll.enrolled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>

                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Progress</span>
                    <span className="font-bold text-primary">{enroll.completion_percentage}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${enroll.completion_percentage === 100 ? 'bg-green-500' : 'bg-primary'}`} 
                      style={{ width: `${enroll.completion_percentage}%` }} 
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminCourses;