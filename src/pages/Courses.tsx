import { useEffect, useState, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, BookOpen, Search, X,
  ArrowDownWideNarrow, ArrowUpWideNarrow, ArrowRight,
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
    description:
      'Browse all available courses on LearnHub. Physics, Chemistry, Math, and more for JEE/NEET preparation.',
  });

  /* ─── fetch courses then subjects ─── */
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

  /* ─── keyboard shortcuts ─── */
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

  /* ─── filtered + sorted list ─── */
  const filtered = useMemo(() => {
    let list = courses;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(c => {
        const inFields =
          c.title.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.instructor?.toLowerCase().includes(q);
        const inSubjects = (subjectMap[c.id] ?? []).some(s =>
          s.toLowerCase().includes(q),
        );
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

  /* ─── loading ─── */
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading courses…</p>
        </div>
      </div>
    );
  }

  /* ══════════════ RENDER ══════════════ */
  return (
    <div className="flex-1 min-h-screen">
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      {/* ────── Hero ────── */}
      <section className="relative overflow-hidden border-b border-border/50 bg-gradient-to-br from-primary/5 via-background to-primary/[0.02]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(var(--primary),0.08),transparent)]" />

        <div className="relative mx-auto max-w-7xl px-4 pt-10 pb-8 sm:pt-14 sm:pb-10">
          {/* title */}
          <div style={{ animation: 'fadeUp .5s ease-out both' }}>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
              Explore Courses
            </h1>
            <p className="mt-2 max-w-xl text-base text-muted-foreground sm:text-lg">
              Master every subject with structured courses designed for JEE, NEET
              &amp; board exams.
            </p>
          </div>

          {/* search + sort row */}
          <div
            className="mt-6 flex max-w-2xl gap-3"
            style={{ animation: 'fadeUp .5s ease-out .1s both' }}
          >
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
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* sort toggle */}
            <button
              onClick={() => setSort(s => s === 'newest' ? 'oldest' : 'newest')}
              className={`flex h-11 shrink-0 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-all ${
                'border-border/60 bg-background/80 text-foreground backdrop-blur hover:border-primary/40'
              }`}
            >
              {sort === 'newest' ? (
                <ArrowDownWideNarrow className="w-4 h-4 text-primary" />
              ) : (
                <ArrowUpWideNarrow className="w-4 h-4 text-primary" />
              )}
              <span className="hidden sm:inline">{sort === 'newest' ? 'Newest' : 'Oldest'}</span>
            </button>
          </div>

          {/* stats line */}
          <div
            className="mt-4 flex items-center gap-4 text-xs text-muted-foreground"
            style={{ animation: 'fadeUp .5s ease-out .2s both' }}
          >
            <span>
              {courses.length} course{courses.length !== 1 && 's'}
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="text-foreground/70 font-medium">
              Sorted: {sort === 'newest' ? 'Newest first' : 'Oldest first'}
            </span>
            {search && (
              <>
                <span className="h-3 w-px bg-border" />
                <span>
                  {filtered.length} result{filtered.length !== 1 && 's'} for
                  &ldquo;<strong className="text-foreground">{search}</strong>&rdquo;
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ────── Grid ────── */}
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:pb-16 sm:pt-8">
        {filtered.length === 0 ? (
          <div className="py-20 text-center" style={{ animation: 'fadeUp .4s ease-out' }}>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <BookOpen className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No courses found</h3>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              {search
                ? `Nothing matches "${search}". Try different keywords or clear the search.`
                : 'No courses published yet. Check back soon!'}
            </p>
            {search && (
              <button
                onClick={clearSearch}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
              >
                Clear search <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {filtered.map((c, i) => (
              <RevealCard key={c.id} index={i}>
                <Link to={`/courses/${c.slug}`} className="group block h-full">
                  <Card className="flex h-full flex-col overflow-hidden border-border/60 bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/[0.06]">
                    {/* thumbnail */}
                    <div className="relative aspect-video overflow-hidden bg-secondary/50">
                      {c.thumbnail_url ? (
                        <img
                          src={c.thumbnail_url}
                          alt={c.title}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground/50">
                          <BookOpen className="h-10 w-10" />
                        </div>
                      )}

                      {/* subject badges from schema */}
                      {subjectMap[c.id]?.length > 0 && (
                        <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
                          {subjectMap[c.id].slice(0, 3).map((s, j) => (
                            <Badge
                              key={j}
                              variant="secondary"
                              className="border-border/40 bg-background/70 text-[10px] font-medium backdrop-blur-md"
                            >
                              {s}
                            </Badge>
                          ))}
                          {subjectMap[c.id].length > 3 && (
                            <Badge
                              variant="secondary"
                              className="border-border/40 bg-background/70 text-[10px] font-medium backdrop-blur-md"
                            >
                              +{subjectMap[c.id].length - 3}
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* hover arrow */}
                      <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/30 via-transparent to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                        <div className="flex h-8 w-8 translate-x-2 items-center justify-center rounded-full bg-white/90 text-primary transition-transform duration-300 group-hover:translate-x-0">
                          <ArrowRight className="h-4 w-4" />
                        </div>
                      </div>
                    </div>

                    {/* info */}
                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug transition-colors group-hover:text-primary sm:text-base">
                        {c.title}
                      </h3>

                      {c.instructor && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-bold text-muted-foreground">
                            {c.instructor.charAt(0).toUpperCase()}
                          </span>
                          <span className="truncate">{c.instructor}</span>
                        </p>
                      )}

                      {c.description && (
                        <p className="mt-2 flex-1 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground/80">
                          {c.description}
                        </p>
                      )}

                      <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-3">
                        <span className="text-lg font-bold tracking-tight text-primary">
                          {c.price_inr === 0 ? (
                            <span className="text-emerald-500">Free</span>
                          ) : (
                            formatPriceINR(c.price_inr)
                          )}
                        </span>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-primary">
                          View →
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              </RevealCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Courses;