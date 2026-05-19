import { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, BookOpen, Search, X,
  ArrowDownWideNarrow, ArrowUpWideNarrow, ArrowRight, Flame, Zap,
} from 'lucide-react';
import { formatPriceINR } from '@/lib/format';
import { useSEO } from '@/lib/seo';

/* ────────────── types (match schema exactly) ────────────── */
interface Course {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  instructor: string | null;
  price_inr: number;
  created_at: string;
}

interface SubjectRow {
  course_id: string;
  name: string;
}

/* ────────────── deterministic discount & timer helpers ────────────── */

const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const COURSE_DISCOUNTS = [15, 25, 33, 40, 47, 55, 59, 63];

const getYearlyCourseDiscount = (courseId: string): number => {
  const year = new Date().getFullYear();
  const seed = hashString(`${courseId}-${year}`);
  return COURSE_DISCOUNTS[seed % COURSE_DISCOUNTS.length];
};

const getOriginalPrice = (actualPrice: number, discountPercent: number): number => {
  if (actualPrice <= 0 || discountPercent <= 0) return 0;
  const raw = actualPrice / (1 - discountPercent / 100);
  return Math.ceil(raw / 100) * 100;
};

const getClaimedPercentage = (courseId: string): number => {
  const currentMonth = new Date().getMonth() + 1;
  const year = new Date().getFullYear();
  const seed = hashString(`${courseId}-claim-${year}`);
  const baseProgress = 7 + currentMonth * 5;
  const offset = seed % 11;
  return Math.min(85, baseProgress + offset);
};

const DEAL_DURATIONS_MONTHS = [4, 6, 8, 10, 12];
const getCourseDeadline = (courseId: string): Date => {
  const now = new Date();
  const year = now.getFullYear();
  const seed = hashString(`${courseId}-deadline-${year}`);
  const monthsToAdd = DEAL_DURATIONS_MONTHS[seed % DEAL_DURATIONS_MONTHS.length];
  
  let deadline = new Date(year, 0 + monthsToAdd, 1, 0, 0, 0);
  const dayOffset = (seed * 3) % 28;
  const hourOffset = (seed * 5) % 24;
  deadline.setDate(deadline.getDate() + dayOffset);
  deadline.setHours(hourOffset);
  
  if (deadline.getTime() <= now.getTime()) {
    deadline.setFullYear(deadline.getFullYear() + 1);
  }
  return deadline;
};

/* ────────────── skeleton loader ────────────── */
function CourseSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-card">
      <div className="aspect-video bg-muted animate-pulse" />
      <div className="flex flex-1 flex-col p-4 gap-3">
        <div className="h-5 w-3/4 rounded bg-muted animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
        <div className="flex-1 space-y-2 pt-2">
          <div className="h-3 w-full rounded bg-muted animate-pulse" />
          <div className="h-3 w-5/6 rounded bg-muted animate-pulse" />
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-10 w-full rounded-lg bg-muted animate-pulse" />
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2">
              <div className="h-6 w-16 rounded bg-muted animate-pulse" />
              <div className="h-4 w-20 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-4 w-12 rounded bg-muted animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────── scroll-reveal wrapper ────────────── */
function RevealCard({ children, index }: { children: React.ReactNode; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShow(true); io.unobserve(el); } },
      { threshold: 0.06, rootMargin: '0px 0px -30px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0) scale(1)' : 'translateY(28px) scale(0.97)',
        transition: `opacity .45s cubic-bezier(.22,1,.36,1) ${Math.min(index * 0.06, 0.3)}s, transform .45s cubic-bezier(.22,1,.36,1) ${Math.min(index * 0.06, 0.3)}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ────────────── individual course card with own ticking timer ────────────── */
function CourseCard({ c, subjects }: { c: Course; subjects: string[] }) {
  const [timeLeft, setTimeLeft] = useState({ d: 0, m: 0, s: 0 });
  
  const discountPercent = c.price_inr > 0 ? getYearlyCourseDiscount(c.id) : 0;
  const originalPrice = discountPercent > 0 ? getOriginalPrice(c.price_inr, discountPercent) : 0;
  const claimedPercent = discountPercent > 0 ? getClaimedPercentage(c.id) : 0;

  useEffect(() => {
    if (discountPercent <= 0) return;

    const deadline = getCourseDeadline(c.id);

    const calculateTimeLeft = () => {
      const now = new Date();
      const diff = deadline.getTime() - now.getTime();
      if (diff <= 0) return { d: 0, m: 0, s: 0 };
      
      // Calculate Days, Minutes, Seconds (Hours are hidden)
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const m = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      
      return { d, m, s };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, [c.id, discountPercent]);

  return (
    <Link to={`/courses/${c.slug}`} className="group block h-full">
      <Card className="flex h-full flex-col overflow-hidden border-border/60 bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/[0.06]">
        <div className="relative aspect-video overflow-hidden bg-secondary/50">
          {c.thumbnail_url ? (
            <img src={c.thumbnail_url} alt={c.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
              <BookOpen className="h-10 w-10" />
            </div>
          )}

          {subjects?.length > 0 && (
            <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
              {subjects.slice(0, 3).map((s, j) => (
                <Badge key={j} variant="secondary" className="border-border/40 bg-background/70 text-[10px] font-medium backdrop-blur-md">{s}</Badge>
              ))}
              {subjects.length > 3 && (
                <Badge variant="secondary" className="border-border/40 bg-background/70 text-[10px] font-medium backdrop-blur-md">+{subjects.length - 3}</Badge>
              )}
            </div>
          )}

          {discountPercent > 0 && (
            <div className="absolute right-2.5 top-2.5">
              <span className="discount-glow inline-flex items-center gap-1 bg-red-500 text-white font-bold text-[10px] px-2 py-1 rounded-full shadow-md">
                <Flame className="w-3 h-3" /> {discountPercent}% OFF
              </span>
            </div>
          )}

          <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/30 via-transparent to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <div className="flex h-8 w-8 translate-x-2 items-center justify-center rounded-full bg-white/90 text-primary transition-transform duration-300 group-hover:translate-x-0">
              <ArrowRight className="h-4 w-4" />
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug transition-colors group-hover:text-primary sm:text-base">{c.title}</h3>

          {c.instructor && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">{c.instructor.charAt(0).toUpperCase()}</span>
              <span className="truncate">{c.instructor}</span>
            </p>
          )}

          {c.description && (
            <p className="mt-2 flex-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground/80">{c.description}</p>
          )}

          {discountPercent > 0 ? (
            <div className="mt-3 space-y-2">
              {/* Flash Deal Ticking Timer (Days, Minutes, Seconds) */}
              <div className="relative overflow-hidden bg-gradient-to-r from-red-600 via-red-500 to-orange-500 rounded-lg p-2.5 text-white shadow-inner">
                <div className="absolute -top-4 -right-4 w-16 h-16 bg-white/10 rounded-full" />
                <div className="relative z-10 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold">
                    <Flame className="w-3 h-3" />
                    <span>Flash Deal</span>
                  </div>
                  <div className="flex items-center gap-1 font-mono text-sm font-extrabold tabular-nums tracking-tight">
                    <span className="bg-black/20 rounded px-1.5 py-0.5 flex items-center justify-center">
                      {String(timeLeft.d).padStart(2, '0')}<span className="text-[8px] ml-0.5 opacity-80">D</span>
                    </span>
                    <span className="tick-colon text-white/80">:</span>
                    <span className="bg-black/20 rounded px-1.5 py-0.5 flex items-center justify-center">
                      {String(timeLeft.m).padStart(2, '0')}<span className="text-[8px] ml-0.5 opacity-80">M</span>
                    </span>
                    <span className="tick-colon text-white/80">:</span>
                    <span className="bg-black/20 rounded px-1.5 py-0.5 flex items-center justify-center">
                      {String(timeLeft.s).padStart(2, '0')}<span className="text-[8px] ml-0.5 opacity-80">S</span>
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Dynamic Selling Fast Progress Bar */}
              <div className="space-y-1.5 pt-0.5">
                <div className="flex justify-between text-[10px] font-semibold">
                  <span className="text-red-500 flex items-center gap-0.5"><Zap className="w-3 h-3" /> Selling Fast</span>
                  <span className="text-muted-foreground">{claimedPercent}% Claimed</span>
                </div>
                <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-red-500 to-orange-400 h-full rounded-full transition-all duration-1000" style={{ width: `${claimedPercent}%` }} />
                </div>
              </div>

              {/* Price Block with Savings */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold tracking-tight text-primary">{formatPriceINR(c.price_inr)}</span>
                  <span className="text-sm text-muted-foreground line-through decoration-red-400/60 decoration-2">{formatPriceINR(originalPrice)}</span>
                </div>
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-primary">View →</span>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
              <span className="text-lg font-bold tracking-tight text-primary">
                {c.price_inr === 0 ? <span className="text-emerald-500">Free</span> : formatPriceINR(c.price_inr)}
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-primary">View →</span>
            </div>
          )}
        </div>
      </Card>
    </Link>
  );
}

/* ════════════════════════════════════════════════════════════════ */
const Courses = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [subjectMap, setSubjectMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  const searchRef = useRef<HTMLInputElement>(null);

  useSEO({
    title: 'All Courses — LearnHub',
    description: 'Browse all available courses on LearnHub. Physics, Chemistry, Math, and more for JEE/NEET preparation.',
  });

  useEffect(() => {
    supabase
      .from('courses')
      .select('id, slug, title, description, thumbnail_url, instructor, price_inr, created_at')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .then(({ data: cData }) => {
        const list = cData ?? [];
        setCourses(list);

        if (list.length) {
          supabase
            .from('subjects')
            .select('course_id, name')
            .in('course_id', list.map(c => c.id))
            .then(({ data: sData }) => {
              const m: Record<string, string[]> = {};
              (sData ?? []).forEach((s: SubjectRow) => {
                (m[s.course_id] ??= []).push(s.name);
              });
              setSubjectMap(m);
              setLoading(false);
            });
        } else {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape') searchRef.current?.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const filtered = useMemo(() => {
    let list = courses;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(c => {
        const inFields = c.title.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q) || c.instructor?.toLowerCase().includes(q);
        const inSubjects = (subjectMap[c.id] ?? []).some(s => s.toLowerCase().includes(q));
        return inFields || inSubjects;
      });
    }
    return [...list].sort((a, b) =>
      sort === 'newest'
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [courses, subjectMap, search, sort]);

  const clearSearch = () => {
    setSearch('');
    searchRef.current?.focus();
  };

  return (
    <div className="flex-1 min-h-screen">
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.35); }
          50%      { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
        .discount-glow { animation: pulseGlow 2s ease-in-out infinite; }
        @keyframes tickPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .tick-colon { animation: tickPulse 1s ease-in-out infinite; }
      `}</style>

      <section className="relative overflow-hidden border-b border-border/50 bg-gradient-to-br from-primary/5 via-background to-primary/[0.02]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(var(--primary),0.08),transparent)]" />
        <div className="relative mx-auto max-w-7xl px-4 pt-10 pb-8 sm:pt-14 sm:pb-10">
          <div style={{ animation: 'fadeUp .5s ease-out both' }}>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">Explore Courses</h1>
            <p className="mt-2 max-w-xl text-base text-muted-foreground sm:text-lg">
              Master every subject with structured courses designed for JEE, NEET &amp; board exams.
            </p>
          </div>

          <div className="mt-6 flex max-w-2xl gap-3" style={{ animation: 'fadeUp .5s ease-out .1s both' }}>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder='Search courses, topics, instructors…  (press "/")'
                className="h-11 border-border/60 bg-background/80 text-sm backdrop-blur focus-visible:ring-primary/30 pl-10 pr-9"
              />
              {search && (
                <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setSort(s => s === 'newest' ? 'oldest' : 'newest')}
              className="flex h-11 shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-background/80 text-sm font-medium backdrop-blur hover:border-primary/40 px-4"
            >
              {sort === 'newest' ? <ArrowDownWideNarrow className="w-4 h-4 text-primary" /> : <ArrowUpWideNarrow className="w-4 h-4 text-primary" />}
              <span className="hidden sm:inline">{sort === 'newest' ? 'Newest' : 'Oldest'}</span>
            </button>
          </div>

          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground" style={{ animation: 'fadeUp .5s ease-out .2s both' }}>
            <span>{courses.length} course{courses.length !== 1 && 's'}</span>
            <span className="h-3 w-px bg-border" />
            <span className="text-foreground/70 font-medium">Sorted: {sort === 'newest' ? 'Newest first' : 'Oldest first'}</span>
            {search && (
              <>
                <span className="h-3 w-px bg-border" />
                <span>{filtered.length} result{filtered.length !== 1 && 's'} for &ldquo;<strong className="text-foreground">{search}</strong>&rdquo;</span>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:pb-16 sm:pt-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <CourseSkeleton key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center" style={{ animation: 'fadeUp .4s ease-out' }}>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <BookOpen className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No courses found</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {search ? `Nothing matches "${search}". Try different keywords or clear the search.` : 'No courses published yet. Check back soon!'}
            </p>
            {search && (
              <button onClick={clearSearch} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                Clear search <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {filtered.map((c, i) => (
              <RevealCard key={c.id} index={i}>
                <CourseCard c={c} subjects={subjectMap[c.id] || []} />
              </RevealCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Courses;