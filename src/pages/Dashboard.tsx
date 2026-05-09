import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Loader2, Trophy, Flame, Coins, Star, BookOpen, Award, Wallet, Tag, ChevronRight } from 'lucide-react';
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

  // Dynamic XP Bar Color Logic
  const getBarColor = (p: number) => {
    if (p < 40) return '#FACC15'; // Yellow for low
    if (p < 80) return '#F97316'; // Orange for mid
    return '#22C55E';             // Green for almost/max complete
  };
  const barColor = getBarColor(progressPct);

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-6xl w-full mx-auto space-y-6">
      
      {/* Header Section */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome back, {profile.display_name || 'learner'} 👋</h1>
          <p className="text-muted-foreground text-sm mt-1">Keep the streak alive — every day counts.</p>
        </div>
        <Button onClick={() => setLbOpen(true)} variant="outline" className="gap-2 shrink-0 w-full sm:w-auto">
          <Trophy className="w-4 h-4" /> Leaderboard
        </Button>
      </header>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Star} label="Level" value={lvl.level} color="text-[hsl(var(--xp))]" />
        <StatCard icon={Trophy} label="Total XP" value={profile.xp} color="text-[hsl(var(--xp))]" />
        <StatCard icon={Flame} label="Streak" value={`${profile.current_streak}d`} color="text-[hsl(var(--streak))]" />
        <StatCard icon={Coins} label="Coins" value={profile.coins} color="text-[hsl(var(--coin))]" />
      </div>

      {/* XP Progress & Secondary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* XP Progress Card - Spans 2 columns */}
        <Card className="p-4 sm:p-5 bg-card border-border sm:col-span-2 flex flex-col justify-center">
          <div className="flex justify-between mb-2 text-sm">
            <span className="font-semibold">Level {lvl.level}</span>
            <span className="text-muted-foreground tabular-nums">
              {lvl.xpIntoLevel.toLocaleString()} / {lvl.xpToNext.toLocaleString()} XP
            </span>
          </div>
          
          {/* Custom Dynamic Progress Bar */}
          <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div 
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{ 
                width: `${progressPct}%`, 
                background: barColor, // Strict 'background' prevents white bar glitch
                boxShadow: `0 0 12px ${barColor}50` 
              }}
            />
          </div>
          <div className="flex justify-end mt-1.5">
            <span className="text-[11px] font-bold tabular-nums" style={{ color: barColor }}>
              {progressPct}%
            </span>
          </div>
        </Card>

        {/* Financial Stats Column */}
        <div className="flex flex-col gap-3">
          <Card className="p-4 bg-card border-border flex-1 flex flex-col justify-center">
            <Wallet className="w-4 h-4 mb-1.5 text-primary" />
            <div className="text-xl font-bold tabular-nums">{formatPriceINR(totalSpent)}</div>
            <div className="text-[11px] text-muted-foreground">Total spent ({enrollments.length} courses)</div>
          </Card>
          <Card className="p-4 bg-card border-border flex-1 flex flex-col justify-center">
            <Tag className="w-4 h-4 mb-1.5 text-primary" />
            <div className="text-xl font-bold">{redemptions.length}</div>
            <div className="text-[11px] text-muted-foreground">Promocodes used</div>
          </Card>
        </div>
      </div>

      {/* My Courses Section */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" /> My Courses</h2>
          {enrollments.length > 0 && (
            <Link to="/courses" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
              Browse more <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        
        {enrollments.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">No courses yet.</p>
            <Link to="/courses" className="text-sm text-primary hover:underline font-medium mt-1 inline-block">Browse courses</Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {enrollments.map((en: any) => (
              <Link key={en.id} to={`/learn/${en.courses.slug}`}>
                <Card className="overflow-hidden bg-card border-border hover:border-primary/50 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 h-full group">
                  <div className="overflow-hidden">
                    {en.courses.thumbnail_url && (
                      <img src={en.courses.thumbnail_url} alt={en.courses.title} className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300" />
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">{en.courses.title}</h3>
                    <div className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span>Paid {formatPriceINR(en.amount_paid_inr)}</span>
                      {en.promocode && en.promocode !== 'ADMIN_GRANT' && (
                        <>
                          <span className="text-border">·</span>
                          <span className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{en.promocode}</span>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Promocode History */}
      {redemptions.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><Tag className="w-5 h-5 text-primary" /> Promocode History</h2>
          <Card className="bg-card border-border divide-y divide-border overflow-hidden">
            {redemptions.map((r: any) => (
              <div key={r.id} className="flex justify-between items-center p-3 sm:p-4 text-sm hover:bg-secondary/30 transition-colors">
                <div className="min-w-0 flex-1 mr-4">
                  <div className="font-mono font-bold text-primary text-xs sm:text-sm">{r.promocodes?.code}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{r.courses?.title} · {new Date(r.redeemed_at).toLocaleDateString()}</div>
                </div>
                <div className="text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 px-2 py-1 rounded-md shrink-0">
                  {r.promocodes?.discount_type === 'percent' ? `${r.promocodes.discount_value}% off` : `${formatPriceINR(r.promocodes?.discount_value || 0)} off`}
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {/* Badges Section */}
      <section>
        <h2 className="text-xl font-bold mb-3 flex items-center gap-2"><Award className="w-5 h-5 text-primary" /> Badges Earned ({badges.length})</h2>
        {badges.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border">
            <Award className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">No badges yet — keep learning to earn your first one!</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {badges.map((b: any) => (
              <Card key={b.id} className="p-4 text-center bg-card border-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group">
                <div className="w-12 h-12 mx-auto rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <Award className="w-6 h-6 text-primary" />
                </div>
                <h4 className="font-semibold text-sm">{b.badges.name}</h4>
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{b.badges.description}</p>
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
  <Card className="p-3 sm:p-4 bg-card border-border hover:shadow-sm transition-shadow">
    <Icon className={`w-4 h-4 mb-2 ${color}`} />
    <div className="text-xl sm:text-2xl font-bold tabular-nums">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </div>
    <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
  </Card>
);

export default Dashboard;