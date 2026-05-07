import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GraduationCap, User, LogOut, Shield, Trophy, Gift, ShoppingBag, Menu, X, BookOpen, LayoutDashboard } from 'lucide-react';
import GlobalLeaderboardDialog from './GlobalLeaderboardDialog';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeToggle from './ThemeToggle';
import GamifyChip from './GamifyChip';
import AnnouncementBell from './AnnouncementBell';

const Header = () => {
  const { user, isAdmin, signOut } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [loc.pathname]);

  const navLinks = [
    { to: '/courses', label: 'Courses', icon: BookOpen },
    ...(user ? [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
    ...(user ? [{ to: '/study', label: 'My Learning', icon: Trophy }] : []),
    ...(user ? [{ to: '/rewards', label: 'Rewards', icon: ShoppingBag }] : []),
    ...(user ? [{ to: '/refer', label: 'Refer', icon: Gift }] : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-14 items-center justify-between px-3 sm:px-4 mx-auto max-w-7xl">
        <Link to="/" className="flex items-center gap-2 font-bold text-base sm:text-lg">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-primary-foreground" />
          </div>
          <span>LearnHub</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(l => (
            <Button key={l.to} asChild variant="ghost" size="sm">
              <Link to={l.to}>{l.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          {user && <GamifyChip />}
          {user && <AnnouncementBell />}
          <ThemeToggle />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <User className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => nav('/dashboard')}><LayoutDashboard className="w-4 h-4 mr-2" /> Dashboard</DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/study')}><Trophy className="w-4 h-4 mr-2" /> My Learning</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLbOpen(true)}><Trophy className="w-4 h-4 mr-2" /> Leaderboard</DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/profile')}><User className="w-4 h-4 mr-2" /> Profile</DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/rewards')}><ShoppingBag className="w-4 h-4 mr-2" /> Rewards Shop</DropdownMenuItem>
                <DropdownMenuItem onClick={() => nav('/refer')}><Gift className="w-4 h-4 mr-2" /> Refer & Earn</DropdownMenuItem>
                {isAdmin && <><DropdownMenuSeparator /><DropdownMenuItem onClick={() => nav('/admin')}><Shield className="w-4 h-4 mr-2" /> Admin</DropdownMenuItem></>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}><LogOut className="w-4 h-4 mr-2" /> Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" className="hidden md:inline-flex"><Link to="/auth">Sign in</Link></Button>
          )}

          <button onClick={() => setMobileOpen(true)} className="md:hidden h-9 w-9 rounded-md hover:bg-secondary flex items-center justify-center" aria-label="Open menu">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={() => setMobileOpen(false)} />
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              className="fixed top-0 right-0 z-50 h-full w-[80%] max-w-xs bg-card border-l border-border md:hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <span className="font-bold">Menu</span>
                <button onClick={() => setMobileOpen(false)} className="h-8 w-8 rounded hover:bg-secondary flex items-center justify-center"><X className="w-4 h-4" /></button>
              </div>
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navLinks.map((l, i) => (
                  <motion.div key={l.to} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.04 }}>
                    <Link to={l.to} className="flex items-center gap-3 px-3 py-2.5 rounded text-sm hover:bg-secondary">
                      <l.icon className="w-4 h-4" /> {l.label}
                    </Link>
                  </motion.div>
                ))}
                {!user && <Link to="/auth" className="flex items-center gap-3 px-3 py-2.5 rounded text-sm bg-primary text-primary-foreground"><User className="w-4 h-4" /> Sign in</Link>}
                {isAdmin && <Link to="/admin" className="flex items-center gap-3 px-3 py-2.5 rounded text-sm hover:bg-secondary"><Shield className="w-4 h-4" /> Admin</Link>}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      {user && <GlobalLeaderboardDialog open={lbOpen} onOpenChange={setLbOpen} />}
    </header>
  );
};

export default Header;
