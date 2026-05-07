import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, Loader2, Ticket, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSEO } from '@/lib/seo';

const Rewards = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [redeemedIds, setRedeemedIds] = useState<Set<string>>(new Set());
  const [myCodes, setMyCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  useSEO({ title: 'Rewards Shop — LearnHub', description: 'Spend coins on one-time discount coupons.' });

  const load = async () => {
    if (!user) return;
    const [p, r, mr] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('rewards').select('*').eq('is_active', true).eq('reward_type', 'discount').order('cost_coins'),
      supabase.from('reward_redemptions').select('reward_id, code_granted, redeemed_at, cost_paid').eq('user_id', user.id).order('redeemed_at', { ascending: false }),
    ]);
    setProfile(p.data);
    setRewards(r.data || []);
    setMyCodes(mr.data || []);
    setRedeemedIds(new Set((mr.data || []).map((x: any) => x.reward_id)));
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);

  // Real-time updates: refresh coin total instantly when server awards coins
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`rewards-profile-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
        (payload) => setProfile((prev: any) => ({ ...(prev || {}), ...(payload.new as any) })))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reward_redemptions', filter: `user_id=eq.${user.id}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const redeem = async (reward: any) => {
    if (!user || !profile) return;
    if (redeemedIds.has(reward.id)) { toast.error('You already redeemed this discount'); return; }
    if (profile.coins < reward.cost_coins) { toast.error('Not enough coins'); return; }
    setRedeeming(reward.id);
    const { data, error } = await supabase.functions.invoke('redeem-reward', { body: { reward_id: reward.id } });
    setRedeeming(null);
    if (error || (data as any)?.error) {
      toast.error(((data as any)?.error) || error?.message || 'Redeem failed');
      return;
    }
    toast.success(`Redeemed! Your code: ${(data as any).code}`, { duration: 10000 });
    load();
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-4xl w-full mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Rewards Shop</h1>
          <p className="text-muted-foreground text-sm mt-1">Spend coins on one-time discount coupons</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-card rounded-lg border border-border">
          <Coins className="w-5 h-5 text-[hsl(var(--coin))]" />
          <span className="font-bold text-lg">{profile?.coins || 0}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {rewards.map((r) => {
          const owned = redeemedIds.has(r.id);
          const can = (profile?.coins || 0) >= r.cost_coins;
          return (
            <Card key={r.id} className="p-5 bg-card border-border flex flex-col">
              <Ticket className="w-8 h-8 text-primary mb-2" />
              <h3 className="font-bold text-lg">{r.name}</h3>
              <p className="text-sm text-muted-foreground flex-1">{r.description}</p>
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-1 font-bold"><Coins className="w-4 h-4 text-[hsl(var(--coin))]" />{r.cost_coins}</div>
                {owned ? (
                  <span className="flex items-center gap-1 text-xs text-green-500"><CheckCircle2 className="w-3.5 h-3.5" /> Redeemed</span>
                ) : (
                  <Button onClick={() => redeem(r)} disabled={!can || redeeming === r.id} size="sm">
                    {redeeming === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (can ? 'Redeem' : 'Need more')}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {myCodes.length > 0 && (
        <section>
          <h2 className="font-bold text-lg mb-2">Your codes</h2>
          <div className="space-y-2">
            {myCodes.map((c, i) => (
              <Card key={i} className="p-3 bg-card border-border flex items-center justify-between">
                <div>
                  <code className="font-mono font-bold text-primary">{c.code_granted}</code>
                  <p className="text-[11px] text-muted-foreground">Cost: {c.cost_paid} coins · {new Date(c.redeemed_at).toLocaleDateString()}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(c.code_granted); toast.success('Copied'); }}>Copy</Button>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Rewards;
