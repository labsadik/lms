import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Flame, Zap, Coins, Trophy, ChevronUp } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { levelFromXP } from '@/lib/format';

const GamifyChip = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle();
      setProfile(data);
    };
    load();
    const channel = supabase
      .channel(`profile:${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` }, (payload) => setProfile(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  if (!user || !profile) return null;
  
  // Use exact same logic as Dashboard
  const lvl = levelFromXP(profile.xp || 0);
  const progressPct = Math.round((lvl.xpIntoLevel / lvl.xpToNext) * 100);
  const isComplete = progressPct >= 100;

  // Use exact same color logic as Dashboard
  const getBarColor = (p: number) => {
    if (p < 40) return '#FACC15'; // Yellow for low
    if (p < 80) return '#F97316'; // Orange for mid
    return '#22C55E';             // Green for almost/max complete
  };
  const barColor = getBarColor(progressPct);

  return (
    <>
      {/* Desktop Chip */}
      <button onClick={() => setOpen(true)} className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-secondary/60 hover:bg-secondary border border-border text-xs transition-colors">
        <span className="flex items-center gap-1 text-[hsl(var(--xp))] font-bold">L{lvl.level}</span>
        <span className="flex items-center gap-0.5 text-[hsl(var(--coin))]"><Coins className="w-3 h-3" />{profile.coins > 999 ? `${(profile.coins/1000).toFixed(0)}k` : profile.coins}</span>
        <span className="flex items-center gap-0.5 text-[hsl(var(--streak))]"><Flame className="w-3 h-3" />{profile.current_streak}</span>
      </button>

      {/* Mobile Chip */}
      <button onClick={() => setOpen(true)} className="sm:hidden flex items-center gap-1.5 px-2 py-1 rounded-full bg-secondary/60 hover:bg-secondary border border-border text-xs transition-colors">
        <span className="flex items-center gap-1 text-[hsl(var(--xp))] font-bold">L{lvl.level}</span>
        <span className="flex items-center gap-0.5 text-[hsl(var(--coin))]"><Coins className="w-3 h-3" />{profile.coins > 999 ? `${(profile.coins/1000).toFixed(0)}k` : profile.coins}</span>
        <span className="flex items-center gap-0.5 text-[hsl(var(--streak))]"><Flame className="w-3 h-3" />{profile.current_streak}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> Your Stats</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-semibold">Level {lvl.level}</span>
                <span className="text-muted-foreground tabular-nums">
                  {isComplete ? lvl.xpToNext.toLocaleString() : lvl.xpIntoLevel.toLocaleString()} / {lvl.xpToNext.toLocaleString()} XP
                </span>
              </div>
              
              {/* Exact same dynamic progress bar as Dashboard */}
              <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                <div 
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{ 
                    width: `${progressPct}%`, 
                    background: barColor, 
                    boxShadow: `0 0 12px ${barColor}50` 
                  }}
                />
              </div>
              
              <div className="flex justify-between items-center mt-1.5">
                <span className="text-[11px] text-muted-foreground">
                  {isComplete ? (
                    <span className="font-bold flex items-center gap-0.5" style={{ color: barColor }}>
                      <ChevronUp className="w-3 h-3" /> Level Complete! (Resets next)
                    </span>
                  ) : (
                    <>{(lvl.xpToNext - lvl.xpIntoLevel).toLocaleString()} XP to L{lvl.level + 1}</>
                  )}
                </span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: barColor }}>
                  {progressPct}%
                </span>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-secondary/50"><Coins className="w-4 h-4 mx-auto text-[hsl(var(--coin))] mb-1" /><div className="text-sm font-bold">{profile.coins.toLocaleString()}</div><div className="text-[10px] text-muted-foreground">Coins</div></div>
              <div className="p-2 rounded bg-secondary/50"><Flame className="w-4 h-4 mx-auto text-[hsl(var(--streak))] mb-1" /><div className="text-sm font-bold">{profile.current_streak}d</div><div className="text-[10px] text-muted-foreground">Streak</div></div>
              <div className="p-2 rounded bg-secondary/50"><Zap className="w-4 h-4 mx-auto text-[hsl(var(--xp))] mb-1" /><div className="text-sm font-bold">{profile.longest_streak}d</div><div className="text-[10px] text-muted-foreground">Best</div></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GamifyChip;