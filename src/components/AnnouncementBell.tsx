import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

const AnnouncementBell = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [reads, setReads] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!user) return;
    const { data: ens, error: enErr } = await supabase.from('enrollments').select('course_id').eq('user_id', user.id);
    if (enErr) { console.error('enrollments load failed', enErr); return; }
    const ids = new Set((ens || []).map((e: any) => e.course_id));
    setEnrolledIds(ids);
    if (ids.size === 0) { setItems([]); setReads(new Set()); return; }
    const { data: a, error: aErr } = await supabase
      .from('announcements')
      .select('*, courses(title, slug)')
      .in('course_id', Array.from(ids))
      .order('created_at', { ascending: false })
      .limit(50);
    if (aErr) { console.error('announcements load failed', aErr); }
    setItems(a || []);
    const { data: r } = await supabase.from('announcement_reads').select('announcement_id').eq('user_id', user.id);
    setReads(new Set((r || []).map((x: any) => x.announcement_id)));
  };
  useEffect(() => { load(); }, [user]);

  useEffect(() => {
    if (!user || enrolledIds.size === 0) return;
    const ch = supabase
      .channel('announcements-bell-' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, async (payload) => {
        const newRow: any = payload.new;
        if (!enrolledIds.has(newRow.course_id)) return;
        const { data: course } = await supabase.from('courses').select('title, slug').eq('id', newRow.course_id).maybeSingle();
        const data: any = { ...newRow, courses: course };
        setItems(prev => [data, ...prev.filter(p => p.id !== data.id)]);
        toast.info(`📢 ${data.title}`, { description: course?.title });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'announcements' }, (payload) => {
        setItems(prev => prev.filter(p => p.id !== (payload.old as any).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, enrolledIds]);

  const unread = items.filter(i => !reads.has(i.id)).length;

  const markAllRead = async () => {
    if (!user || unread === 0) return;
    const newOnes = items.filter(i => !reads.has(i.id)).map(i => ({ user_id: user.id, announcement_id: i.id }));
    await supabase.from('announcement_reads').insert(newOnes);
    setReads(new Set([...reads, ...newOnes.map(n => n.announcement_id)]));
  };

  if (!user) return null;
  return (
    <>
      <button onClick={() => { setOpen(true); markAllRead(); }} className="relative h-9 w-9 rounded-md hover:bg-secondary flex items-center justify-center">
        <Bell className="w-4 h-4" />
        {unread > 0 && <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">{unread}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Announcements</DialogTitle></DialogHeader>
          {items.length === 0 ? <p className="text-sm text-muted-foreground">No announcements yet.</p> : (
            <div className="space-y-3">
              {items.map(a => (
                <div key={a.id} className="border border-border rounded-lg p-3 bg-background/40">
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <div>
                      <h4 className="font-semibold text-sm">{a.title}</h4>
                      <p className="text-[11px] text-muted-foreground">{a.courses?.title} • {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</p>
                    </div>
                  </div>
                  {a.image_url && <img src={a.image_url} alt={a.title} className="w-full rounded mt-2 max-h-60 object-cover" loading="lazy" />}
                  {a.body && <p className="text-sm mt-2 whitespace-pre-wrap">{a.body}</p>}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AnnouncementBell;
