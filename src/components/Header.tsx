import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GraduationCap, User, LogOut, Shield, Trophy, Gift, ShoppingBag, Menu, X, LayoutDashboard } from 'lucide-react';
import GlobalLeaderboardDialog from './GlobalLeaderboardDialog';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from './ThemeToggle';
import GamifyChip from './GamifyChip';
import AnnouncementBell from './AnnouncementBell';
import { cn } from '@/lib/utils';

interface ProfileData {
  display_name: string | null;
  avatar_url: string | null;
}

const HeaderContent = ({ pathname }: { pathname: string }) => {
  const { user, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      return;
    }

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setProfile(data);
      }
    };

    fetchProfile();

    const channel = supabase
      .channel(`header-profile-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) {
            setProfile({
              display_name: payload.new.display_name,
              avatar_url: payload.new.avatar_url,
            });
            setAvatarError(false);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    setAvatarError(false);
  }, [profile?.avatar_url]);

  const getAvatarUrl = (): string | null => {
    if (!profile?.avatar_url) return null;
    if (profile.avatar_url.startsWith('http')) return profile.avatar_url;
    
    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(profile.avatar_url);
    
    return data?.publicUrl || null;
  };

  const getDisplayName = (): string => {
    if (profile?.display_name) return profile.display_name;
    if (user?.user_metadata?.full_name) return user.user_metadata.full_name;
    if (user?.user_metadata?.display_name) return user.user_metadata.display_name;
    if (user?.email) return user.email.split('@')[0];
    return 'User';
  };

  const avatarUrl = getAvatarUrl();
  const displayName = getDisplayName();

  const navLinks = [
    { to: '/courses', label: 'Courses' },
    ...(user ? [{ to: '/dashboard', label: 'Dashboard' }] : []),
    ...(user ? [{ to: '/study', label: 'My Learning' }] : []),
    ...(user ? [{ to: '/rewards', label: 'Rewards' }] : []),
    ...(user ? [{ to: '/refer', label: 'Refer' }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background overflow-hidden">
      <div className="mx-auto max-w-7xl flex h-14 items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-bold text-base sm:text-lg shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center overflow-hidden">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="hidden sm:inline truncate">LearnHub</span>
        </Link>

        <nav className="hidden md:flex items-center h-14">
          {navLinks.map((l) => {
            const isActive = pathname === l.to || pathname.startsWith(l.to + '/');
            return (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  "relative px-4 h-14 flex items-center text-sm font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {l.label}
                <span
                  className={cn(
                    "absolute bottom-0 left-4 right-4 h-[2px] rounded-full bg-primary transition-all duration-300 origin-left",
                    isActive ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0 hover:scale-x-100 hover:opacity-100"
                  )}
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {user && <GamifyChip />}
          {user && <AnnouncementBell />}
          <ThemeToggle />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button 
                  className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors overflow-hidden ring-2 ring-transparent hover:ring-primary/30"
                  aria-label="User menu"
                >
                  {avatarUrl && !avatarError ? (
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                      onError={() => setAvatarError(true)}
                    />
                  ) : (
                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                      {displayName.slice(0, 2)}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 overflow-hidden rounded-xl border border-border bg-card p-1.5">
                <div className="flex items-center gap-3 px-2.5 py-2.5">
                  <div className="h-10 w-10 rounded-full bg-muted shrink-0 overflow-hidden flex items-center justify-center">
                    {avatarUrl && !avatarError ? (
                      <img
                        src={avatarUrl}
                        alt={displayName}
                        className="h-full w-full object-cover"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <span className="text-sm font-semibold text-muted-foreground uppercase">
                        {displayName.slice(0, 2)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate leading-tight">{displayName}</p>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{user.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator className="-mx-1.5" />
                <DropdownMenuItem onClick={() => nav('/dashboard')} className="rounded-lg gap-3 px-2.5 py-2 cursor-pointer">
                  <LayoutDashboard className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">Dashboard</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/study')} className="rounded-lg gap-3 px-2.5 py-2 cursor-pointer">
                  <Trophy className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">My Learning</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLbOpen(true)} className="rounded-lg gap-3 px-2.5 py-2 cursor-pointer">
                  <Trophy className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">Leaderboard</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/profile')} className="rounded-lg gap-3 px-2.5 py-2 cursor-pointer">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/rewards')} className="rounded-lg gap-3 px-2.5 py-2 cursor-pointer">
                  <ShoppingBag className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">Rewards Shop</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/refer')} className="rounded-lg gap-3 px-2.5 py-2 cursor-pointer">
                  <Gift className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">Refer & Earn</span>
                </DropdownMenuItem>
                {isAdmin && (
                  <>
                    <DropdownMenuSeparator className="-mx-1.5" />
                    <DropdownMenuItem onClick={() => nav('/admin')} className="rounded-lg gap-3 px-2.5 py-2 cursor-pointer">
                      <Shield className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-sm">Admin Panel</span>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator className="-mx-1.5" />
                <DropdownMenuItem onClick={signOut} className="rounded-lg gap-3 px-2.5 py-2 cursor-pointer focus:bg-destructive/10 focus:text-destructive">
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span className="text-sm">Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" className="hidden md:inline-flex h-9 px-4 rounded-lg overflow-hidden">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}

          {!user && (
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden h-9 w-9 rounded-lg hover:bg-muted flex items-center justify-center transition-colors overflow-hidden"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <AnimatePresence>
        {!user && mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/60 md:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              className="fixed top-0 right-0 z-50 h-full w-[80%] max-w-xs bg-card border-l border-border overflow-hidden md:hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <span className="font-bold">Menu</span>
                <button onClick={() => setMobileOpen(false)} className="h-8 w-8 rounded-lg hover:bg-muted flex items-center justify-center overflow-hidden">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto overflow-x-hidden">
                {navLinks.map((l, i) => (
                  <motion.div
                    key={l.to}
                    initial={{ opacity: 0, x: 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 + i * 0.04 }}
                  >
                    <Link
                      to={l.to}
                      className="block px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      {l.label}
                    </Link>
                  </motion.div>
                ))}
                <div className="pt-2">
                  <Link
                    to="/auth"
                    className="block px-3 py-2.5 rounded-lg text-sm font-medium bg-primary text-primary-foreground text-center overflow-hidden"
                  >
                    Sign in
                  </Link>
                </div>
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {user && <GlobalLeaderboardDialog open={lbOpen} onOpenChange={setLbOpen} />}
    </header>
  );
};

const Header = () => {
  const loc = useLocation();
  if (loc.pathname.startsWith('/learn/') || loc.pathname.startsWith('/admin')) return null;
  return <HeaderContent pathname={loc.pathname} />;
};

export default Header;