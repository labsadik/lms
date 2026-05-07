import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

const AdminPromocodes = () => {
  const [codes, setCodes] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ code: '', discount_type: 'percent', discount_value: 10, max_uses: '', course_id: '', expires_at: '', is_active: true });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [redemptions, setRedemptions] = useState<Record<string, any[]>>({});

  const load = async () => {
    const [{ data: c }, { data: cs }, { data: reds }] = await Promise.all([
      supabase.from('promocodes').select('*, courses(title)').order('created_at', { ascending: false }),
      supabase.from('courses').select('id, title').order('title'),
      supabase.from('promocode_redemptions').select('id, redeemed_at, promocode_id, user_id, courses(title)').order('redeemed_at', { ascending: false }),
    ]);
    setCodes(c || []); setCourses(cs || []);
    // Group redemptions by promocode_id; ignore the FK profile join if it errors (no FK).
    const grouped: Record<string, any[]> = {};
    for (const r of (reds || []) as any[]) {
      (grouped[r.promocode_id] ||= []).push(r);
    }
    // Also enrich with display names directly (the relation hint may not exist, fallback below).
    const userIds = Array.from(new Set((reds || []).map((r: any) => r.user_id)));
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('user_id, display_name').in('user_id', userIds);
      const nameMap: Record<string, string> = {};
      (profs || []).forEach((p: any) => { nameMap[p.user_id] = p.display_name || ''; });
      Object.values(grouped).forEach((arr) => arr.forEach((r: any) => { r._name = nameMap[r.user_id] || 'user'; }));
    }
    setRedemptions(grouped);
  };
  useEffect(() => { load(); }, []);

  const toggleExpand = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpanded(next);
  };

  const create = async () => {
    if (!form.code.trim()) { toast.error('Code required'); return; }
    const payload: any = {
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: parseInt(form.discount_value) || 0,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
      course_id: form.course_id || null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    };
    const { error } = await supabase.from('promocodes').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Code created');
    setOpen(false); load();
  };
  const del = async (id: string) => {
    if (!confirm('Delete code?')) return;
    await supabase.from('promocodes').delete().eq('id', id); load();
  };
  const toggle = async (c: any) => {
    await supabase.from('promocodes').update({ is_active: !c.is_active }).eq('id', c.id); load();
  };

  return (
    <div>
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Promocodes</h1>
        <Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> New code</Button>
      </header>
      <div className="space-y-2">
        {codes.map((c) => {
          const reds = redemptions[c.id] || [];
          const usedCount = reds.length || c.uses_count || 0;
          return (
            <Card key={c.id} className="bg-card border-border">
              <div className="p-3 flex items-center gap-3">
                <button onClick={() => toggleExpand(c.id)} className="text-muted-foreground" aria-label="toggle">
                  {expanded.has(c.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-bold">{c.code}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.discount_type === 'percent' ? `${c.discount_value}% off` : `₹${c.discount_value} off`}
                    {c.courses?.title && ` • ${c.courses.title}`}
                    {' • '}<span className="text-primary font-semibold">Used {usedCount}{c.max_uses ? `/${c.max_uses}` : ''}</span>
                    {c.expires_at && ` • exp ${new Date(c.expires_at).toLocaleDateString()}`}
                    {!c.is_active && ' • DISABLED'}
                  </div>
                </div>
                <Switch checked={c.is_active} onCheckedChange={() => toggle(c)} />
                <Button size="sm" variant="outline" onClick={() => del(c.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
              {expanded.has(c.id) && (
                <div className="border-t border-border p-3 bg-background/30">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Redeemed by ({reds.length})</h4>
                  {reds.length === 0 ? <p className="text-xs text-muted-foreground">No one has used this code yet.</p> : (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {reds.map((r: any) => (
                        <div key={r.id} className="text-xs flex justify-between gap-2 py-1 border-b border-border/30">
                          <span className="truncate">{r._name || 'user'} <span className="text-muted-foreground">· {r.courses?.title || '—'}</span></span>
                          <span className="text-muted-foreground shrink-0">{new Date(r.redeemed_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        {codes.length === 0 && <p className="text-muted-foreground text-sm">No promocodes yet.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card">
          <DialogHeader><DialogTitle>New promocode</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={32} /></div>
            <div><Label>Type</Label>
              <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="percent">Percent (%)</SelectItem><SelectItem value="fixed">Fixed (₹)</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Value</Label><Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: e.target.value })} /></div>
            <div><Label>Max uses (blank = unlimited)</Label><Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} /></div>
            <div><Label>Restrict to course (optional)</Label>
              <Select value={form.course_id || 'all'} onValueChange={(v) => setForm({ ...form, course_id: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="All courses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All courses</SelectItem>
                  {courses.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Expires at (optional)</Label><Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
            <Button onClick={create} className="w-full">Create</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPromocodes;
