import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Flame, Zap, Coins, Trophy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

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
  const level = profile.level || 1;
  const xpForLevel = level * level * 100;
  const xpForNext = (level + 1) * (level + 1) * 100;
  const pct = Math.min(100, ((profile.xp - xpForLevel) / Math.max(1, xpForNext - xpForLevel)) * 100);

  return (
    <>
      <button onClick={() => setOpen(true)} className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-full bg-secondary/60 hover:bg-secondary border border-border text-xs">
        <span className="flex items-center gap-1 text-[hsl(var(--xp))] font-bold">L{level}</span>
        <span className="flex items-center gap-0.5 text-[hsl(var(--coin))]"><Coins className="w-3 h-3" />{profile.coins > 999 ? `${(profile.coins/1000).toFixed(0)}k` : profile.coins}</span>
        <span className="flex items-center gap-0.5 text-[hsl(var(--streak))]"><Flame className="w-3 h-3" />{profile.current_streak}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Trophy className="w-5 h-5 text-primary" /> Your Stats</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1"><span>Level {level}</span><span className="text-muted-foreground">{profile.xp.toLocaleString()} XP</span></div>
              <Progress value={pct} className="h-2" />
              <div className="text-[11px] text-muted-foreground mt-1">{(xpForNext - profile.xp).toLocaleString()} XP to L{level + 1}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded bg-secondary/50"><Coins className="w-4 h-4 mx-auto text-[hsl(var(--coin))]" /><div className="text-sm font-bold">{profile.coins.toLocaleString()}</div><div className="text-[10px] text-muted-foreground">Coins</div></div>
              <div className="p-2 rounded bg-secondary/50"><Flame className="w-4 h-4 mx-auto text-[hsl(var(--streak))]" /><div className="text-sm font-bold">{profile.current_streak}d</div><div className="text-[10px] text-muted-foreground">Streak</div></div>
              <div className="p-2 rounded bg-secondary/50"><Zap className="w-4 h-4 mx-auto text-[hsl(var(--xp))]" /><div className="text-sm font-bold">{profile.longest_streak}d</div><div className="text-[10px] text-muted-foreground">Best</div></div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default GamifyChip;
