import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  GraduationCap, Trophy, Zap, Users, BookOpen, Award,
  ChevronLeft, ChevronRight, ChevronDown, Star, Play,
  ArrowRight, Flame, Target, ShieldCheck, TrendingUp,
  Clock, CheckCircle2, Sparkles, XCircle, X, Smartphone,
  Monitor, Download, Menu, BookMarked, FileText, LayoutGrid,
  Info, GraduationCapIcon
} from 'lucide-react';
import { useSEO } from '@/lib/seo';

/* ═══════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════ */
const cn = (...cls: (string | false | undefined | null)[]) =>
  cls.filter(Boolean).join(' ');

type Platform = 'android' | 'ios' | 'windows' | 'mac' | 'other';

function getPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent || (navigator as any).platform || '';
  if (/android/i.test(ua)) return 'android';
  if (/iPad|iPhone|iPod/.test(ua) || ((navigator as any).platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Win/i.test(ua)) return 'windows';
  if (/Mac/i.test(ua)) return 'mac';
  return 'other';
}

function isMobilePlatform(): boolean {
  const p = getPlatform();
  return p === 'android' || p === 'ios';
}

/* ═══════════════════════════════════════════
   DATA
   ═══════════════════════════════════════════ */
const NAV_ITEMS = [
  {
    id: 'courses',
    label: 'Courses',
    submenu: [
      { label: 'Physics', to: '/courses?subject=physics', icon: Zap },
      { label: 'Chemistry', to: '/courses?subject=chemistry', icon: BookOpen },
      { label: 'Mathematics', to: '/courses?subject=maths', icon: LayoutGrid },
      { label: 'All Courses', to: '/courses', icon: BookMarked },
    ],
  },
  { id: 'features', label: 'Features', hash: '#features' },
  {
    id: 'resources',
    label: 'Resources',
    submenu: [
      { label: 'Blog', to: '/blog', icon: FileText },
      { label: 'Free Study Material', to: '/resources/free', icon: BookOpen },
      { label: 'Previous Year Papers', to: '/resources/pyq', icon: FileText },
      { label: 'Formula Sheets', to: '/resources/formulas', icon: LayoutGrid },
    ],
  },
  { id: 'educators', label: 'Educators', hash: '#educators' },
  { id: 'pricing', label: 'Pricing', to: '/pricing' },
  {
    id: 'more',
    label: 'More',
    submenu: [
      { label: 'About Us', to: '/about', icon: Info },
      { label: 'Careers', to: '/careers', icon: Users },
      { label: 'Contact Us', to: '/contact', icon: FileText },
      { label: 'Help Center', to: '/help', icon: Sparkles },
    ],
  },
];

const HERO_SLIDES = [
  { image: 'https://picsum.photos/seed/jeelabf/1400/700.jpg', tag: 'JEE Advanced 2025', title: 'Your JEE journey\nstarts here', sub: 'Structured learning paths designed by IITians with 15+ years of teaching experience.' },
  { image: 'https://picsum.photos/seed/physclsf/1400/700.jpg', tag: 'Physics Masterclass', title: 'Understand Physics,\ndon\'t memorise it', sub: 'Visual experiments, concept-first approach, and 2000+ practice problems.' },
  { image: 'https://picsum.photos/seed/mathbrdf/1400/700.jpg', title: 'Maths made\nbeautifully simple', tag: 'Mathematics', sub: 'From algebra to calculus — every theorem explained with intuition and rigour.' },
  { image: 'https://picsum.photos/seed/chembkf/1400/700.jpg', title: 'Chemistry that\nactually clicks', tag: 'Chemistry', sub: 'Organic mechanisms, inorganic trends, and physical chemistry — all in one place.' },
];

const STATS = [
  { value: '50,000+', label: 'Active Students' },
  { value: '200+', label: 'Video Courses' },
  { value: '95%', label: 'Success Rate' },
  { value: '4.9★', label: 'App Rating' },
];

const COURSES = [
  { image: 'https://picsum.photos/seed/mechphf/600/340.jpg', title: 'Mechanics — Complete JEE Course', educator: 'Prof. Arun Sharma', lessons: 86, duration: '42 hrs', rating: 4.9, students: 12400, tag: 'Physics', tagColor: 'bg-blue-500/20 text-blue-400' },
  { image: 'https://picsum.photos/seed/orgchf/600/340.jpg', title: 'Organic Chemistry Masterclass', educator: 'Dr. Priya Verma', lessons: 72, duration: '38 hrs', rating: 4.8, students: 9800, tag: 'Chemistry', tagColor: 'bg-green-500/20 text-green-400' },
  { image: 'https://picsum.photos/seed/calcf/600/340.jpg', title: 'Calculus for JEE Advanced', educator: 'Rahul Iyer', lessons: 64, duration: '35 hrs', rating: 4.9, students: 11200, tag: 'Maths', tagColor: 'bg-purple-500/20 text-purple-400' },
  { image: 'https://picsum.photos/seed/elecf/600/340.jpg', title: 'Electrodynamics & Optics', educator: 'Prof. Arun Sharma', lessons: 58, duration: '30 hrs', rating: 4.7, students: 8600, tag: 'Physics', tagColor: 'bg-blue-500/20 text-blue-400' },
  { image: 'https://picsum.photos/seed/inorgf/600/340.jpg', title: 'Inorganic Chemistry — Shortcuts', educator: 'Dr. Priya Verma', lessons: 45, duration: '22 hrs', rating: 4.8, students: 7400, tag: 'Chemistry', tagColor: 'bg-green-500/20 text-green-400' },
  { image: 'https://picsum.photos/seed/algbf/600/340.jpg', title: 'Algebra & Coordinate Geometry', educator: 'Rahul Iyer', lessons: 70, duration: '36 hrs', rating: 4.9, students: 10100, tag: 'Maths', tagColor: 'bg-purple-500/20 text-purple-400' },
];

const EDUCATORS = [
  { image: 'https://picsum.photos/seed/arunfc/200/200.jpg', name: 'Prof. Arun Sharma', subject: 'Physics', bio: 'IIT-Bombay \'08. 15 yrs teaching JEE Physics. 2000+ students with AIR <100.', students: '12,400' },
  { image: 'https://picsum.photos/seed/priyfc/200/200.jpg', name: 'Dr. Priya Verma', subject: 'Chemistry', bio: 'PhD IIT-Delhi. Known for organic chemistry shortcuts and visual teaching.', students: '9,800' },
  { image: 'https://picsum.photos/seed/rahfc/200/200.jpg', name: 'Rahul Iyer', subject: 'Mathematics', bio: 'IIT-Madras \'12. Makes calculus intuitive. 1800+ top-100 selections.', students: '11,200' },
];

const TESTIMONIALS = [
  { image: 'https://picsum.photos/seed/st1f/80/80.jpg', name: 'Aditya R.', text: 'LearnHub\'s structured approach changed everything. Went from 120 marks to 280 in JEE Mains in just 6 months.', rating: 5, tag: 'AIR 347 — JEE Advanced 2024' },
  { image: 'https://picsum.photos/seed/st2f/80/80.jpg', name: 'Sneha P.', text: 'The streak system and XP kept me motivated through tough months. Best investment my parents made.', rating: 5, tag: 'AIR 512 — JEE Advanced 2024' },
  { image: 'https://picsum.photos/seed/st3f/80/80.jpg', name: 'Rohan K.', text: 'Prof. Arun\'s mechanics course is legendary. Every concept felt like a story, not a formula.', rating: 5, tag: 'AIR 89 — JEE Advanced 2024' },
  { image: 'https://picsum.photos/seed/st4f/80/80.jpg', name: 'Meera J.', text: 'I loved the badge system. Getting the "Calculus King" badge after finishing the course felt amazing!', rating: 5, tag: 'AIR 210 — JEE Advanced 2024' },
  { image: 'https://picsum.photos/seed/st5f/80/80.jpg', name: 'Vikram S.', text: 'The refer & earn program got my whole friend group on LearnHub. We competed on the leaderboard daily.', rating: 5, tag: 'AIR 156 — JEE Advanced 2024' },
];

const FEATURES = [
  { icon: BookOpen, title: 'Structured Courses', desc: 'Subjects → Chapters → Parts. A clear roadmap so you never feel lost.' },
  { icon: Trophy, title: 'Earn XP & Badges', desc: 'Level up as you learn. Unlock 30+ badges and compete on the leaderboard.' },
  { icon: Flame, title: 'Daily Streaks', desc: 'Build an unbreakable study habit. Don\'t break the chain!' },
  { icon: Award, title: 'Coins & Rewards', desc: 'Redeem coins for mock tests, merch, and more.' },
  { icon: GraduationCap, title: 'Top Faculty', desc: 'IITians with 15+ years of JEE coaching experience.' },
  { icon: Users, title: 'Refer & Earn', desc: 'Both you and your friend get 20% off. Stack rewards!' },
  { icon: Target, title: 'Mock Tests & Analytics', desc: 'Full-length JEE mocks with detailed performance breakdowns.' },
  { icon: ShieldCheck, title: 'Certified Completion', desc: 'Get a verifiable certificate for every completed course.' },
  { icon: TrendingUp, title: 'Adaptive Difficulty', desc: 'Questions adapt to your level — basics to Olympiad-tier.' },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Sign up free', desc: 'Create your account in 30 seconds. No credit card needed.', icon: Sparkles },
  { step: '02', title: 'Pick a course', desc: 'Browse structured JEE courses by subject and difficulty.', icon: BookOpen },
  { step: '03', title: 'Learn & earn XP', desc: 'Watch lessons, solve problems, build streaks, unlock badges.', icon: Zap },
  { step: '04', title: 'Crack the exam', desc: 'Track progress with analytics. Walk in confident.', icon: Trophy },
];

const FOOTER_LINKS = {
  quick: [
    { label: 'Courses', to: '/courses' },
    { label: 'Pricing', to: '/pricing' },
    { label: 'About Us', to: '/about' },
    { label: 'Careers', to: '/careers' },
  ],
  support: [
    { label: 'Help Center', to: '/help' },
    { label: 'Contact Us', to: '/contact' },
    { label: 'FAQs', to: '/faqs' },
    { label: 'Privacy Policy', to: '/privacy' },
  ],
  legal: [
    { label: 'Terms of Service', to: '/terms' },
    { label: 'Privacy Policy', to: '/privacy' },
    { label: 'Cookie Policy', to: '/cookies' },
    { label: 'Refund Policy', to: '/refund' },
  ],
};

/* ═══════════════════════════════════════════
   CAROUSEL HOOK
   ═══════════════════════════════════════════ */
function useCarousel(length: number, interval = 5000) {
  const [idx, setIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPaused = useRef(false);
  const next = useCallback(() => setIdx(i => (i + 1) % length), [length]);
  const prev = useCallback(() => setIdx(i => (i - 1 + length) % length), [length]);
  const start = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => { if (!isPaused.current) next(); }, interval);
  }, [next, interval]);
  useEffect(() => { start(); return () => { if (timerRef.current) clearInterval(timerRef.current); }; }, [start]);
  const pause = useCallback(() => { isPaused.current = true; }, []);
  const resume = useCallback(() => { isPaused.current = false; }, []);
  return { idx, next, prev, setIdx, pause, resume };
}

/* ═══════════════════════════════════════════
   AUTO APP POPUP
   ═══════════════════════════════════════════ */
function AutoAppPopup({ onOpenApp }: { onOpenApp: () => void }) {
  const [open, setOpen] = useState(false);
  const mobile = useRef(isMobilePlatform());
  const platform = useRef(getPlatform());
  const hasShown = useRef(false);

  useEffect(() => {
    if (hasShown.current) return;
    if (sessionStorage.getItem('lh_app_popup_shown')) return;

    const show = () => {
      if (hasShown.current) return;
      hasShown.current = true;
      sessionStorage.setItem('lh_app_popup_shown', '1');
      setOpen(true);
    };

    const scrollHandler = () => {
      if (window.scrollY > 400) show();
    };
    const timer = setTimeout(show, 3000);

    window.addEventListener('scroll', scrollHandler, { passive: true });
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', scrollHandler);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  const p = platform.current;
  const isMob = mobile.current;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
        style={{ animation: 'fadeUp .35s ease-out both' }}
      >
        <button onClick={() => setOpen(false)} className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition">
          <X className="w-4 h-4" />
        </button>

        {/* preview image */}
        <div className="relative h-40 sm:h-48 bg-muted overflow-hidden">
          <img src={isMob ? 'https://picsum.photos/seed/learnhubmob/600/400.jpg' : 'https://picsum.photos/seed/learnhubdesk/800/400.jpg'} alt="LearnHub App" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
        </div>

        <div className="px-6 pb-6 -mt-6 relative">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/25">
            <GraduationCap className="w-7 h-7 text-primary-foreground" />
          </div>

          <h3 className="text-lg font-bold mb-1">
            {isMob ? 'Open LearnHub App' : 'Get LearnHub Desktop'}
          </h3>
          <p className="text-sm text-muted-foreground mb-5">
            {p === 'android' && 'Open in Google Play for the best experience on your Android device.'}
            {p === 'ios' && 'Open in App Store for the best experience on your iPhone or iPad.'}
            {p === 'windows' && 'Download the LearnHub desktop app for Windows.'}
            {p === 'mac' && 'Download the LearnHub desktop app for macOS.'}
            {p === 'other' && 'Download the LearnHub app for your device.'}
          </p>

          <div className="flex flex-col gap-2.5 mb-3">
            {/* Mobile buttons */}
            {isMob && (
              <>
                {p === 'android' && (
                  <a href="https://play.google.com/store/apps/details?id=com.learnhub.app" target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition active:scale-[0.98]">
                    <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M17.523 15.341a.996.996 0 0 0 0-1.992.996.996 0 0 0 0 1.992zm-11.046 0a.996.996 0 0 0 0-1.992.996.996 0 0 0 0 1.992zM17.94 8.5l1.8-3.12a.375.375 0 0 0-.65-.374l-1.824 3.16C15.742 7.614 14.018 7.082 12 7.082s-3.742.532-5.266 1.084L4.91 5.006a.375.375 0 0 0-.65.374L6.06 8.5C2.72 10.124.428 13.582 0 17.624h24c-.428-4.042-2.72-7.5-6.06-9.124z" fill="currentColor"/></svg>
                    Open in Google Play
                  </a>
                )}
                {p === 'ios' && (
                  <a href="https://apps.apple.com/app/learnhub/id1234567890" target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition active:scale-[0.98]">
                    <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill="currentColor"/></svg>
                    Open in App Store
                  </a>
                )}
              </>
            )}

            {/* Desktop buttons */}
            {!isMob && (
              <>
                {p === 'windows' && (
                  <a href="https://apps.microsoft.com/store/detail/learnhub/9N1234567890" target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition active:scale-[0.98]">
                    <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M3 12V6.75l6-1.32v6.48L3 12zm17-9v8.75l-10 .08V5.21L20 3zm-10 9.32l10 .1V21l-10-1.76v-8.92zM3 12.25l6 .09v6.81l-6-1.15v-5.75z" fill="currentColor"/></svg>
                    Open in Microsoft Store
                  </a>
                )}
                {p === 'mac' && (
                  <a href="https://apps.apple.com/app/learnhub-mac/id1234567890" target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition active:scale-[0.98]">
                    <svg viewBox="0 0 24 24" className="w-5 h-5"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill="currentColor"/></svg>
                    Download for Mac
                  </a>
                )}
                {p === 'other' && (
                  <a href="https://learnhub.app/download" target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2.5 w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition active:scale-[0.98]">
                    <Download className="w-4 h-4" />
                    Get the App
                  </a>
                )}
              </>
            )}
          </div>

          <button onClick={() => setOpen(false)} className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition rounded-lg hover:bg-muted">
            Continue on Web
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   HOME HEADER (replaces global nav)
   ═══════════════════════════════════════════ */
function HomeHeader({ onOpenApp }: { onOpenApp: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSub, setOpenSub] = useState<string | null>(null);
  const location = useLocation();

  /* scroll state for header bg */
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  /* close menu on route change */
  useEffect(() => { setMenuOpen(false); setOpenSub(null); }, [location.pathname]);

  /* lock body when menu open */
  useEffect(() => {
    if (menuOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const handleHash = (hash: string) => {
    setMenuOpen(false);
    setOpenSub(null);
    const el = document.querySelector(hash);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const toggleSub = (id: string) => setOpenSub(prev => prev === id ? null : id);

  return (
    <>
      <header
        data-home-header
        className={cn(
          'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
          scrolled
            ? 'bg-background/90 backdrop-blur-xl border-b border-border shadow-sm'
            : 'bg-transparent',
        )}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* logo */}
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
              </div>
              <span className={cn('font-bold text-lg transition-colors', scrolled ? 'text-foreground' : 'text-white')}>
                LearnHub
              </span>
            </Link>

            {/* desktop nav */}
            <nav className="hidden lg:flex items-center gap-0.5">
              {NAV_ITEMS.map(item => (
                item.submenu ? (
                  <div key={item.id} className="relative group">
                    <button
                      className={cn(
                        'flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                        scrolled
                          ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                          : 'text-white/80 hover:text-white hover:bg-white/10',
                      )}
                    >
                      {item.label}
                      <ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 group-hover:rotate-180" />
                    </button>
                    <div className="absolute top-full left-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                      <div className="bg-card border border-border rounded-xl shadow-xl p-1.5 min-w-[200px]">
                        {item.submenu.map(sub => (
                          <Link
                            key={sub.label}
                            to={sub.to}
                            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <sub.icon className="w-4 h-4 text-primary/70" />
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <button
                    key={item.id}
                    onClick={() => item.hash ? handleHash(item.hash) : null}
                    className={cn(
                      'px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                      scrolled
                        ? 'text-muted-foreground hover:text-foreground hover:bg-muted'
                        : 'text-white/80 hover:text-white hover:bg-white/10',
                    )}
                  >
                    {item.to ? (
                      <Link to={item.to} className="inherit">{item.label}</Link>
                    ) : (
                      item.label
                    )}
                  </button>
                )
              ))}
            </nav>

            {/* desktop actions */}
            <div className="hidden lg:flex items-center gap-2">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className={cn(
                  'text-sm font-medium',
                  scrolled ? 'text-muted-foreground hover:text-foreground' : 'text-white/90 hover:text-white hover:bg-white/10',
                )}
              >
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button
                size="sm"
                className="text-sm gap-1.5"
                onClick={onOpenApp}
              >
                {isMobilePlatform() ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                Get App
              </Button>
            </div>

            {/* mobile hamburger */}
            <button
              onClick={() => setMenuOpen(true)}
              className={cn(
                'lg:hidden p-2 rounded-lg transition-colors',
                scrolled ? 'text-foreground hover:bg-muted' : 'text-white hover:bg-white/10',
              )}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ─── MOBILE / TABLET MENU PANEL ─── */}
      <div
        className={cn(
          'fixed inset-0 z-[55] lg:hidden transition-all duration-300',
          menuOpen ? 'visible' : 'invisible pointer-events-none',
        )}
      >
        {/* overlay */}
        <div
          className={cn(
            'absolute inset-0 bg-black/50 transition-opacity duration-300',
            menuOpen ? 'opacity-100' : 'opacity-0',
          )}
          onClick={() => setMenuOpen(false)}
        />

        {/* panel */}
        <div
          className={cn(
            'absolute top-0 right-0 bottom-0 w-[85%] max-w-[360px] bg-card border-l border-border flex flex-col transition-transform duration-300 ease-out',
            menuOpen ? 'translate-x-0' : 'translate-x-full',
          )}
        >
          {/* panel header */}
          <div className="flex items-center justify-between px-5 h-14 border-b border-border shrink-0">
            <span className="font-bold text-lg">Menu</span>
            <button onClick={() => setMenuOpen(false)} className="p-2 rounded-lg hover:bg-muted transition" aria-label="Close menu">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* panel body */}
          <div className="flex-1 overflow-y-auto py-3 px-3 -mx-3">
            {/* auth buttons */}
            <div className="flex flex-col gap-2 px-2 mb-4">
              <Button asChild variant="outline" size="sm" className="w-full justify-center">
                <Link to="/auth">Sign In</Link>
              </Button>
              <Button size="sm" className="w-full justify-center gap-1.5" onClick={() => { setMenuOpen(false); onOpenApp(); }}>
                {isMobilePlatform() ? <Smartphone className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                Get App
              </Button>
            </div>

            <div className="h-px bg-border mb-3" />

            {/* nav items with accordion submenus */}
            <div className="space-y-0.5">
              {NAV_ITEMS.map(item => (
                <div key={item.id}>
                  {item.submenu ? (
                    <>
                      <button
                        onClick={() => toggleSub(item.id)}
                        className="flex items-center justify-between w-full px-3 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        {item.label}
                        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform duration-200', openSub === item.id && 'rotate-180')} />
                      </button>
                      <div
                        className={cn(
                          'overflow-hidden transition-all duration-200',
                          openSub === item.id ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0',
                        )}
                      >
                        <div className="pl-4 ml-3 border-l-2 border-primary/20 space-y-0.5 py-1">
                          {item.submenu.map(sub => (
                            <Link
                              key={sub.label}
                              to={sub.to}
                              onClick={() => setMenuOpen(false)}
                              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <sub.icon className="w-4 h-4 text-primary/60" />
                              {sub.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => item.hash ? handleHash(item.hash) : setMenuOpen(false)}
                      className="flex items-center w-full px-3 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      {item.to ? <Link to={item.to} className="w-full text-left">{item.label}</Link> : item.label}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* panel footer */}
          <div className="px-5 py-4 border-t border-border shrink-0">
            <p className="text-[11px] text-muted-foreground text-center">
              © {new Date().getFullYear()} LearnHub
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════
   FOOTER
   ═══════════════════════════════════════════ */
function HomeFooter({ onOpenApp }: { onOpenApp: () => void }) {
  return (
    <footer className="border-t border-border bg-card/80 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-6">
          {/* brand */}
          <div className="col-span-2 sm:col-span-1">
            <Link to="/" className="inline-flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg">LearnHub</span>
            </Link>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-4 max-w-[220px]">
              India&apos;s next-gen learning platform. Structured courses, gamified progress, top educators.
            </p>
            <div className="flex gap-2">
              {['X', 'YT', 'IG'].map(s => (
                <a key={s} href="#" target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-[11px] font-bold text-muted-foreground hover:bg-primary hover:text-primary-foreground transition">
                  {s}
                </a>
              ))}
            </div>
          </div>

          {/* quick links */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Quick Links</h4>
            <ul className="space-y-2">
              {FOOTER_LINKS.quick.map(l => (
                <li key={l.label}><Link to={l.to} className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition">{l.label}</Link></li>
              ))}
            </ul>
          </div>

          {/* support */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Support</h4>
            <ul className="space-y-2">
              {FOOTER_LINKS.support.map(l => (
                <li key={l.label}><Link to={l.to} className="text-xs sm:text-sm text-muted-foreground hover:text-foreground transition">{l.label}</Link></li>
              ))}
            </ul>
          </div>

          {/* get the app */}
          <div>
            <h4 className="font-semibold text-sm mb-3">Get the App</h4>
            <div className="flex flex-col gap-2">
              <button onClick={onOpenApp} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-muted/50 transition text-left active:scale-[0.98]">
                <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-muted-foreground"><path d="M3 12V6.75l6-1.32v6.48L3 12zm17-9v8.75l-10 .08V5.21L20 3zm-10 9.32l10 .1V21l-10-1.76v-8.92zM3 12.25l6 .09v6.81l-6-1.15v-5.75z" fill="currentColor"/></svg>
                <div><div className="text-[10px] text-muted-foreground leading-none">Download on</div><div className="text-xs font-semibold leading-tight mt-0.5">Windows</div></div>
              </button>
              <button onClick={onOpenApp} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-muted/50 transition text-left active:scale-[0.98]">
                <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-muted-foreground"><path d="M17.523 15.341a.996.996 0 0 0 0-1.992.996.996 0 0 0 0 1.992zm-11.046 0a.996.996 0 0 0 0-1.992.996.996 0 0 0 0 1.992zM17.94 8.5l1.8-3.12a.375.375 0 0 0-.65-.374l-1.824 3.16C15.742 7.614 14.018 7.082 12 7.082s-3.742.532-5.266 1.084L4.91 5.006a.375.375 0 0 0-.65.374L6.06 8.5C2.72 10.124.428 13.582 0 17.624h24c-.428-4.042-2.72-7.5-6.06-9.124z" fill="currentColor"/></svg>
                <div><div className="text-[10px] text-muted-foreground leading-none">Get it on</div><div className="text-xs font-semibold leading-tight mt-0.5">Google Play</div></div>
              </button>
              <button onClick={onOpenApp} className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-muted/50 transition text-left active:scale-[0.98]">
                <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-muted-foreground"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" fill="currentColor"/></svg>
                <div><div className="text-[10px] text-muted-foreground leading-none">Download on</div><div className="text-xs font-semibold leading-tight mt-0.5">App Store</div></div>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* bottom bar */}
      <div className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-[11px] sm:text-xs text-muted-foreground">© {new Date().getFullYear()} LearnHub. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {FOOTER_LINKS.legal.map(l => (
              <Link key={l.label} to={l.to} className="text-[11px] sm:text-xs text-muted-foreground hover:text-foreground transition">{l.label}</Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

/* ═══════════════════════════════════════════
   HOME PAGE
   ═══════════════════════════════════════════ */
const Home = () => {
  useSEO({
    title: 'LearnHub — Master JEE & Beyond with Top Educators',
    description: "India's next-gen learning platform with structured courses, gamified progress, badges, streaks, and certified instructors. Start free.",
    jsonLd: { '@context': 'https://schema.org', '@type': 'EducationalOrganization', name: 'LearnHub', description: 'Online learning platform for JEE, NEET, and competitive exams' },
  });

  const hero = useCarousel(HERO_SLIDES.length, 6000);
  const testi = useCarousel(TESTIMONIALS.length, 7000);
  const [appOpen, setAppOpen] = useState(false);
  const [visTesti, setVisTesti] = useState(1);

  /* hide global navbar */
  useEffect(() => {
    const el = document.querySelector('header:not([data-home-header]), nav:not([data-home-header]), [data-navbar], [data-global-nav]') as HTMLElement | null;
    if (el) {
      const prev = el.style.display;
      el.style.display = 'none';
      return () => { el.style.display = prev; };
    }
  }, []);

  /* testimonial count */
  useEffect(() => {
    const u = () => setVisTesti(window.innerWidth >= 1024 ? 3 : 1);
    u();
    window.addEventListener('resize', u);
    return () => window.removeEventListener('resize', u);
  }, []);
  const maxTesti = Math.max(0, TESTIMONIALS.length - visTesti);

  const openApp = useCallback(() => {
    /* clear session flag so popup can show again when manually triggered */
    sessionStorage.removeItem('lh_app_popup_shown');
    setAppOpen(true);
  }, []);

  return (
    <div className="flex-1 overflow-x-hidden">

      {/* custom header (hides global nav) */}
      <HomeHeader onOpenApp={openApp} />

      {/* auto app popup */}
      <AutoAppPopup onOpenApp={openApp} />

      {/* manual app popup (re-trigger after dismiss) */}
      {appOpen && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={() => setAppOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-10 w-full sm:max-w-md bg-card border border-border rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()} style={{ animation: 'fadeUp .3s ease-out both' }}>
            <button onClick={() => setAppOpen(false)} className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/30 text-white hover:bg-black/50 transition"><X className="w-4 h-4" /></button>
            <div className="relative h-40 sm:h-48 bg-muted overflow-hidden">
              <img src={isMobilePlatform() ? 'https://picsum.photos/seed/learnhubmob/600/400.jpg' : 'https://picsum.photos/seed/learnhubdesk/800/400.jpg'} alt="LearnHub App" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-card via-card/50 to-transparent" />
            </div>
            <div className="px-6 pb-6 -mt-6 relative">
              <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/25"><GraduationCap className="w-7 h-7 text-primary-foreground" /></div>
              <h3 className="text-lg font-bold mb-1">{isMobilePlatform() ? 'Open LearnHub App' : 'Get LearnHub Desktop'}</h3>
              <p className="text-sm text-muted-foreground mb-5">Download the app for the best learning experience.</p>
              <a href={isMobilePlatform() ? 'https://learnhub.app/download' : 'https://learnhub.app/download'} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition active:scale-[0.98] mb-3">
                {isMobilePlatform() ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                {isMobilePlatform() ? 'Open in App Store' : 'Download for Desktop'}
              </a>
              <button onClick={() => setAppOpen(false)} className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition rounded-lg hover:bg-muted">Continue on Web</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ HERO CAROUSEL ═══════ */}
      <section className="relative w-full h-[100svh] min-h-[480px] max-h-[800px] overflow-hidden" onMouseEnter={hero.pause} onMouseLeave={hero.resume}>
        {HERO_SLIDES.map((slide, i) => (
          <div key={i} className={cn('absolute inset-0 transition-opacity duration-700 ease-in-out', i === hero.idx ? 'opacity-100 z-0' : 'opacity-0 z-[-1]')} aria-hidden={i !== hero.idx}>
            <img src={slide.image} alt="" className="absolute inset-0 w-full h-full object-cover" loading={i === 0 ? 'eager' : 'lazy'} />
          </div>
        ))}
        <div className="absolute inset-0 z-[1] bg-gradient-to-t from-black/90 via-black/40 to-black/20 pointer-events-none" />
        <div className="absolute inset-0 z-[1] bg-gradient-to-r from-black/60 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-[2] h-full flex flex-col justify-end pb-10 sm:pb-14 md:pb-20 px-4 sm:px-6 md:px-8">
          <div className="max-w-6xl mx-auto w-full">
            {HERO_SLIDES[hero.idx].tag && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary text-[11px] sm:text-xs font-medium mb-3 sm:mb-4 backdrop-blur-sm">
                <Zap className="w-3 h-3" />{HERO_SLIDES[hero.idx].tag}
              </span>
            )}
            <h1 key={'ht' + hero.idx} className="text-[28px] sm:text-5xl md:text-7xl font-bold tracking-tight text-white whitespace-pre-line leading-[1.1] mb-3 sm:mb-4" style={{ animation: 'fadeUp .55s ease-out both' }}>
              {HERO_SLIDES[hero.idx].title}
            </h1>
            <p key={'hp' + hero.idx} className="text-sm sm:text-base md:text-lg text-white/70 max-w-xl mb-6 sm:mb-8 leading-relaxed" style={{ animation: 'fadeUp .55s .08s ease-out both' }}>
              {HERO_SLIDES[hero.idx].sub}
            </p>
            <div key={'hb' + hero.idx} className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto" style={{ animation: 'fadeUp .55s .16s ease-out both' }}>
              <Button asChild size="lg" className="text-sm sm:text-base gap-2 w-full sm:w-auto">
                <Link to="/courses">Browse Courses <ArrowRight className="w-4 h-4" /></Link>
              </Button>
              <Button asChild size="lg" className="text-sm sm:text-base w-full sm:w-auto border border-white/20 text-white bg-transparent hover:bg-white/10 hover:text-white transition-colors">
                <Link to="/auth">Sign up free</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="absolute inset-y-0 left-0 right-0 z-[3] flex items-center pointer-events-none">
          <button onClick={hero.prev} className="pointer-events-auto p-2 sm:p-2.5 rounded-full bg-black/40 border border-white/10 text-white hover:bg-black/60 transition ml-2 sm:ml-4 active:scale-95" aria-label="Previous slide"><ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" /></button>
          <div className="flex-1" />
          <button onClick={hero.next} className="pointer-events-auto p-2 sm:p-2.5 rounded-full bg-black/40 border border-white/10 text-white hover:bg-black/60 transition mr-2 sm:mr-4 active:scale-95" aria-label="Next slide"><ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" /></button>
        </div>
        <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-[3] flex gap-1.5 sm:gap-2">
          {HERO_SLIDES.map((_, i) => (
            <button key={i} onClick={() => hero.setIdx(i)} aria-label={`Go to slide ${i + 1}`} className={cn('h-1.5 rounded-full transition-all duration-300', i === hero.idx ? 'w-7 sm:w-9 bg-primary' : 'w-1.5 bg-white/40 hover:bg-white/60')} />
          ))}
        </div>
      </section>

      {/* ═══════ STATS ═══════ */}
      <section className="border-b border-border bg-card/60 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.label} className={cn('px-4 py-5 sm:py-6 text-center', i === 0 && 'border-r border-b md:border-b-0 border-border', i === 1 && 'border-b md:border-b-0 md:border-r border-border', i === 2 && 'border-r border-border')}>
              <div className="text-xl sm:text-2xl md:text-3xl font-bold text-primary">{s.value}</div>
              <div className="text-[11px] sm:text-xs md:text-sm text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══════ NON-REFUNDABLE BANNER ═══════ */}
      <section className="bg-amber-500/10 border-b border-amber-500/20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-center gap-2 text-center">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-300 leading-relaxed">
            <span className="font-semibold">Important:</span> All course purchases are <span className="font-semibold">non-refundable</span>. Please choose carefully before enrolling.
          </p>
        </div>
      </section>

      {/* ═══════ POPULAR COURSES ═══════ */}
      <section className="px-4 sm:px-6 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-8">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1 block">Popular</span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">Trending Courses</h2>
            </div>
            <Button asChild variant="ghost" className="hidden sm:inline-flex gap-1 text-muted-foreground hover:text-foreground self-start sm:self-auto">
              <Link to="/courses">View all <ArrowRight className="w-4 h-4" /></Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {COURSES.map(c => (
              <Link key={c.title} to="/courses" className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-all duration-200 hover:shadow-lg hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <img src={c.image} alt={c.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/5 transition-colors" />
                  <span className={cn('absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-sm', c.tagColor)}>{c.tag}</span>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                    <div className="p-2.5 sm:p-3 rounded-full bg-primary/90 text-white shadow-lg"><Play className="w-4 h-4 sm:w-5 sm:h-5 ml-0.5" fill="white" /></div>
                  </div>
                </div>
                <div className="p-3.5 sm:p-4">
                  <h3 className="font-semibold text-sm leading-snug mb-1.5 line-clamp-2 group-hover:text-primary transition-colors">{c.title}</h3>
                  <p className="text-xs text-muted-foreground mb-2.5">{c.educator}</p>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <div className="flex items-center gap-2.5">
                      <span className="flex items-center gap-1"><Play className="w-3 h-3" />{c.lessons}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{c.duration}</span>
                    </div>
                    <span className="flex items-center gap-1 text-yellow-500 font-medium"><Star className="w-3 h-3 fill-yellow-500" />{c.rating}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-6 text-center sm:hidden">
            <Button asChild variant="outline" size="sm" className="gap-1"><Link to="/courses">View all courses <ArrowRight className="w-3.5 h-3.5" /></Link></Button>
          </div>
        </div>
      </section>

      {/* ═══════ WHY LEARNHUB ═══════ */}
      <section id="features" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-border bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-12">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1 block">Features</span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-3">Why 50,000+ students choose LearnHub</h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">Everything you need to stay consistent, learn deeply, and crack competitive exams.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-5 sm:p-6 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors group">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 sm:mb-4 group-hover:bg-primary/20 transition-colors"><Icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" /></div>
                <h3 className="font-semibold text-sm sm:text-base mb-1">{title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-12">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1 block">Process</span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">How it works</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {HOW_IT_WORKS.map(({ step, title, desc, icon: Icon }, i) => (
              <div key={step} className="relative text-center">
                {i < HOW_IT_WORKS.length - 1 && <div className="hidden lg:block absolute top-[28px] left-[58%] w-[84%] h-px border-t border-dashed border-border" />}
                <div className="relative inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-card border border-border mb-3 sm:mb-4">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-primary text-[9px] sm:text-[10px] font-bold text-primary-foreground flex items-center justify-center">{step}</span>
                </div>
                <h3 className="font-semibold text-sm sm:text-base mb-0.5 sm:mb-1">{title}</h3>
                <p className="text-[11px] sm:text-sm text-muted-foreground leading-relaxed px-1">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ EDUCATORS ═══════ */}
      <section id="educators" className="px-4 sm:px-6 py-14 sm:py-20 border-t border-border bg-muted/30">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10 sm:mb-12">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1 block">Faculty</span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2 sm:mb-3">Learn from the best</h2>
            <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">IIT alumni with proven track records. Not influencers — real educators.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
            {EDUCATORS.map(e => (
              <div key={e.name} className="p-5 sm:p-6 rounded-xl bg-card border border-border text-center hover:border-primary/40 transition-colors">
                <img src={e.image} alt={e.name} className="w-18 h-18 sm:w-20 sm:h-20 rounded-full mx-auto mb-3 sm:mb-4 object-cover ring-2 ring-primary/20 ring-offset-2 ring-offset-card" loading="lazy" />
                <h3 className="font-semibold text-base sm:text-lg">{e.name}</h3>
                <span className="inline-block text-[11px] font-medium text-primary bg-primary/10 px-2.5 py-0.5 rounded-full mt-1 mb-2.5 sm:mb-3">{e.subject}</span>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2.5 sm:mb-3 leading-relaxed">{e.bio}</p>
                <div className="text-[11px] sm:text-xs text-muted-foreground flex items-center justify-center gap-1"><Users className="w-3 h-3" /> {e.students} students</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ TESTIMONIALS ═══════ */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 border-t border-border overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8 sm:mb-10">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1 block">Testimonials</span>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">Students love LearnHub</h2>
          </div>
          <div className="relative" onMouseEnter={testi.pause} onMouseLeave={testi.resume}>
            <div className="overflow-hidden">
              <div className="flex transition-transform duration-500 ease-in-out" style={{ transform: `translateX(-${(testi.idx / TESTIMONIALS.length) * 100}%)` }}>
                {TESTIMONIALS.map(t => (
                  <div key={t.name} className="w-full flex-shrink-0 px-1 sm:px-2" style={{ maxWidth: `${100 / visTesti}%`, flexBasis: `${100 / visTesti}%` }}>
                    <div className="p-5 sm:p-7 lg:p-8 rounded-2xl bg-card border border-border text-center h-full flex flex-col">
                      <div className="flex justify-center gap-0.5 mb-3 sm:mb-4">
                        {Array.from({ length: t.rating }).map((_, i) => (<Star key={i} className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-500 fill-yellow-500" />))}
                      </div>
                      <p className="text-sm sm:text-base text-foreground/90 leading-relaxed mb-4 sm:mb-5 flex-1">&ldquo;{t.text}&rdquo;</p>
                      <img src={t.image} alt={t.name} className="w-10 h-10 sm:w-12 sm:h-12 rounded-full mx-auto mb-2 sm:mb-3 object-cover" loading="lazy" />
                      <div className="font-semibold text-xs sm:text-sm">{t.name}</div>
                      <div className="text-[10px] sm:text-xs text-primary mt-0.5">{t.tag}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 sm:gap-3 mt-6 sm:mt-8">
              <button onClick={() => testi.setIdx(i => Math.max(0, i - 1))} disabled={testi.idx === 0} className="p-2 rounded-full border border-border hover:border-primary/40 hover:bg-card transition disabled:opacity-30 disabled:pointer-events-none active:scale-95" aria-label="Previous"><ChevronLeft className="w-4 h-4" /></button>
              <div className="flex gap-1.5">{Array.from({ length: maxTesti + 1 }).map((_, i) => (<button key={i} onClick={() => testi.setIdx(i)} className={cn('h-1.5 rounded-full transition-all duration-300', i === testi.idx ? 'w-6 bg-primary' : 'w-1.5 bg-border hover:bg-muted-foreground')} />))}</div>
              <button onClick={() => testi.setIdx(i => Math.min(maxTesti, i + 1))} disabled={testi.idx >= maxTesti} className="p-2 rounded-full border border-border hover:border-primary/40 hover:bg-card transition disabled:opacity-30 disabled:pointer-events-none active:scale-95" aria-label="Next"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ TRUST ═══════ */}
      <section className="px-4 sm:px-6 py-10 sm:py-12 border-t border-border bg-muted/30">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border"><ShieldCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" /><div><div className="font-medium text-sm">Secure Payments</div><div className="text-xs text-muted-foreground mt-0.5">256-bit SSL encryption.</div></div></div>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-amber-500/20 bg-amber-500/5"><XCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" /><div><div className="font-medium text-sm">Non-Refundable</div><div className="text-xs text-muted-foreground mt-0.5">All purchases are final.</div></div></div>
          <div className="flex items-start gap-3 p-4 rounded-xl bg-card border border-border"><Zap className="w-5 h-5 text-primary mt-0.5 shrink-0" /><div><div className="font-medium text-sm">Instant Access</div><div className="text-xs text-muted-foreground mt-0.5">Start learning immediately.</div></div></div>
        </div>
      </section>

      {/* ═══════ FINAL CTA ═══════ */}
      <section className="relative px-4 sm:px-6 py-16 sm:py-24 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_hsl(0_100%_50%/0.1),_transparent_70%)] pointer-events-none" />
        <div className="relative z-10 max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight mb-3 sm:mb-4">Ready to crack <span className="text-primary">JEE</span>?</h2>
          <p className="text-sm sm:text-base text-muted-foreground mb-6 sm:mb-8 max-w-lg mx-auto">Join 50,000+ students leveling up every day. Start free — no credit card required.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="text-sm sm:text-base gap-2 px-6 sm:px-8"><Link to="/auth">Get started free <ArrowRight className="w-4 h-4" /></Link></Button>
            <Button size="lg" className="text-sm sm:text-base gap-2 px-6 sm:px-8 border border-border bg-card hover:bg-muted text-foreground transition-colors" onClick={openApp}>
              <Download className="w-4 h-4" /> Open in App
            </Button>
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-4 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
            <span className="flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3 text-primary" /> Free forever plan</span>
            <span className="hidden sm:inline">·</span>
            <span className="flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3 text-primary" /> No credit card</span>
            <span className="hidden sm:inline">·</span>
            <span className="flex items-center gap-0.5"><CheckCircle2 className="w-3 h-3 text-primary" /> Cancel anytime</span>
          </p>
        </div>
      </section>

      {/* footer */}
      <HomeFooter onOpenApp={openApp} />
    </div>
  );
};

export default Home;