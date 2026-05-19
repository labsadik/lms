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
  Plus, Trash2, Gift, Ticket, Users, ShoppingBag,
  Check, X, Phone, UserPlus, Calendar, Filter,
  Search, Copy, ShieldBan, ShieldCheck, Clock,
  ChevronRight, ChevronDown, AlertTriangle, Info,
  IndianRupee, Brain, AlertCircle, ArrowRight,
  Lightbulb, BookOpen, Zap, Eye, EyeOff, Target
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

interface PromoRedemptionDetail {
  id: string;
  user_id: string;
  course_id: string;
  promocode_id: string;
  redeemed_at: string;
  promocodes: { discount_type: string; discount_value: number; code: string } | null;
  courses: { price_inr: number; title: string } | null;
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
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const fmtDateShort = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

const isExpired = (d: string | null) => (d ? new Date(d) < new Date() : false);

const fmtINR = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

/* ------------------------------------------------------------------ */
/*  COMPONENT                                                          */
/* ------------------------------------------------------------------ */
const AdminPromocodes = () => {
  /* ---------- state ---------- */
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('promocodes');
  const [showGuide, setShowGuide] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // promocodes (admin-only)
  const [codes, setCodes] = useState<PromocodeRow[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string; price_inr: number }[]>([]);
  const [promoRedemptions, setPromoRedemptions] = useState<PromoRedemptionDetail[]>([]);
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
      const { data: cs } = await supabase.from('courses').select('id, title, price_inr').order('title');
      setCourses(cs || []);

      const { data: allCodes } = await supabase
        .from('promocodes')
        .select('*, courses(title)')
        .order('created_at', { ascending: false });

      let prData: PromoRedemptionDetail[] = [];
      try {
        const { data: pr } = await supabase
          .from('promocode_redemptions')
          .select('id, user_id, course_id, promocode_id, redeemed_at, promocodes(discount_type, discount_value, code), courses(price_inr, title)')
          .order('redeemed_at', { ascending: false });
        prData = (pr || []) as PromoRedemptionDetail[];
      } catch (e) {
        console.warn('Could not load promo redemptions for stats', e);
      }

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

      const adminPromoIds = new Set(adminCodes.map((c: any) => c.id));
      const filteredPromoReds = prData.filter(r => adminPromoIds.has(r.promocode_id));
      setPromoRedemptions(filteredPromoReds);

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
          _profile: null,
          _reward: rwMap[rr.reward_id] || null,
          _claimed: claimed,
          _invalidated: invalidated,
          _promocode_id: promo?.id || null,
        };
      });

      const allUserIds = [...(rwReds || []).map((r: any) => r.user_id)];
      const profMap = await loadProfiles(allUserIds);
      const finalRW = enrichedRW.map(r => ({ ...r, _profile: profMap[r.user_id] || null }));
      setRewardReds(finalRW);
      setProfiles(profMap);

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

      setCodes(adminCodes as PromocodeRow[]);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load data');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  /* ---------- computed: promo stats ---------- */
  const promoStats = useMemo(() => {
    const totalCodes = codes.length;
    const totalActive = codes.filter(c => c.is_active && !isExpired(c.expires_at) && !(c.max_uses ? c.uses_count >= c.max_uses : false)).length;
    const totalRedemptions = promoRedemptions.length;

    let totalPerceivedDiscount = 0;
    let totalTheoreticalRevenue = 0;

    promoRedemptions.forEach(r => {
      if (!r.courses || !r.promocodes) return;
      const price = r.courses.price_inr || 0;
      let discount = 0;
      if (r.promocodes.discount_type === 'percent') {
        discount = Math.round(price * r.promocodes.discount_value / 100);
      } else {
        discount = Math.min(r.promocodes.discount_value, price);
      }
      totalPerceivedDiscount += discount;
      totalTheoreticalRevenue += Math.max(0, price - discount);
    });

    return { totalCodes, totalActive, totalRedemptions, totalPerceivedDiscount, totalTheoreticalRevenue };
  }, [codes, promoRedemptions]);

  /* ---------- computed: create dialog pricing ---------- */
  const createDialogPricing = useMemo(() => {
    const selectedCourse = form.course_id ? courses.find(c => c.id === form.course_id) : null;
    const coursePrice = selectedCourse?.price_inr || 0;
    let discountAmount = 0;
    if (form.discount_type === 'percent') {
      discountAmount = Math.round(coursePrice * form.discount_value / 100);
    } else {
      discountAmount = Math.min(form.discount_value, coursePrice);
    }
    const finalPrice = Math.max(0, coursePrice - discountAmount);

    let status: 'safe' | 'warning' | 'danger' | 'free' | 'none' = 'none';
    let message = '';
    if (!form.course_id) {
      status = 'none';
      message = '';
    } else if (coursePrice === 0) {
      status = 'free';
      message = 'This is a free course. Promocode will have NO effect on price.';
    } else if (finalPrice === 0) {
      status = 'danger';
      message = 'User pays ₹0! You get absolutely NO revenue. Is this intentional?';
    } else if (discountAmount / coursePrice > 0.7) {
      status = 'warning';
      message = `Very high discount! User pays only ${fmtINR(finalPrice)} out of ${fmtINR(coursePrice)}. Make sure this is still profitable.`;
    } else {
      status = 'safe';
      message = `User pays ${fmtINR(finalPrice)}. This is within safe range.`;
    }

    return { selectedCourse, coursePrice, discountAmount, finalPrice, status, message };
  }, [form.course_id, form.discount_type, form.discount_value, courses]);

  /* ---------- actions ---------- */
  const toggleRefExpand = (id: string) => {
    const s = new Set(expandedRef);
    s.has(id) ? s.delete(id) : s.add(id);
    setExpandedRef(s);
  };

  const createCode = async () => {
    if (!form.code.trim()) { toast.error('Code required'); return; }
    if (createDialogPricing.status === 'danger') {
      if (!confirm('This code gives 100% discount (user pays ₹0). Are you sure?')) return;
    }
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
    if (!confirm('Delete this promocode permanently?')) return;
    await supabase.from('promocodes').delete().eq('id', id);
    toast.success('Promocode deleted');
    load();
  };

  const toggleActive = async (c: PromocodeRow) => {
    await supabase.from('promocodes').update({ is_active: !c.is_active }).eq('id', c.id);
    toast.success(c.is_active ? 'Promocode deactivated' : 'Promocode activated');
    load();
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Copied!');
  };

  const toggleRewardCodeValidity = async (promoId: string, invalidate: boolean) => {
    if (!promoId) return;
    const { error } = await supabase
      .from('promocodes')
      .update({
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
      referrer_id: uid, ...d, total: d.referred.length,
    }));
    if (refSearch.trim()) {
      const q = refSearch.toLowerCase();
      arr = arr.filter((d) => d.profile?.display_name?.toLowerCase().includes(q) || d.profile?.phone?.includes(q));
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

      {/* ============================================================== */}
      {/*  ⚠️  PSYCHOLOGY BANNER                                         */}
      {/* ============================================================== */}
      {!bannerDismissed && (
        <Card className="border-amber-400/60 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 overflow-hidden">
          <div className="p-4 flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-full bg-amber-400/20 dark:bg-amber-500/20 flex items-center justify-center">
              <span className="text-2xl font-black text-amber-600 dark:text-amber-400">!</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-amber-900 dark:text-amber-200">
                Promocode Discount = Psychological Game, NOT Real Discount
              </h3>
              <p className="text-sm text-amber-800/80 dark:text-amber-300/70 mt-1 leading-relaxed">
                Users <strong>THINK</strong> they are saving money with a promo code. But you already set the course price to absorb that &quot;discount&quot;.
                Your actual revenue is what they pay after the code. <strong>Ensure your course pricing is correct before giving codes</strong> —
                if price is too low, you may incur a <span className="text-red-600 font-semibold">LOSS</span>.
                If pricing is perfect, it&apos;s pure <span className="text-green-600 font-semibold">PROFIT</span>.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white border-0 shadow-sm"
                  onClick={() => setShowGuide(true)}
                >
                  <BookOpen className="w-4 h-4 mr-1.5" />
                  Read Full Guide
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-amber-600 hover:text-amber-800 dark:text-amber-400"
                  onClick={() => setBannerDismissed(true)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* ============================================================== */}
      {/*  📊  STATS CARDS                                               */}
      {/* ============================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="p-3.5 text-center">
          <Ticket className="w-5 h-5 mx-auto mb-1.5 text-blue-500" />
          <div className="text-2xl font-bold">{promoStats.totalCodes}</div>
          <div className="text-[11px] text-muted-foreground font-medium">Total Codes</div>
        </Card>
        <Card className="p-3.5 text-center">
          <Zap className="w-5 h-5 mx-auto mb-1.5 text-green-500" />
          <div className="text-2xl font-bold text-green-600">{promoStats.totalActive}</div>
          <div className="text-[11px] text-muted-foreground font-medium">Active Codes</div>
        </Card>
        <Card className="p-3.5 text-center">
          <Users className="w-5 h-5 mx-auto mb-1.5 text-purple-500" />
          <div className="text-2xl font-bold">{promoStats.totalRedemptions}</div>
          <div className="text-[11px] text-muted-foreground font-medium">Times Used</div>
        </Card>
        <Card className="p-3.5 text-center">
          <Brain className="w-5 h-5 mx-auto mb-1.5 text-orange-500" />
          <div className="text-2xl font-bold text-orange-600">{fmtINR(promoStats.totalPerceivedDiscount)}</div>
          <div className="text-[11px] text-muted-foreground font-medium">&quot;Total&quot; Used</div>
        </Card>
        <Card className="p-3.5 text-center col-span-2 sm:col-span-1">
          <IndianRupee className="w-5 h-5 mx-auto mb-1.5 text-emerald-500" />
          <div className="text-2xl font-bold text-emerald-600">{fmtINR(promoStats.totalTheoreticalRevenue)}</div>
          <div className="text-[11px] text-muted-foreground font-medium">Actual Revenue</div>
        </Card>
      </div>

      {/* ============================================================== */}
      {/*  HEADER                                                        */}
      {/* ============================================================== */}
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Promocodes & Rewards</h1>
          <p className="text-sm text-muted-foreground">Manage codes, reward shop, and referrals</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowGuide(true)}>
            <BookOpen className="w-4 h-4 mr-1.5" /> Guide
          </Button>
          <Button onClick={() => setOpenCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> New Promocode
          </Button>
        </div>
      </header>

      {/* ============================================================== */}
      {/*  TABS                                                          */}
      {/* ============================================================== */}
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
            <div className="space-y-3">
              {codes.map((c) => {
                const exp = isExpired(c.expires_at);
                const full = c.max_uses ? c.uses_count >= c.max_uses : false;

                let borderClass = 'border-border';
                if (!c.is_active) borderClass = 'border-destructive/30 bg-destructive/5';
                else if (exp) borderClass = 'border-yellow-500/30 bg-yellow-500/5';
                else if (full) borderClass = 'border-orange-500/30 bg-orange-500/5';
                else borderClass = 'border-green-500/20 bg-green-500/5';

                return (
                  <Card key={c.id} className={`${borderClass} transition-all hover:shadow-md`}>
                    <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">

                      {/* Left: Info */}
                      <div className="flex-1 min-w-0 space-y-2.5">
                        <div className="flex items-center gap-3 flex-wrap">
                          <button onClick={() => copyCode(c.code)} className="font-mono text-xl font-bold tracking-tight hover:text-primary transition-colors flex items-center gap-2">
                            {c.code}
                            <Copy className="w-4 h-4 opacity-50 hover:opacity-100" />
                          </button>
                          <div className="flex gap-1.5">
                            {!c.is_active && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-5 gap-0.5"><EyeOff className="w-3 h-3" /> INACTIVE</Badge>}
                            {exp && c.is_active && <Badge variant="outline" className="border-yellow-600 text-yellow-700 bg-yellow-50 dark:bg-yellow-950/40 text-[10px] px-1.5 py-0 h-5">EXPIRED</Badge>}
                            {full && c.is_active && !exp && <Badge variant="outline" className="border-orange-600 text-orange-700 bg-orange-50 dark:bg-orange-950/40 text-[10px] px-1.5 py-0 h-5">FULL</Badge>}
                            {c.is_active && !exp && !full && <Badge variant="default" className="bg-green-600 hover:bg-green-700 text-[10px] px-1.5 py-0 h-5 gap-0.5"><Zap className="w-3 h-3" /> ACTIVE</Badge>}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-sm">
                          <span className="w-2 h-2 rounded-full bg-primary"></span>
                          <span className="font-semibold text-foreground">
                            {c.discount_type === 'percent' ? `${c.discount_value}% OFF` : `${fmtINR(c.discount_value)} OFF`}
                          </span>
                        </div>

                        {c.courses?.title && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground truncate">
                            <Ticket className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">Course: {c.courses.title}</span>
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Users className="w-3.5 h-3.5 shrink-0" />
                          <span>Used {c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ''} times</span>
                          {c.max_uses && (
                            <div className="flex-1 max-w-[120px] h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${c.uses_count >= c.max_uses ? 'bg-red-500' : 'bg-primary'}`}
                                style={{ width: `${Math.min(100, (c.uses_count / c.max_uses) * 100)}%` }}
                              />
                            </div>
                          )}
                          {c.max_uses && (
                            <span className="text-xs ml-1">({Math.round((c.uses_count / c.max_uses) * 100)}%)</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span className={exp ? 'text-destructive font-medium' : ''}>
                            {c.expires_at
                              ? (exp ? 'Expired on ' : 'Expires on ') + fmtDate(c.expires_at)
                              : 'No Expiry'}
                          </span>
                        </div>
                      </div>

                      {/* Right: Toggle + Delete */}
                      <div className="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50 shrink-0">
                        <div className="flex items-center gap-2.5 bg-background/80 dark:bg-background/50 px-3 py-2 rounded-lg border border-border">
                          {c.is_active ? (
                            <ShieldCheck className="w-4 h-4 text-green-500" />
                          ) : (
                            <ShieldBan className="w-4 h-4 text-destructive" />
                          )}
                          <div className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground leading-none">Status</span>
                            <span className={`text-xs font-bold leading-tight mt-0.5 ${c.is_active ? 'text-green-600' : 'text-destructive'}`}>
                              {c.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </div>
                          <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} className="ml-1" />
                        </div>
                        <Button size="icon" variant="outline" className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteCode(c.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ============================================================ */}
        {/*  TAB 2 — REWARD SHOP                                          */}
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
                        {rr._promocode_id && (
                          <div className="mt-2 p-2 bg-background/50 rounded-md border border-border/50">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Switch checked={rr._invalidated} onCheckedChange={(val) => toggleRewardCodeValidity(rr._promocode_id!, val)} />
                                <Label className="text-xs font-medium">
                                  {rr._invalidated ? (
                                    <span className="text-destructive flex items-center gap-1"><ShieldBan className="w-3 h-3" /> Inactive / Invalid</span>
                                  ) : (
                                    <span className="text-green-500 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Active</span>
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
        {/*  TAB 3 — REFERRALS                                            */}
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
            <Card className="p-3 text-center"><div className="text-2xl font-bold">{referrals.length}</div><div className="text-xs text-muted-foreground">Total Referred</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-bold text-green-500">{referrals.filter((r) => r.reward_granted).length}</div><div className="text-xs text-muted-foreground">Rewards Granted</div></Card>
            <Card className="p-3 text-center"><div className="text-2xl font-bold text-yellow-500">{referrals.filter((r) => !r.reward_granted).length}</div><div className="text-xs text-muted-foreground">Pending</div></Card>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>
          ) : referralStats.length === 0 ? (
            <Card className="p-10 text-center"><UserPlus className="w-12 h-12 mx-auto mb-3 text-muted-foreground" /><p className="text-muted-foreground">No referrals yet.</p></Card>
          ) : (
            <div className="space-y-3">
              {referralStats.map((stat) => (
                <Card key={stat.referrer_id} className="border-border overflow-hidden">
                  <button onClick={() => toggleRefExpand(stat.referrer_id)} className="w-full p-4 flex items-center gap-4 hover:bg-muted/30 transition-colors text-left">
                    <Avatar className="h-12 w-12 shrink-0 border-2 border-primary/20">
                      <AvatarImage src={stat.profile?.avatar_url || undefined} />
                      <AvatarFallback className="text-sm bg-primary/15">{initials(stat.profile?.display_name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-lg font-semibold">{stat.profile?.display_name || 'Unknown User'}</span>
                        <Badge variant="secondary" className="gap-1"><Users className="w-3 h-3" /> {stat.total}</Badge>
                        <Badge variant="outline" className="border-green-500/40 text-green-500 gap-1"><Check className="w-3 h-3" /> {stat.granted}</Badge>
                      </div>
                      {stat.profile?.phone && (
                        <div className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1"><Phone className="w-3.5 h-3.5" /> {stat.profile.phone}</div>
                      )}
                    </div>
                    {expandedRef.has(stat.referrer_id) ? <ChevronDown className="w-5 h-5 text-muted-foreground" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                  </button>

                  {expandedRef.has(stat.referrer_id) && (
                    <div className="border-t border-border bg-muted/20 p-3 space-y-2">
                      <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-1.5 mb-3">
                        <UserPlus className="w-3 h-3" /> Referred by {stat.profile?.display_name || 'User'} ({stat.total})
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

      {/* ============================================================== */}
      {/*  CREATE DIALOG — With Pricing Check                            */}
      {/* ============================================================== */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="bg-card max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Plus className="w-5 h-5" /> New Promocode</DialogTitle>
          </DialogHeader>

          <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2">
            <Brain className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
              Remember: This discount is <strong>psychological</strong>. Set the course price HIGH ENOUGH to absorb this discount and still earn your target profit.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label>Code *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SUMMER2024" maxLength={32} className="font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v as 'percent' | 'fixed' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percent (%)</SelectItem>
                    <SelectItem value="fixed">Fixed (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Value</Label>
                <Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) })} min={0} />
              </div>
            </div>
            <div>
              <Label>Max uses (blank = unlimited)</Label>
              <Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} placeholder="Unlimited" min={1} />
            </div>
            <div>
              <Label>Restrict to course (optional)</Label>
              <Select value={form.course_id || 'all'} onValueChange={(v) => setForm({ ...form, course_id: v === 'all' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="All courses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courses</SelectItem>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.title} — {fmtINR(c.price_inr)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {createDialogPricing.status !== 'none' && (
              <div className={`p-3 rounded-lg border space-y-2 ${
                createDialogPricing.status === 'danger' ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800' :
                createDialogPricing.status === 'warning' ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' :
                createDialogPricing.status === 'free' ? 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800' :
                'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
              }`}>
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  {createDialogPricing.status === 'danger' ? <AlertTriangle className="w-4 h-4 text-red-600" /> :
                   createDialogPricing.status === 'warning' ? <AlertCircle className="w-4 h-4 text-amber-600" /> :
                   createDialogPricing.status === 'free' ? <Info className="w-4 h-4 text-gray-500" /> :
                   <Check className="w-4 h-4 text-green-600" />}
                  <span className={
                    createDialogPricing.status === 'danger' ? 'text-red-700 dark:text-red-400' :
                    createDialogPricing.status === 'warning' ? 'text-amber-700 dark:text-amber-400' :
                    createDialogPricing.status === 'free' ? 'text-gray-600 dark:text-gray-400' :
                    'text-green-700 dark:text-green-400'
                  }>Pricing Check — {createDialogPricing.selectedCourse?.title}</span>
                </div>
                <div className="font-mono text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Course Price:</span><span className="font-bold">{fmtINR(createDialogPricing.coursePrice)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Discount Amount:</span><span className="font-bold text-orange-600">-{fmtINR(createDialogPricing.discountAmount)}</span></div>
                  <div className="flex justify-between border-t border-border/50 pt-1">
                    <span className="text-muted-foreground">User Will Pay:</span>
                    <span className={`font-bold text-lg ${createDialogPricing.status === 'danger' ? 'text-red-600' : createDialogPricing.status === 'warning' ? 'text-amber-600' : 'text-green-600'}`}>{fmtINR(createDialogPricing.finalPrice)}</span>
                  </div>
                </div>
                <p className={`text-[11px] leading-relaxed ${
                  createDialogPricing.status === 'danger' ? 'text-red-700 dark:text-red-400' :
                  createDialogPricing.status === 'warning' ? 'text-amber-700 dark:text-amber-400' :
                  createDialogPricing.status === 'free' ? 'text-gray-600 dark:text-gray-400' :
                  'text-green-700 dark:text-green-400'
                }`}>{createDialogPricing.message}</p>
                {createDialogPricing.status !== 'free' && createDialogPricing.coursePrice > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Brain className="w-3 h-3" />
                    <span>Users will THINK they saved {fmtINR(createDialogPricing.discountAmount)}. Actual revenue = {fmtINR(createDialogPricing.finalPrice)}.</span>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Expires at (optional)</Label>
              <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            </div>

            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border">
              <div className="flex items-center gap-2">
                {form.is_active ? <ShieldCheck className="w-5 h-5 text-green-500" /> : <ShieldBan className="w-5 h-5 text-destructive" />}
                <div>
                  <Label className="font-medium">{form.is_active ? 'Active Immediately' : 'Create as Inactive'}</Label>
                  <p className="text-[11px] text-muted-foreground">{form.is_active ? 'Users can use this code right away' : 'Code exists but cannot be used until you activate it'}</p>
                </div>
              </div>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>

            <Button onClick={createCode} className="w-full" variant={createDialogPricing.status === 'danger' ? 'destructive' : 'default'}>
              {createDialogPricing.status === 'danger' ? '⚠️ Create (User Pays ₹0!)' : 'Create Promocode'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============================================================== */}
      {/*  📖  GUIDE POPUP — Complete Guide: How to Use Promocodes       */}
      {/* ============================================================== */}
      <Dialog open={showGuide} onOpenChange={setShowGuide}>
        <DialogContent className="bg-card max-w-2xl max-h-[88vh] overflow-hidden flex flex-col p-0 gap-0">
          {/* Sticky Header */}
          <div className="shrink-0 bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-800 dark:to-indigo-800 px-6 py-5 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-bold text-white">Complete Guide: How to Use Promocodes</DialogTitle>
                  <p className="text-blue-100 text-xs mt-0.5">The Right Way — Psychology, Pricing & Profit</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/30 text-[10px]">
                  <Brain className="w-3 h-3 mr-1" /> Must Read
                </Badge>
              </div>
            </div>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 text-sm leading-relaxed">

            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center font-bold text-blue-700 dark:text-blue-300 text-sm border-2 border-blue-200 dark:border-blue-800">1</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1.5">Set Your Course Price FIRST</h4>
                <p className="text-muted-foreground">
                  Before creating ANY promocode, decide your <strong>real target price</strong> — the minimum amount you want to earn per sale.
                  Then set the course price HIGHER to absorb the discount.
                </p>
                <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-xs space-y-1.5">
                  <div className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-bold">Example</div>
                  <div>Target Price = ₹2,000</div>
                  <div>Planned Discount = 50%</div>
                  <div>Course Price = ₹2,000 ÷ (1 - 0.50) = <strong className="text-blue-600">₹4,000</strong></div>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5">User pays = ₹4,000 - 50% = <strong className="text-green-600">₹2,000 ✅</strong></div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center font-bold text-blue-700 dark:text-blue-300 text-sm border-2 border-blue-200 dark:border-blue-800">2</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1.5">Understand the Psychology <span className="text-orange-500">(This is KEY)</span></h4>
                <p className="text-muted-foreground">
                  When a user sees <strong>&quot;You saved ₹2,000 with code FIRST50!&quot;</strong>, their brain registers a <strong>WIN</strong>.
                  They feel smart. They feel they beat the system. This positive emotion:
                </p>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    'Increases purchase conversion significantly',
                    'Makes users share the code (free marketing)',
                    'Creates urgency — "use before it expires!"',
                    'Makes users MORE satisfied with purchase',
                  ].map((text, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-100 dark:border-green-900/40">
                      <Check className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                      <span className="text-xs text-green-800 dark:text-green-300">{text}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 p-3.5 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                    <Brain className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-amber-900 dark:text-amber-200 text-xs font-medium leading-relaxed">
                    <strong>The discount was NEVER real.</strong> You always intended to sell at ₹2,000. The ₹4,000 price tag was a psychological anchor.
                    The &quot;₹2,000 savings&quot; is a gift you gave the user&apos;s emotions — not their wallet.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center font-bold text-blue-700 dark:text-blue-300 text-sm border-2 border-blue-200 dark:border-blue-800">3</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1.5">Create the Code Strategically</h4>
                <p className="text-muted-foreground mb-3">Use codes that feel exclusive and special:</p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { code: 'LAUNCH50', desc: 'Launch offer' },
                    { code: 'START2024', desc: 'Festival' },
                    { code: 'FIRST100', desc: 'Early buyers' },
                    { code: 'WELCOME30', desc: 'New users' },
                    { code: 'EARLYBIRD', desc: 'Pre-launch' },
                    { code: 'FLASHSALE', desc: 'Limited time' },
                  ].map((c) => (
                    <div key={c.code} className="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 text-center">
                      <div className="font-mono text-xs font-bold text-foreground">{c.code}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{c.desc}</div>
                    </div>
                  ))}
                </div>
                <p className="text-muted-foreground mt-3">
                  Set <strong>max_uses</strong> for scarcity (&quot;Only 50 left!&quot;) and <strong>expiry dates</strong> for urgency.
                </p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="flex gap-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/60 flex items-center justify-center font-bold text-red-700 dark:text-red-300 text-sm border-2 border-red-200 dark:border-red-800">4</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1.5">Profit / Loss Check <span className="text-red-500">(CRITICAL)</span></h4>
                <p className="text-muted-foreground mb-3">Before giving ANY promocode, always verify:</p>
                <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 font-mono text-xs space-y-1.5">
                  <div className="text-slate-500 text-[10px] uppercase tracking-wider font-sans font-bold">Formula</div>
                  <div>Course Price (P) = ₹X</div>
                  <div>Discount (D) = X% or ₹X</div>
                  <div>Discount Amount = P × D% (or fixed ₹D)</div>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5">User Pays = P - Discount Amount</div>
                  <div className="border-t border-slate-200 dark:border-slate-700 pt-1.5 space-y-1">
                    <div>If User Pays ≥ Your Cost → <span className="text-green-600 font-bold">✅ PROFIT</span></div>
                    <div>If User Pays &lt; Your Cost → <span className="text-red-600 font-bold">❌ LOSS</span></div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 bg-red-50 dark:bg-red-950/30 border-2 border-red-200 dark:border-red-800 rounded-xl">
                    <div className="flex items-center gap-1.5 text-red-700 dark:text-red-400 font-bold text-xs mb-2">
                      <X className="w-4 h-4" /> LOSS Example
                    </div>
                    <div className="text-xs text-red-800/70 dark:text-red-300/70 font-mono space-y-1">
                      <div>Course: ₹1,000</div>
                      <div>Code: 80% OFF</div>
                      <div>User Pays: <strong className="text-red-600">₹200</strong></div>
                      <div>Your Cost: ₹500</div>
                      <div className="font-bold text-red-600 border-t border-red-200 dark:border-red-800 pt-1 mt-1">Loss: -₹300 per sale ❌</div>
                    </div>
                  </div>
                  <div className="p-3.5 bg-green-50 dark:bg-green-950/30 border-2 border-green-200 dark:border-green-800 rounded-xl">
                    <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400 font-bold text-xs mb-2">
                      <Check className="w-4 h-4" /> PROFIT Example
                    </div>
                    <div className="text-xs text-green-800/70 dark:text-green-300/70 font-mono space-y-1">
                      <div>Course: ₹4,000</div>
                      <div>Code: 50% OFF</div>
                      <div>User Pays: <strong className="text-green-600">₹2,000</strong></div>
                      <div>Your Cost: ₹500</div>
                      <div className="font-bold text-green-600 border-t border-green-200 dark:border-green-800 pt-1 mt-1">Profit: +₹1,500 per sale ✅</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 5 */}
            <div className="flex gap-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/60 flex items-center justify-center font-bold text-purple-700 dark:text-purple-300 text-sm border-2 border-purple-200 dark:border-purple-800">5</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1.5">Reward Shop Codes — Double Psychology</h4>
                <p className="text-muted-foreground">
                  When users earn coins by watching videos and taking tests, then &quot;spend&quot; those coins for a discount code —
                  that&apos;s <strong>double psychology</strong>. The coins cost you NOTHING to create. But the user feels they <strong>EARNED</strong> the discount
                  through hard work. They value the code more because they &quot;paid&quot; for it with their effort.
                </p>
                <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 text-xs font-bold mb-1.5">
                    <Target className="w-3.5 h-3.5" /> Result
                  </div>
                  <p className="text-xs text-purple-800/70 dark:text-purple-300/70">
                    This increases <strong>course completion rates</strong> (users watch more to earn coins) AND <strong>purchase rates</strong> simultaneously. Win-win for you.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 6 */}
            <div className="flex gap-4">
              <div className="shrink-0 w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/60 flex items-center justify-center font-bold text-blue-700 dark:text-blue-300 text-sm border-2 border-blue-200 dark:border-blue-800">6</div>
              <div className="flex-1">
                <h4 className="font-bold text-foreground text-base mb-1.5">Monitor & Control</h4>
                <p className="text-muted-foreground">
                  Check this dashboard regularly. Use the <strong>Active/Inactive toggle</strong> to instantly disable codes being overused.
                  Set <strong>expiry dates</strong> so old codes auto-expire. Use <strong>max_uses</strong> to limit redemptions.
                  If a code is being shared publicly when it wasn&apos;t meant to be — <strong>deactivate it immediately</strong> with one click.
                </p>
              </div>
            </div>

            {/* Bottom Line */}
            <div className="p-4 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-violet-950/30 border-2 border-blue-200 dark:border-blue-800 rounded-xl">
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                  <Lightbulb className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <h4 className="font-bold text-blue-900 dark:text-blue-200 text-base">Bottom Line</h4>
              </div>
              <p className="text-sm text-blue-800/80 dark:text-blue-300/70 leading-relaxed">
                Promocodes are a <strong>pricing strategy</strong>, not a discount. You control the narrative. Set prices right, create urgency with limits &amp; expiry,
                and watch users feel like winners while you collect your full target revenue. It&apos;s not deception — it&apos;s <strong>smart pricing psychology</strong> used by every major platform
                from Amazon to Zomato to Udemy.
              </p>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="shrink-0 border-t border-border bg-background px-6 py-4 flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">Always verify pricing before creating a new code</p>
            <Button onClick={() => setShowGuide(false)} className="bg-blue-600 hover:bg-blue-700 text-white">
              Got It, I Understand
              <Check className="w-4 h-4 ml-1.5" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default AdminPromocodes;