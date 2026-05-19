import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, Trash2, ChevronDown, ChevronRight, Gift, Ticket,
  Users, ShoppingBag, Check, X, Phone, UserPlus, Calendar,
  Filter, Search, Copy, ShieldBan, ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */
interface Profile {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
}

interface PromocodeRow {
  id: string;
  code: string;
  course_id: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  max_uses: number | null;
  uses_count: number;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  courses?: { title: string } | null;
}

interface RedemptionRow {
  id: string;
  redeemed_at: string;
  promocode_id: string;
  user_id: string;
  course_id: string;
  courses?: { title: string } | null;
  _profile?: Profile | null;
  _claimed: boolean;
}

interface RewardRedemptionRow {
  id: string;
  user_id: string;
  reward_id: string;
  cost_paid: number;
  code_granted: string | null;
  redeemed_at: string;
  _profile?: Profile | null;
  _reward?: {
    name: string;
    description: string | null;
    reward_type: string;
    reward_value: string | null;
    icon: string | null;
  } | null;
  _claimed: boolean;
  _invalidated: boolean;
  _promocode_id?: string | null;
}

interface ReferralRow {
  id: string;
  referrer_id: string;
  referred_id: string;
  reward_granted: boolean;
  created_at: string;
  _referrer_profile?: Profile | null;
  _referred_profile?: Profile | null;
}

/* ------------------------------------------------------------------ */
/*  HELPERS                                                            */
/* ------------------------------------------------------------------ */
const initials = (n: string | null | undefined) =>
  !n
    ? '?'
    : n
        .split(' ')
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const isExpired = (d: string | null) => (d ? new Date(d) < new Date() : false);

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */
const AdminPromocodes = () => {
  /* ---------- state ---------- */
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('promocodes');

  // promocodes (admin-only)
  const [codes, setCodes] = useState<PromocodeRow[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [redemptions, setRedemptions] = useState<Record<string, RedemptionRow[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    code: '',
    discount_type: 'percent' as 'percent' | 'fixed',
    discount_value: 10,
    max_uses: '',
    course_id: '',
    expires_at: '',
    is_active: true,
  });

  // reward shop
  const [rewardReds, setRewardReds] = useState<RewardRedemptionRow[]>([]);
  const [rwDateFrom, setRwDateFrom] = useState('');
  const [rwDateTo, setRwDateTo] = useState('');
  const [rwUserSearch, setRwUserSearch] = useState('');
  const [rwClaimFilter, setRwClaimFilter] = useState<'all' | 'claimed' | 'unclaimed'>('all');

  // referrals
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [refSearch, setRefSearch] = useState('');
  const [refSort, setRefSort] = useState<'date' | 'count'>('count');
  const [expandedRef, setExpandedRef] = useState<Set<string>>(new Set());

  // profiles cache
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});

  /* ---------- profile loader ---------- */
  const loadProfiles = async (ids: string[]) => {
    if (!ids.length) return {};
    const unique = [...new Set(ids)];
    const { data } = await supabase
      .from('profiles')
      .select('user_id, display_name, avatar_url, phone')
      .in('user_id', unique);
    const m: Record<string, Profile> = {};
    (data || []).forEach((p: any) => (m[p.user_id] = p));
    return m;
  };

  /* ---------- main load ---------- */
  const load = async () => {
    setLoading(true);
    try {
      const { data: cs } = await supabase.from('courses').select('id, title').order('title');
      setCourses(cs || []);

      const { data: allCodes } = await supabase
        .from('promocodes')
        .select('*, courses(title)')
        .order('created_at', { ascending: false });

      const { data: rwReds } = await supabase
        .from('reward_redemptions')
        .select('*')
        .order('redeemed_at', { ascending: false });

      const rwIds = [...new Set((rwReds || []).map((r: any) => r.reward_id))];
      const { data: rwDefs } = rwIds.length
        ? await supabase.from('rewards').select('*').in('id', rwIds)
        : { data: [] };
      const rwMap: Record<string, any> = {};
      (rwDefs || []).forEach((r: any) => (rwMap[r.id] = r));

      const rewardCodeSet = new Set(
        (rwReds || []).map((r: any) => r.code_granted?.toUpperCase()).filter(Boolean)
      );

      const adminCodes = (allCodes || []).filter((c: any) => !rewardCodeSet.has(c.code.toUpperCase()));
      setCodes(adminCodes as PromocodeRow[]);

      const { data: reds } = await supabase
        .from('promocode_redemptions')
        .select('id, redeemed_at, promocode_id, user_id, course_id, courses(title)')
        .order('redeemed_at', { ascending: false });

      const allUserIds = [
        ...(reds || []).map((r: any) => r.user_id),
        ...(rwReds || []).map((r: any) => r.user_id),
      ];
      const profMap = await loadProfiles(allUserIds);
      setProfiles(profMap);

      const { data: enrolls } = await supabase.from('enrollments').select('user_id, course_id');
      const enrollSet = new Set((enrolls || []).map((e: any) => `${e.user_id}_${e.course_id}`));

      const adminCodeIds = new Set(adminCodes.map((c: any) => c.id));
      const grouped: Record<string, RedemptionRow[]> = {};
      (reds || [])
        .filter((r: any) => adminCodeIds.has(r.promocode_id))
        .forEach((r: any) => {
          const row: RedemptionRow = {
            ...r,
            _profile: profMap[r.user_id] || null,
            _claimed: enrollSet.has(`${r.user_id}_${r.course_id}`),
          };
          (grouped[r.promocode_id] ||= []).push(row);
        });
      setRedemptions(grouped);

      const codeLookup: Record<string, any> = {};
      (allCodes || []).forEach((c: any) => {
        codeLookup[c.code.toUpperCase()] = c;
      });

      const enrichedRW: RewardRedemptionRow[] = (rwReds || []).map((rr: any) => {
        const promo = rr.code_granted ? codeLookup[rr.code_granted.toUpperCase()] : null;
        const claimed = promo ? (promo.uses_count || 0) > 0 : false;
        const invalidated = promo ? (!promo.is_active || isExpired(promo.expires_at)) : false;
        return {
          ...rr,
          _profile: profMap[rr.user_id] || null,
          _reward: rwMap[rr.reward_id] || null,
          _claimed: claimed,
          _invalidated: invalidated,
          _promocode_id: promo?.id || null,
        };
      });
      setRewardReds(enrichedRW);

      const { data: refs } = await supabase.from('referrals').select('*').order('created_at', { ascending: false });
      const refUserIds = [
        ...(refs || []).map((r: any) => r.referrer_id),
        ...(refs || []).map((r: any) => r.referred_id),
      ];
      const refProfMap = await loadProfiles(refUserIds);
      const mergedProfMap = { ...profMap, ...refProfMap };
      setProfiles(mergedProfMap);

      const enrichedRefs: ReferralRow[] = (refs || []).map((r: any) => ({
        ...r,
        _referrer_profile: mergedProfMap[r.referrer_id] || null,
        _referred_profile: mergedProfMap[r.referred_id] || null,
      }));
      setReferrals(enrichedRefs);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load data');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /* ---------- promocode actions ---------- */
  const toggleExpand = (id: string) => {
    const s = new Set(expanded);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpanded(s);
  };

  const toggleRefExpand = (id: string) => {
    const s = new Set(expandedRef);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpandedRef(s);
  };

  const createCode = async () => {
    if (!form.code.trim()) { toast.error('Code required'); return; }
    const { error } = await supabase.from('promocodes').insert({
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: parseInt(String(form.discount_value)) || 0,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
      course_id: form.course_id || null,
      expires_at: form.expires_at || null,
      is_active: form.is_active,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Promocode created');
    setOpenCreate(false);
    setForm({ code: '', discount_type: 'percent', discount_value: 10, max_uses: '', course_id: '', expires_at: '', is_active: true });
    load();
  };

  const deleteCode = async (id: string) => {
    if (!confirm('Delete this promocode?')) return;
    await supabase.from('promocodes').delete().eq('id', id);
    load();
  };

  const toggleActive = async (c: PromocodeRow) => {
    await supabase.from('promocodes').update({ is_active: !c.is_active }).eq('id', c.id);
    load();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Copied!');
  };

  /* ---------- REWARD SHOP TOGGLE: Invalidate / Permanent ---------- */
  const toggleRewardCodeValidity = async (promoId: string, invalidate: boolean) => {
    if (!promoId) return;
    const { error } = await supabase
      .from('promocodes')
      .update({
        // If ON (invalidate): set expiry to now and deactivate
        // If OFF (permanent): clear expiry and activate
        expires_at: invalidate ? new Date().toISOString() : null,
        is_active: !invalidate,
      })
      .eq('id', promoId);
      
    if (error) {
      toast.error('Failed to update code status');
    } else {
      toast.success(invalidate ? 'Code invalidated permanently' : 'Code set to permanent active');
      load();
    }
  };

  /* ---------- filtered reward redemptions ---------- */
  const filteredRW = useMemo(() => {
    let list = rewardReds;
    if (rwDateFrom) {
      const from = new Date(rwDateFrom); from.setHours(0, 0, 0, 0);
      list = list.filter((r) => new Date(r.redeemed_at) >= from);
    }
    if (rwDateTo) {
      const to = new Date(rwDateTo); to.setHours(23, 59, 59, 999);
      list = list.filter((r) => new Date(r.redeemed_at) <= to);
    }
    if (rwUserSearch.trim()) {
      const q = rwUserSearch.toLowerCase();
      list = list.filter(
        (r) =>
          r._profile?.display_name?.toLowerCase().includes(q) ||
          r._profile?.phone?.includes(q) ||
          r.code_granted?.toLowerCase().includes(q)
      );
    }
    if (rwClaimFilter === 'claimed') list = list.filter((r) => r._claimed);
    if (rwClaimFilter === 'unclaimed') list = list.filter((r) => !r._claimed);
    return list;
  }, [rewardReds, rwDateFrom, rwDateTo, rwUserSearch, rwClaimFilter]);

  /* ---------- referral aggregation ---------- */
  const referralStats = useMemo(() => {
    const map: Record<string, { profile: Profile | null; referred: ReferralRow[]; granted: number }> = {};
    referrals.forEach((r) => {
      if (!map[r.referrer_id]) {
        map[r.referrer_id] = { profile: r._referrer_profile || null, referred: [], granted: 0 };
      }
      map[r.referrer_id].referred.push(r);
      if (r.reward_granted) map[r.referrer_id].granted++;
    });

    let arr = Object.entries(map).map(([uid, d]) => ({
      referrer_id: uid,
      ...d,
      total: d.referred.length,
    }));

    if (refSearch.trim()) {
      const q = refSearch.toLowerCase();
      arr = arr.filter(
        (d) =>
          d.profile?.display_name?.toLowerCase().includes(q) ||
          d.profile?.phone?.includes(q)
      );
    }

    if (refSort === 'count') arr.sort((a, b) => b.total - a.total);
    else arr.sort((a, b) => new Date(b.referred[0]?.created_at || 0).getTime() - new Date(a.referred[0]?.created_at || 0).getTime());

    return arr;
  }, [referrals, refSearch, refSort, profiles]);

  /* ------------------------------------------------------------------ */
  /*  RENDER                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Promocodes & Rewards</h1>
          <p className="text-sm text-muted-foreground">Manage codes, reward shop, and referrals</p>
        </div>
        <Button onClick={() => setOpenCreate(true)}>
          <Plus className="w-4 h-4 mr-2" /> New Promocode
        </Button>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full max-w-lg grid-cols-3">
          <TabsTrigger value="promocodes" className="gap-1.5"><Ticket className="w-4 h-4" /> Promocodes</TabsTrigger>
          <TabsTrigger value="rewards" className="gap-1.5"><ShoppingBag className="w-4 h-4" /> Reward Shop</TabsTrigger>
          <TabsTrigger value="referrals" className="gap-1.5"><UserPlus className="w-4 h-4" /> Referrals</TabsTrigger>
        </TabsList>

        {/* ============================================================ */}
        {/*  TAB 1 — ADMIN PROMOCODES                                    */}
        {/* ============================================================ */}
        <TabsContent value="promocodes" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>
          ) : codes.length === 0 ? (
            <Card className="p-10 text-center"><Ticket className="w-12 h-12 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">No admin promocodes yet.</p></Card>
          ) : (
            <div className="space-y-2">
              {codes.map((c) => {
                const reds = redemptions[c.id] || [];
                const exp = isExpired(c.expires_at);
                const full = c.max_uses ? c.uses_count >= c.max_uses : false;
                const borderCls = !c.is_active ? 'border-destructive/40 bg-destructive/5' : exp || full ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-border';

                return (
                  <Card key={c.id} className={borderCls}>
                    <div className="p-3 flex items-center gap-3">
                      <button onClick={() => toggleExpand(c.id)} className="text-muted-foreground hover:text-foreground" aria-label="toggle">
                        {expanded.has(c.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button onClick={() => copyCode(c.code)} className="font-mono font-bold text-lg hover:text-primary transition-colors" title="Click to copy">{c.code}</button>
                          {!c.is_active && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">OFF</Badge>}
                          {exp && c.is_active && <Badge variant="outline" className="border-yellow-500/50 text-yellow-500 text-[10px] px-1.5 py-0">EXPIRED</Badge>}
                          {full && c.is_active && !exp && <Badge variant="outline" className="border-orange-500/50 text-orange-500 text-[10px] px-1.5 py-0">FULL</Badge>}
                        </div>
                        <div className="text-sm text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                          <span className="font-medium text-foreground">{c.discount_type === 'percent' ? `${c.discount_value}%` : `₹${c.discount_value}`} off</span>
                          {c.courses?.title && <span>📚 {c.courses.title}</span>}
                          <span>Used <span className="text-primary font-semibold">{c.uses_count}</span>{c.max_uses ? ` / ${c.max_uses}` : ' (unlimited)'}</span>
                          {c.expires_at && <span>Exp {new Date(c.expires_at).toLocaleDateString('en-IN')}</span>}
                        </div>
                      </div>
                      <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
                      <Button size="icon" variant="outline" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteCode(c.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>

                    {expanded.has(c.id) && (
                      <div className="border-t border-border p-3 bg-background/40">
                        <h4 className="text-[11px] font-bold uppercase text-muted-foreground mb-2 flex items-center gap-1.5"><Users className="w-3 h-3" /> Redeemed by ({reds.length})</h4>
                        {!reds.length ? <p className="text-xs text-muted-foreground py-1">No redemptions yet.</p> : (
                          <div className="space-y-1.5 max-h-80 overflow-y-auto">
                            {reds.map((r) => (
                              <div key={r.id} className={`flex items-center gap-2.5 p-2 rounded-lg border ${r._claimed ? 'border-green-500/30 bg-green-500/5' : 'border-border'}`}>
                                <Avatar className="h-8 w-8 shrink-0"><AvatarImage src={r._profile?.avatar_url || undefined} /><AvatarFallback className="text-[10px] bg-primary/15">{initials(r._profile?.display_name)}</AvatarFallback></Avatar>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium truncate">{r._profile?.display_name || 'User'}</span>
                                    {r._claimed ? <Badge variant="outline" className="border-green-500/40 text-green-500 text-[10px] gap-0.5 px-1.5 py-0"><Check className="w-2.5 h-2.5" /> Claimed</Badge> : <Badge variant="outline" className="border-yellow-500/40 text-yellow-600 text-[10px] gap-0.5 px-1.5 py-0"><X className="w-2.5 h-2.5" /> Not Claimed</Badge>}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground flex gap-3 mt-0.5">
                                    {r._profile?.phone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{r._profile.phone}</span>}
                                    <span>📚 {r.courses?.title || '—'}</span>
                                    <span>{fmtDate(r.redeemed_at)}</span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/*  TAB 2 — REWARD SHOP (User-generated + Toggle)              */}
        {/* ============================================================ */}
        <TabsContent value="rewards" className="mt-4 space-y-4">
          <Card className="p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs mb-1 block">Search user / code</Label>
                <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={rwUserSearch} onChange={(e) => setRwUserSearch(e.target.value)} placeholder="Name, phone, or code..." className="pl-8 h-9" /></div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">From</Label>
                <div className="relative"><Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="date" value={rwDateFrom} onChange={(e) => setRwDateFrom(e.target.value)} className="pl-8 h-9" /></div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">To</Label>
                <div className="relative"><Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input type="date" value={rwDateTo} onChange={(e) => setRwDateTo(e.target.value)} className="pl-8 h-9" /></div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Status</Label>
                <Select value={rwClaimFilter} onValueChange={(v) => setRwClaimFilter(v as any)}><SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="claimed">Claimed</SelectItem><SelectItem value="unclaimed">Not Claimed</SelectItem></SelectContent></Select>
              </div>
              <Button variant="ghost" size="sm" className="h-9" onClick={() => { setRwDateFrom(''); setRwDateTo(''); setRwUserSearch(''); setRwClaimFilter('all'); }}><Filter className="w-4 h-4 mr-1" /> Reset</Button>
            </div>
          </Card>

          {loading ? (
            <div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>
          ) : filteredRW.length === 0 ? (
            <Card className="p-10 text-center"><ShoppingBag className="w-12 h-12 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">No reward redemptions found.</p></Card>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Showing {filteredRW.length} of {rewardReds.length} redemptions</p>
              <div className="space-y-2">
                {filteredRW.map((rr) => (
                  <Card key={rr.id} className={`border ${rr._invalidated ? 'border-destructive/30 bg-destructive/5' : rr._claimed ? 'border-green-500/30 bg-green-500/5' : 'border-yellow-500/30 bg-yellow-500/5'}`}>
                    <div className="p-3 flex items-start gap-3">
                      <Avatar className="h-10 w-10 shrink-0"><AvatarImage src={rr._profile?.avatar_url || undefined} /><AvatarFallback className="text-xs bg-primary/15">{initials(rr._profile?.display_name)}</AvatarFallback></Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium">{rr._profile?.display_name || 'Unknown'}</span>
                          {rr._invalidated ? (
                            <Badge variant="destructive" className="text-[10px] gap-0.5 px-1.5 py-0"><ShieldBan className="w-3 h-3" /> Invalidated</Badge>
                          ) : rr._claimed ? (
                            <Badge variant="outline" className="border-green-500/40 text-green-500 text-[10px] gap-0.5 px-1.5 py-0"><Check className="w-2.5 h-2.5" /> Claimed</Badge>
                          ) : (
                            <Badge variant="outline" className="border-yellow-500/40 text-yellow-600 text-[10px] gap-0.5 px-1.5 py-0"><X className="w-2.5 h-2.5" /> Not Claimed</Badge>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                          {rr._profile?.phone && <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" />{rr._profile.phone}</span>}
                          <span>{rr._reward?.icon || '🎁'} {rr._reward?.name || 'Reward'}</span>
                          <span>{rr.cost_paid} coins</span>
                        </div>

                        {rr.code_granted && (
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-muted-foreground">Code:</span>
                            <button onClick={() => copyCode(rr.code_granted!)} className="px-2 py-0.5 bg-muted rounded text-xs font-mono font-bold hover:bg-muted/80 transition-colors flex items-center gap-1">{rr.code_granted} <Copy className="w-3 h-3 text-muted-foreground" /></button>
                            {rr._reward?.reward_value && <span className="text-xs text-primary">({rr._reward.reward_value}% off)</span>}
                          </div>
                        )}

                        {/* TOGGLE: Make Expire / Permanent Active */}
                        {rr._promocode_id && (
                          <div className="mt-2 p-2 bg-background/50 rounded-md border border-border/50">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Switch 
                                  checked={rr._invalidated} 
                                  onCheckedChange={(val) => toggleRewardCodeValidity(rr._promocode_id!, val)}
                                />
                                <Label className="text-xs font-medium">
                                  {rr._invalidated ? (
                                    <span className="text-destructive flex items-center gap-1"><ShieldBan className="w-3 h-3" /> Expired / Invalid</span>
                                  ) : (
                                    <span className="text-green-500 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Active (Permanent)</span>
                                  )}
                                </Label>
                              </div>
                              <span className="text-[10px] text-muted-foreground hidden sm:block">Toggle to invalidate</span>
                            </div>
                          </div>
                        )}

                        <div className="text-[11px] text-muted-foreground mt-1">{fmtDate(rr.redeemed_at)}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/*  TAB 3 — REFERRALS (Full Profile Details)                    */}
        {/* ============================================================ */}
        <TabsContent value="referrals" className="mt-4 space-y-4">
          <Card className="p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs mb-1 block">Search referrer</Label>
                <div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={refSearch} onChange={(e) => setRefSearch(e.target.value)} placeholder="Name or phone..." className="pl-8 h-9" /></div>
              </div>
              <div>
                <Label className="text-xs mb-1 block">Sort by</Label>
                <Select value={refSort} onValueChange={(v) => setRefSort(v as any)}><SelectTrigger className="h-9 w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="count">Most Referrals</SelectItem><SelectItem value="date">Newest First</SelectItem></SelectContent></Select>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-3 text-center"><div className="text-2xl font-bold">{referralStats.length}</div><div className="text-xs text-muted-foreground">Total Referrers</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-bold">{referrals.length}</div><div className="text-xs text-muted-foreground">Total Referred Users</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-bold text-green-500">{referrals.filter((r) => r.reward_granted).length}</div><div className="text-xs text-muted-foreground">Rewards Granted</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-bold text-yellow-500">{referrals.filter((r) => !r.reward_granted).length}</div><div className="text-xs text-muted-foreground">Pending Rewards</div></Card>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>
          ) : referralStats.length === 0 ? (
            <Card className="p-10 text-center"><UserPlus className="w-12 h-12 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">No referrals yet.</p></Card>
          ) : (
            <div className="space-y-3">
              {referralStats.map((stat) => (
                <Card key={stat.referrer_id} className="border-border overflow-hidden">
                  {/* Referrer Header (Full Details) */}
                  <button onClick={() => toggleRefExpand(stat.referrer_id)} className="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left">
                    <Avatar className="h-12 w-12 shrink-0 border-2 border-primary/20">
                      <AvatarImage src={stat.profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-sm bg-primary/15">{initials(stat.profile?.display_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-semibold">{stat.profile?.display_name || 'Unknown User'}</span>
                        <Badge variant="secondary" className="gap-1"><Users className="w-3 h-3" /> {stat.total} Referrals</Badge>
                        <Badge variant="outline" className="border-green-500/40 text-green-500 gap-1"><Check className="w-3 h-3" /> {stat.granted} Rewarded</Badge>
                      </div>
                      {stat.profile?.phone && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1"><Phone className="w-3.5 h-3.5" /> {stat.profile.phone}</div>
                      )}
                    </div>
                    {expandedRef.has(stat.referrer_id) ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </button>

                  {/* Referred Users List (Full Details) */}
                  {expandedRef.has(stat.referrer_id) && (
                    <div className="border-t border-border bg-muted/20 p-3 space-y-2">
                      <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5 mb-3">
                        <UserPlus className="w-3 h-3" /> Users who used {stat.profile?.display_name || 'User'}&apos;s referral ({stat.total})
                      </h4>
                      {stat.referred.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2 text-center">No referred users yet.</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {stat.referred.map((r) => (
                            <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background">
                              <Avatar className="h-9 w-9 shrink-0">
                                <AvatarImage src={r._referred_profile?.avatar_url || undefined} />
                                <AvatarFallback className="text-[10px] bg-muted">{initials(r._referred_profile?.display_name)}</AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{r._referred_profile?.display_name || 'User'}</span>
                                  {r.reward_granted ? (
                                    <Badge variant="outline" className="border-green-500/40 text-green-500 text-[10px] gap-0.5 px-1.5 py-0"><Check className="w-2.5 h-2.5" /> Rewarded</Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-yellow-500/40 text-yellow-600 text-[10px] gap-0.5 px-1.5 py-0"><X className="w-2.5 h-2.5" /> Pending</Badge>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground flex gap-2 mt-0.5">
                                  {r._referred_profile?.phone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{r._referred_profile.phone}</span>}
                                  <span>{fmtDateShort(r.created_at)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ============================================================ */}
      {/*  CREATE DIALOG                                                */}
      {/* ============================================================ */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="bg-card max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5" /> New Promocode</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Code *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SUMMER2024" maxLength={32} className="font-mono" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v as 'percent' | 'fixed' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="percent">Percent (%)</SelectItem><SelectItem value="fixed">Fixed (₹)</SelectItem></SelectContent></Select></div>
              <div>
                <Label>Value</Label>
                {/* FIX APPLIED BELOW: Added Number() conversion */}
                <Input 
                  type="number" 
                  value={form.discount_value} 
                  onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} 
                  min={0} 
                />
              </div>
            </div>
            <div><Label>Max uses (blank = unlimited)</Label><Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} placeholder="Unlimited" min={1} /></div>
            <div><Label>Restrict to course (optional)</Label><Select value={form.course_id || 'all'} onValueChange={(v) => setForm({ ...form, course_id: v === 'all' ? '' : v })}><SelectTrigger><SelectValue placeholder="All courses" /></SelectTrigger><SelectContent><SelectItem value="all">All Courses</SelectItem>{courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Expires at (optional)</Label><Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
            <Button onClick={createCode} className="w-full">Create Promocode</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPromocodes;