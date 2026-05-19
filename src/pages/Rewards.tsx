import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coins, Loader2, Ticket, CheckCircle2, Copy, Check, Lock, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useSEO } from '@/lib/seo';
import { cn } from '@/lib/utils';

const Rewards = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [rewards, setRewards] = useState<any[]>([]);
  const [redeemedIds, setRedeemedIds] = useState<Set<string>>(new Set());
  const [myCodes, setMyCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useSEO({ title: 'Rewards Shop — LearnHub', description: 'Spend coins on one-time discount coupons.' });

  const load = async () => {
    if (!user) return;
    const [p, r, mr] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('rewards').select('*').eq('is_active', true).eq('reward_type', 'discount').order('cost_coins'),
      supabase.from('reward_redemptions').select('id, reward_id, code_granted, redeemed_at, cost_paid').eq('user_id', user.id).order('redeemed_at', { ascending: false }),
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

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const currentCoins = profile?.coins || 0;

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-5xl w-full mx-auto space-y-8">
      
      <style>{`
        @keyframes coinBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        .coin-bounce { animation: coinBounce 2s ease-in-out infinite; }
      `}</style>

      {/* ─── HEADER & WALLET ─── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-500" /> Rewards Shop
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Exchange your hard-earned coins for exclusive discounts.</p>
        </div>
        
        {/* Premium Coin Wallet Card */}
        <Card className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-yellow-400 dark:from-amber-600 dark:to-yellow-500 text-white p-4 shadow-lg shadow-amber-500/20 border-0">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white/20 rounded-xl coin-bounce">
              <Coins className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-medium text-white/80">Your Balance</p>
              <p className="text-2xl font-extrabold tabular-nums leading-none">{currentCoins.toLocaleString()}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ─── REWARDS GRID ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rewards.map((r) => {
          const owned = redeemedIds.has(r.id);
          const canAfford = currentCoins >= r.cost_coins;
          const deficit = r.cost_coins - currentCoins;

          return (
            <Card key={r.id} className={cn(
              "relative overflow-hidden flex flex-col transition-all duration-200 group",
              owned 
                ? "bg-green-50 dark:bg-green-950/20 border-green-400 dark:border-green-700" 
                : canAfford 
                  ? "bg-card border-amber-400/40 hover:border-amber-400 hover:shadow-xl hover:-translate-y-1 cursor-pointer" 
                  : "bg-card border-border/60 opacity-90"
            )}>
              {/* Owned Ribbon */}
              {owned && (
                <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-lg shadow flex items-center gap-1 z-10">
                  <CheckCircle2 className="w-3 h-3" /> CLAIMED
                </div>
              )}

              {/* Affordability Indicator */}
              {!owned && !canAfford && (
                <div className="absolute top-0 right-0 bg-muted text-muted-foreground text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1 z-10">
                  <Lock className="w-3 h-3" /> LOCKED
                </div>
              )}

              <div className="p-5 flex-1 flex flex-col">
                <div className={cn(
                  "w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors",
                  owned ? "bg-green-100 dark:bg-green-900/30" : "bg-primary/10"
                )}>
                  <Ticket className={cn("w-6 h-6", owned ? "text-green-600" : "text-primary")} />
                </div>
                <h3 className="font-bold text-base leading-snug">{r.name}</h3>
                <p className="text-sm text-muted-foreground flex-1 mt-1 leading-relaxed">{r.description}</p>
                
                <div className="mt-4 pt-4 border-t border-border/40 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-extrabold text-foreground">
                    <Coins className="w-4 h-4 text-amber-500" />
                    {r.cost_coins}
                  </div>

                  {owned ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-green-600">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Owned
                    </span>
                  ) : (
                    <Button 
                      onClick={() => redeem(r)} 
                      disabled={!canAfford || redeeming === r.id} 
                      size="sm"
                      variant={canAfford ? "default" : "outline"}
                      className="gap-1.5 font-semibold"
                    >
                      {redeeming === r.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : canAfford ? (
                        'Redeem Now'
                      ) : (
                        <>
                          Need <span className="text-amber-500 flex items-center gap-0.5"><Coins className="w-3 h-3"/>{deficit}</span> more
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ─── MY COUPONS WALLET ─── */}
      {myCodes.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" /> Your Coupons ({myCodes.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myCodes.map((c) => {
              const isCopied = copiedId === c.id;
              return (
                <Card key={c.id} className="overflow-hidden bg-card border-border hover:border-primary/30 transition-colors">
                  <div className="flex flex-col sm:flex-row">
                    {/* Coupon Left Side - Discount Visual */}
                    <div className="bg-gradient-to-br from-primary/10 to-primary/5 p-4 sm:p-5 flex flex-col items-center justify-center text-center border-b sm:border-b-0 sm:border-r border-dashed border-border/60 sm:w-2/5">
                      <Ticket className="w-6 h-6 text-primary mb-2" />
                      <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Discount Code</span>
                    </div>

                    {/* Coupon Right Side - Code & Actions */}
                    <div className="p-4 flex-1 flex flex-col justify-between">
                      <div>
                        <code className="font-mono font-extrabold text-base text-foreground tracking-wider bg-muted/50 px-2 py-1 rounded">
                          {c.code_granted}
                        </code>
                        <p className="text-[11px] text-muted-foreground mt-1.5">
                          Cost: {c.cost_paid} coins · Redeemed {new Date(c.redeemed_at).toLocaleDateString()}
                        </p>
                      </div>
                      <Button 
                        size="sm" 
                        variant={isCopied ? "secondary" : "outline"} 
                        onClick={() => handleCopy(c.code_granted, c.id)}
                        className={cn(
                          "mt-3 gap-1.5 text-xs font-semibold w-full sm:w-auto transition-all",
                          isCopied && "text-green-600 border-green-400 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700"
                        )}
                      >
                        {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {isCopied ? 'Copied!' : 'Copy Code'}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};

export default Rewards;