import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, LayoutDashboard, Trophy, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import GlobalLeaderboardDialog from './GlobalLeaderboardDialog';

export default function TabMobileNavbar() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [lbOpen, setLbOpen] = useState(false);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [initials, setInitials] = useState('U');

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  useEffect(() => {
    if (!user) {
      setAvatarUrl(null);
      setInitials('U');
      return;
    }

    const fetchAvatar = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        if (data.avatar_url) {
          const url = data.avatar_url.startsWith('http')
            ? data.avatar_url
            : supabase.storage.from('avatars').getPublicUrl(data.avatar_url).data?.publicUrl;
          setAvatarUrl(url || null);
        } else {
          setAvatarUrl(null);
        }
        const name =
          data.display_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.display_name ||
          user.email?.split('@')[0] ||
          'User';
        setInitials(name.slice(0, 2).toUpperCase());
      }
    };

    fetchAvatar();

    const ch = supabase
      .channel(`bnav-avatar-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new) {
            const d = payload.new as any;
            if (d.avatar_url) {
              const url = d.avatar_url.startsWith('http')
                ? d.avatar_url
                : supabase.storage.from('avatars').getPublicUrl(d.avatar_url).data?.publicUrl;
              setAvatarUrl(url || null);
            } else {
              setAvatarUrl(null);
            }
            setAvatarError(false);
            const name =
              d.display_name ||
              user.user_metadata?.full_name ||
              user.user_metadata?.display_name ||
              user.email?.split('@')[0] ||
              'User';
            setInitials(name.slice(0, 2).toUpperCase());
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [user]);

  const handlePointerDown = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      setLogoutConfirm(true);
    }, 2000);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleAvatarClick = useCallback(() => {
    if (isLongPress.current) {
      isLongPress.current = false;
      return;
    }
    navigate('/profile');
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    setLogoutConfirm(false);
    try {
      await signOut();
      navigate('/');
    } catch (e) {
      console.error(e);
    }
  }, [signOut, navigate]);

  /* ── Conditional returns AFTER all hooks ── */
  if (!user) return null;

  const path = location.pathname;
  const isWhitelisted =
    path === '/study' ||
    path.startsWith('/study/') ||
    path === '/dashboard' ||
    path.startsWith('/dashboard/') ||
    path === '/profile' ||
    path.startsWith('/profile/') ||
    path.startsWith('/test/') ||
    path.startsWith('/learn/');

  if (!isWhitelisted) return null;

  const items = [
    {
      key: 'study',
      label: 'Study',
      to: '/study',
      active: path === '/study' || path.startsWith('/study/'),
      icon: BookOpen,
    },
    {
      key: 'dashboard',
      label: 'Dashboard',
      to: '/dashboard',
      active: path === '/dashboard' || path.startsWith('/dashboard/'),
      icon: LayoutDashboard,
    },
    {
      key: 'leaderboard',
      label: 'Ranks',
      to: '#',
      active: false,
      icon: Trophy,
      onClick: () => setLbOpen(true),
    },
  ];

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-border/60 bg-card/80 backdrop-blur-xl">
        <div
          className="flex items-end justify-around px-1 pt-1.5 pb-2"
          style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick || (() => navigate(item.to))}
              className={cn(
                'relative flex flex-col items-center gap-[3px] min-w-[60px] max-w-[80px] py-1 rounded-xl transition-all duration-200',
                item.active
                  ? 'text-primary'
                  : 'text-muted-foreground/60 active:text-muted-foreground',
              )}
            >
              {item.active && (
                <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
              <item.icon
                className="w-[22px] h-[22px] transition-all duration-200"
                strokeWidth={item.active ? 2.2 : 1.5}
              />
              <span
                className={cn(
                  'text-[10px] leading-none transition-all duration-200',
                  item.active ? 'font-semibold' : 'font-medium',
                )}
              >
                {item.label}
              </span>
            </button>
          ))}

          <button
            type="button"
            onClick={handleAvatarClick}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onContextMenu={(e) => e.preventDefault()}
            className={cn(
              'relative flex flex-col items-center gap-[3px] min-w-[60px] max-w-[80px] py-1 rounded-xl transition-all duration-200',
              path === '/profile' || path.startsWith('/profile/')
                ? 'text-primary'
                : 'text-muted-foreground/60 active:text-muted-foreground',
            )}
          >
            {path === '/profile' || path.startsWith('/profile/') ? (
              <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
            ) : null}
            <div
              className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center overflow-hidden transition-all duration-200',
                path === '/profile' || path.startsWith('/profile/')
                  ? 'ring-2 ring-primary/30 ring-offset-1 ring-offset-card'
                  : 'bg-muted',
              )}
            >
              {avatarUrl && !avatarError ? (
                <img
                  src={avatarUrl}
                  alt="Profile"
                  className="h-full w-full object-cover"
                  onError={() => setAvatarError(true)}
                />
              ) : (
                <span className="text-[9px] font-bold leading-none">{initials}</span>
              )}
            </div>
            <span
              className={cn(
                'text-[10px] leading-none transition-all duration-200',
                path === '/profile' || path.startsWith('/profile/')
                  ? 'font-semibold'
                  : 'font-medium',
              )}
            >
              Profile
            </span>
          </button>
        </div>
      </nav>

      {logoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setLogoutConfirm(false)} />
          <div className="relative bg-card rounded-2xl border border-border p-5 w-full max-w-xs shadow-xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-3">
                <LogOut className="w-5 h-5 text-destructive" />
              </div>
              <h3 className="text-sm font-bold text-foreground mb-1">Sign out?</h3>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                You'll need to sign in again to access your courses and progress.
              </p>
              <div className="flex w-full gap-2">
                <button
                  type="button"
                  onClick={() => setLogoutConfirm(false)}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 h-10 rounded-xl bg-destructive text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <GlobalLeaderboardDialog open={lbOpen} onOpenChange={setLbOpen} />
    </>
  );
}