import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Loader2, Trophy, Flame, Coins, Star, BookOpen, Award, Wallet, Tag, ChevronRight, CheckCircle2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import GlobalLeaderboardDialog from '@/components/GlobalLeaderboardDialog';
import { levelFromXP, formatPriceINR } from '@/lib/format';
import { useSEO } from '@/lib/seo';
import { cn } from '@/lib/utils';

// ─── PSYCHOLOGY HELPERS ───

const getCourseMotivation = (pct: number): string => {
  if (pct === 100) return "Mastered! 🏆";
  if (pct >= 80) return "So close! Finish strong 🚀";
  if (pct >= 50) return "Halfway there! Keep going 💪";
  if (pct > 0) return "Great start! Keep building 🧠";
  return "Ready to begin? ✨";
};

/* ════════════════════════════════════════════════════════
   MAIN DASHBOARD PAGE
   ════════════════════════════════════════════════════════ */
const Dashboard = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [courseProgress, setCourseProgress] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [lbOpen, setLbOpen] = useState(false);

  useSEO({ title: 'My Dashboard — LearnHub', description: 'Track your progress, XP, streaks, and earned badges.' });

  useEffect(() => {
    if (!user) return;

    (async () => {
      const [p, e, b, r] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('enrollments').select('id, course_id, amount_paid_inr, promocode, courses(id, slug, title, thumbnail_url)').eq('user_id', user.id),
        supabase.from('user_badges').select('id, earned_at, badges(*)').eq('user_id', user.id).order('earned_at', { ascending: false }),
        supabase.from('promocode_redemptions').select('id, redeemed_at, promocodes(code, discount_type, discount_value), courses(title)').eq('user_id', user.id).order('redeemed_at', { ascending: false }),
      ]);

      setProfile(p.data);
      const enrollData = e.data || [];
      setEnrollments(enrollData);
      setBadges(b.data || []);
      setRedemptions(r.data || []);

      if (enrollData.length > 0) {
        const courseIds = enrollData.map((en: any) => en.course_id);
        const [progressRes, subjectsRes] = await Promise.all([
          supabase.from('progress').select('part_id').eq('user_id', user.id).eq('completed', true),
          supabase.from('subjects').select('id, course_id, chapters(id, parts(id))').in('course_id', courseIds),
        ]);

        const completedIds = new Set((progressRes.data || []).map((x: any) => x.part_id));
        const partsByCourse: Record<string, string[]> = {};
        (subjectsRes.data || []).forEach((s: any) => {
          if (!partsByCourse[s.course_id]) partsByCourse[s.course_id] = [];
          (s.chapters || []).forEach((ch: any) => {
            (ch.parts || []).forEach((pt: any) => {
              partsByCourse[s.course_id].push(pt.id);
            });
          });
        });

        const pctMap: Record<string, number> = {};
        for (const cid of courseIds) {
          const all = partsByCourse[cid] || [];
          if (all.length === 0) { pctMap[cid] = 0; continue; }
          const done = all.filter((pid: string) => completedIds.has(pid)).length;
          pctMap[cid] = Math.round((done / all.length) * 100);
        }
        setCourseProgress(pctMap);
      }

      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className="flex-1 flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!profile) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Profile not loaded</div>;

  const lvl = levelFromXP(profile.xp || 0);
  const progressPct = Math.round((lvl.xpIntoLevel / lvl.xpToNext) * 100);
  const xpNeeded = lvl.xpToNext - lvl.xpIntoLevel;
  const totalSpent = enrollments.reduce((s, e: any) => s + (e.amount_paid_inr || 0), 0);

  return (
    <div className="flex-1 px-4 py-6 sm:py-10 max-w-6xl w-full mx-auto space-y-8">
      
      {/* Animations & Shimmers */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .xp-shimmer {
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
          background-size: 200% 100%;
          animation: shimmer 2s infinite;
        }
      `}</style>

      {/* ─── HEADER ─── */}
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            Welcome back, {profile.display_name || 'learner'} 👋
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Keep the momentum — every lesson counts.</p>
        </div>
        <Button onClick={() => setLbOpen(true)} variant="outline" className="gap-2 shrink-0 w-full sm:w-auto border-primary/30 hover:bg-primary/5">
          <Trophy className="w-4 h-4 text-amber-500" /> Leaderboard
        </Button>
      </header>

      {/* ─── GAMIFIED STATS HUD ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Star} label="Level" value={lvl.level} gradient="from-blue-500 to-indigo-500" iconBg="bg-blue-500/10" />
        <StatCard icon={Trophy} label="Total XP" value={profile.xp} gradient="from-purple-500 to-pink-500" iconBg="bg-purple-500/10" />
        <StatCard icon={Flame} label="Streak" value={`${profile.current_streak}d`} gradient="from-orange-500 to-red-500" iconBg="bg-orange-500/10" />
        <StatCard icon={Coins} label="Coins" value={profile.coins} gradient="from-yellow-400 to-amber-500" iconBg="bg-yellow-400/10" />
      </div>

      {/* ─── XP PROGRESS + FINANCIAL ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-5 sm:p-6 bg-card border-border sm:col-span-2 flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10">
            <div className="flex justify-between mb-2 text-sm">
              <span className="font-bold text-foreground">Level {lvl.level} Progress</span>
              <span className="text-muted-foreground tabular-nums text-xs">
                {lvl.xpIntoLevel.toLocaleString()} / {lvl.xpToNext.toLocaleString()} XP
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out relative"
                style={{ width: `${progressPct}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}
              >
                <div className="xp-shimmer absolute inset-0 rounded-full" />
              </div>
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-xs font-semibold text-primary flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Just {xpNeeded.toLocaleString()} XP to Level {lvl.level + 1}!
              </span>
              <span className="text-[11px] font-bold tabular-nums text-purple-500">{progressPct}%</span>
            </div>
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <Card className="p-4 bg-card border-border flex-1 flex flex-col justify-center">
            <Wallet className="w-4 h-4 mb-1.5 text-primary" />
            <div className="text-xl font-bold tabular-nums">{formatPriceINR(totalSpent)}</div>
            <div className="text-[11px] text-muted-foreground">Total invested ({enrollments.length} courses)</div>
          </Card>
          <Card className="p-4 bg-card border-border flex-1 flex flex-col justify-center">
            <Tag className="w-4 h-4 mb-1.5 text-primary" />
            <div className="text-xl font-bold">{redemptions.length}</div>
            <div className="text-[11px] text-muted-foreground">Promocodes used</div>
          </Card>
        </div>
      </div>

      {/* ─── MY COURSES ─── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 text-primary" /> My Courses</h2>
          {enrollments.length > 0 && (
            <Link to="/courses" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors">
              Browse more <ChevronRight className="w-3 h-3" />
            </Link>
          )}
        </div>

        {enrollments.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border/50">
            <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">Your learning journey starts here.</p>
            <Link to="/courses" className="text-sm text-primary hover:underline font-medium mt-1 inline-block">Browse courses</Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrollments.map((en: any) => {
              const pct = courseProgress[en.course_id] ?? 0;
              const isComplete = pct === 100;

              return (
                <Link key={en.id} to={`/learn/${en.courses.slug}`} className="block group">
                  <Card className={cn(
                    "overflow-hidden bg-card transition-all duration-200 h-full",
                    isComplete ? "border-green-400 dark:border-green-700 hover:border-green-500 shadow-sm" : "border-border/60 hover:border-primary/40 hover:shadow-lg hover:-translate-y-1"
                  )}>
                    <div className="overflow-hidden relative">
                      {en.courses.thumbnail_url && (
                        <img src={en.courses.thumbnail_url} alt={en.courses.title} className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-300" />
                      )}
                      {isComplete && (
                        <div className="absolute inset-0 bg-green-500/10 flex items-center justify-center">
                          <div className="bg-green-500 text-white p-2.5 rounded-xl shadow-lg">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                        </div>
                      )}
                      {!isComplete && pct > 0 && (
                        <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full">
                          {pct}%
                        </div>
                      )}
                    </div>

                    <div className="p-3 space-y-2.5">
                      <h3 className="font-bold text-sm line-clamp-2 group-hover:text-primary transition-colors leading-snug">{en.courses.title}</h3>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>Paid {formatPriceINR(en.amount_paid_inr)}</span>
                        {en.promocode && en.promocode !== 'ADMIN_GRANT' && (
                          <>
                            <span className="text-border">·</span>
                            <span className="font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded">{en.promocode}</span>
                          </>
                        )}
                      </div>

                      <div>
                        <div className="h-[5px] w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{
                              width: `${pct}%`,
                              background: isComplete ? '#22C55E' : pct > 0 ? '#3B82F6' : '#E5E7EB',
                              boxShadow: pct > 0 ? `0 0 8px ${isComplete ? '#22c55e40' : '#3b82f640'}` : 'none',
                            }}
                          />
                        </div>
                        <div className="flex justify-between mt-1.5">
                          <span className={cn(
                            "text-[10px] font-semibold",
                            isComplete ? "text-green-600" : pct > 0 ? "text-primary" : "text-muted-foreground/50",
                          )}>
                            {getCourseMotivation(pct)}
                          </span>
                          <span className={cn(
                            "text-[10px] font-bold tabular-nums",
                            isComplete ? "text-green-500" : pct > 0 ? "text-primary" : "text-muted-foreground/50",
                          )}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── PROMOCODE HISTORY ─── */}
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

      {/* ─── BADGES ─── */}
      <section>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Award className="w-5 h-5 text-primary" /> Badges Earned ({badges.length})</h2>
        {badges.length === 0 ? (
          <Card className="p-8 text-center bg-card border-border/50">
            <Award className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground text-sm">No badges yet — keep learning to earn your first one!</p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {badges.map((b: any) => (
              <Card key={b.id} className="p-4 text-center bg-card border-border hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-amber-500/5 to-transparent pointer-events-none" />
                <div className="relative z-10">
                  <div className="w-14 h-14 mx-auto rounded-full bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-800/10 border border-amber-200 dark:border-amber-700/30 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-sm">
                    <Award className="w-7 h-7 text-amber-500" />
                  </div>
                  <h4 className="font-bold text-sm">{b.badges.name}</h4>
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{b.badges.description}</p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <GlobalLeaderboardDialog open={lbOpen} onOpenChange={setLbOpen} />
    </div>
  );
};

/* ════════════════════════════════════════════════════════
   STAT CARD COMPONENT
   ════════════════════════════════════════════════════════ */
const StatCard = ({ icon: Icon, label, value, gradient, iconBg }: any) => (
  <Card className="p-3 sm:p-4 bg-card border-border hover:shadow-sm transition-shadow relative overflow-hidden group">
    <div className={cn("absolute inset-0 bg-gradient-to-br opacity-[0.04] group-hover:opacity-[0.08] transition-opacity", gradient)} />
    <div className="relative z-10">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-2", iconBg)}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-[11px] text-muted-foreground mt-0.5 font-medium">{label}</div>
    </div>
  </Card>
);

export default Dashboard;