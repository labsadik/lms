import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Trophy, Flame, Coins, Star, BookOpen, Award, Wallet, Tag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GlobalLeaderboardDialog from '@/components/GlobalLeaderboardDialog';
import { levelFromXP, formatPriceINR } from '@/lib/format';
import { useSEO } from '@/lib/seo';

const Dashboard = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lbOpen, setLbOpen] = useState(false);

  useSEO({ title: 'My Dashboard — LearnHub', description: 'Track your progress, XP, streaks, and earned badges.' });

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('enrollments').select('id, course_id, amount_paid_inr, promocode, courses(id, slug, title, thumbnail_url)').eq('user_id', user.id),
      supabase.from('user_badges').select('id, earned_at, badges(*)').eq('user_id', user.id).order('earned_at', { ascending: false }),
      supabase.from('promocode_redemptions').select('id, redeemed_at, promocodes(code, discount_type, discount_value), courses(title)').eq('user_id', user.id).order('redeemed_at', { ascending: false }),
    ]).then(([p, e, b, r]) => {
      setProfile(p.data);
      setEnrollments(e.data || []);
      setBadges(b.data || []);
      setRedemptions(r.data || []);
      setLoading(false);
    });
  }, [user]);

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!profile) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Profile not loaded</div>;

  const lvl = levelFromXP(profile.xp || 0);
  const progressPct = Math.round((lvl.xpIntoLevel / lvl.xpToNext) * 100);
  const totalSpent = enrollments.reduce((s, e: any) => s + (e.amount_paid_inr || 0), 0);

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-6xl w-full mx-auto space-y-6">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Welcome back, {profile.display_name || 'learner'} 👋</h1>
          <p className="text-muted-foreground text-sm mt-1">Keep the streak alive — every day counts.</p>
        </div>
        <Button onClick={() => setLbOpen(true)} variant="outline" className="gap-2"><Trophy className="w-4 h-4" /> Leaderboard</Button>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Star} label="Level" value={lvl.level} color="text-[hsl(var(--xp))]" />
        <StatCard icon={Trophy} label="Total XP" value={profile.xp} color="text-[hsl(var(--xp))]" />
        <StatCard icon={Flame} label="Streak" value={`${profile.current_streak}d`} color="text-[hsl(var(--streak))]" />
        <StatCard icon={Coins} label="Coins" value={profile.coins} color="text-[hsl(var(--coin))]" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-4 bg-card border-border">
          <Wallet className="w-5 h-5 mb-2 text-primary" />
          <div className="text-2xl font-bold">{formatPriceINR(totalSpent)}</div>
          <div className="text-xs text-muted-foreground">Total spent across {enrollments.length} course{enrollments.length === 1 ? '' : 's'}</div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <Tag className="w-5 h-5 mb-2 text-primary" />
          <div className="text-2xl font-bold">{redemptions.length}</div>
          <div className="text-xs text-muted-foreground">Promocode{redemptions.length === 1 ? '' : 's'} used</div>
        </Card>
      </div>

      <Card className="p-4 sm:p-6 bg-card border-border">
        <div className="flex justify-between mb-2 text-sm">
          <span>Level {lvl.level}</span>
          <span className="text-muted-foreground">{lvl.xpIntoLevel} / {lvl.xpToNext} XP</span>
        </div>
        <Progress value={progressPct} className="h-3" />
      </Card>

      <section>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><BookOpen className="w-5 h-5" /> My Courses</h2>
        {enrollments.length === 0 ? (
          <Card className="p-6 text-center bg-card border-border">
            <p className="text-muted-foreground">No courses yet. <Link to="/courses" className="text-primary hover:underline">Browse courses</Link></p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {enrollments.map((en: any) => (
              <Link key={en.id} to={`/learn/${en.courses.slug}`}>
                <Card className="overflow-hidden bg-card border-border hover:border-primary/50 transition-all h-full">
                  {en.courses.thumbnail_url && <img src={en.courses.thumbnail_url} alt={en.courses.title} className="w-full aspect-video object-cover" />}
                  <div className="p-3">
                    <h3 className="font-semibold text-sm line-clamp-2">{en.courses.title}</h3>
                    <div className="text-[11px] text-muted-foreground mt-1">Paid {formatPriceINR(en.amount_paid_inr)} {en.promocode && en.promocode !== 'ADMIN_GRANT' && <>· code <span className="text-primary">{en.promocode}</span></>}</div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {redemptions.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><Tag className="w-5 h-5" /> Promocode history</h2>
          <Card className="bg-card border-border divide-y divide-border">
            {redemptions.map((r: any) => (
              <div key={r.id} className="flex justify-between items-center p-3 text-sm">
                <div>
                  <div className="font-mono font-bold text-primary">{r.promocodes?.code}</div>
                  <div className="text-[11px] text-muted-foreground">{r.courses?.title} · {new Date(r.redeemed_at).toLocaleDateString()}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.promocodes?.discount_type === 'percent' ? `${r.promocodes.discount_value}% off` : formatPriceINR(r.promocodes?.discount_value || 0) + ' off'}
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><Award className="w-5 h-5" /> Badges Earned ({badges.length})</h2>
        {badges.length === 0 ? (
          <p className="text-muted-foreground text-sm">No badges yet — keep learning to earn your first one!</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {badges.map((b: any) => (
              <Card key={b.id} className="p-4 text-center bg-card border-border">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 flex items-center justify-center mb-2"><Award className="w-6 h-6 text-primary" /></div>
                <h4 className="font-semibold text-sm">{b.badges.name}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2">{b.badges.description}</p>
              </Card>
            ))}
          </div>
        )}
      </section>
      <GlobalLeaderboardDialog open={lbOpen} onOpenChange={setLbOpen} />
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }: any) => (
  <Card className="p-4 bg-card border-border">
    <Icon className={`w-5 h-5 mb-2 ${color}`} />
    <div className="text-2xl font-bold">{value}</div>
    <div className="text-xs text-muted-foreground">{label}</div>
  </Card>
);

export default Dashboard;
