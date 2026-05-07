import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import VideoPlayer from '@/components/VideoPlayer';
import { Button } from '@/components/ui/button';
import { Loader2, List, X, FileText, Play, Clock, ChevronLeft, Radio, ListChecks, Trophy, ExternalLink } from 'lucide-react';
import { completePart, awardWatchedMinute, parseDurationToSeconds } from '@/lib/gamify';
import { useAuth } from '@/contexts/AuthContext';
import { useSEO } from '@/lib/seo';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface Part { id: string; name: string; video_id: string; live_url: string | null; kind: 'recorded' | 'live'; notes_url: string | null; duration: string | null; position: number; is_preview: boolean; }
interface Chapter { id: string; name: string; position: number; parts: Part[]; }
interface Subject { id: string; name: string; position: number; chapters: Chapter[]; }

const Learn = () => {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  const [course, setCourse] = useState<any>(null);
  const [tree, setTree] = useState<Subject[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [currentPartId, setCurrentPartId] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [enrolled, setEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [watchPct, setWatchPct] = useState(0);
  const tickRef = useRef<number | null>(null);

  useSEO({ title: course ? `Learn: ${course.title}` : 'Learning', description: 'Continue your learning on LearnHub' });

  useEffect(() => {
    const load = async () => {
      const { data: c } = await supabase.from('courses').select('*').eq('slug', slug).maybeSingle();
      if (!c) { setLoading(false); return; }
      setCourse(c);

      if (user) {
        const { data: en } = await supabase.from('enrollments').select('id').eq('user_id', user.id).eq('course_id', c.id).maybeSingle();
        setEnrolled(!!en);
      }

      const [{ data: subjects }, { data: ts }] = await Promise.all([
        supabase.from('subjects')
          .select('id, name, position, chapters(id, name, position, parts(id, name, kind, live_url, video_id, notes_url, duration, position, is_preview))')
          .eq('course_id', c.id).order('position'),
        supabase.from('tests').select('id, title, scope, subject_id, chapter_id, duration_minutes').eq('course_id', c.id).eq('is_published', true),
      ]);

      const sorted: Subject[] = (subjects || []).map((s: any) => ({
        ...s,
        chapters: (s.chapters || []).sort((a: any, b: any) => a.position - b.position).map((ch: any) => ({
          ...ch,
          parts: (ch.parts || []).sort((a: any, b: any) => a.position - b.position),
        })),
      }));
      setTree(sorted);
      setTests(ts || []);
      const firstPart = sorted.flatMap(s => s.chapters.flatMap(ch => ch.parts))[0];
      if (firstPart) setCurrentPartId(firstPart.id);

      if (user) {
        const { data: prog } = await supabase.from('progress').select('part_id').eq('user_id', user.id).eq('completed', true);
        setCompleted(new Set((prog || []).map((p: any) => p.part_id)));
      }
      setLoading(false);
    };
    load();
  }, [slug, user]);

  const allParts = useMemo(() => tree.flatMap(s => s.chapters.flatMap(ch => ch.parts.map(p => ({ ...p, chapterName: ch.name, subjectName: s.name })))), [tree]);
  const currentPart = allParts.find(p => p.id === currentPartId);

  // Real-time per-minute coin awards now happen via VideoPlayer's onMinuteWatched callback.
  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [currentPart?.id]);

  const handleComplete = async () => {
    if (!user || !currentPart || !course) return;
    if (completed.has(currentPart.id)) return;
    await completePart(user.id, currentPart.id, course.id);
    setCompleted(prev => new Set(prev).add(currentPart.id));
    toast.success('Lecture completed!');
  };

  const handleMinuteWatched = async (minute: number) => {
    if (!user || !currentPart || !course || currentPart.kind !== 'recorded') return;
    const awarded = await awardWatchedMinute(user.id, currentPart.id, minute, course.id);
    if (awarded) toast.success('+1 coin', { duration: 1200 });
  };

  const selectPart = (p: Part) => {
    if (!enrolled && !p.is_preview) {
      toast.error('Enroll to unlock this lecture');
      return;
    }
    setCurrentPartId(p.id);
    setWatchPct(0);
    setShowPlaylist(false);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!course) return <div className="flex-1 flex items-center justify-center text-muted-foreground">Course not found</div>;
  if (allParts.length === 0) return <div className="flex-1 flex items-center justify-center text-muted-foreground">No content available yet</div>;

  return (
    <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-background">
      <div className="relative flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/50">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/courses/${slug}`}><ChevronLeft className="w-4 h-4" /> {course.title}</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/leaderboard/${slug}`}><Trophy className="w-4 h-4 mr-1" /> Leaderboard</Link>
          </Button>
        </div>

        <div className="relative flex-1 min-h-0 bg-black aspect-video lg:aspect-auto">
          {currentPart?.kind === 'live' && currentPart.live_url ? (
            <div className="flex flex-col items-center justify-center h-full text-foreground gap-3 p-6">
              <Radio className="w-12 h-12 text-red-500 animate-pulse" />
              <h3 className="text-xl font-bold">Live Class: {currentPart.name}</h3>
              <p className="text-sm text-muted-foreground">Click below to join the live session.</p>
              <Button asChild size="lg" className="bg-red-600 hover:bg-red-700">
                <a href={currentPart.live_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-4 h-4 mr-1" /> Join Live</a>
              </Button>
            </div>
          ) : currentPart ? (
            <VideoPlayer
              key={currentPart.id}
              video={{ id: currentPart.video_id, title: currentPart.name, duration: currentPart.duration || undefined }}
              onProgress={(p) => setWatchPct(p)}
              onComplete={handleComplete}
              onMinuteWatched={handleMinuteWatched}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">Select a lecture</div>
          )}

          <button onClick={() => setShowPlaylist(!showPlaylist)} className="lg:hidden absolute top-3 right-3 z-40 w-10 h-10 rounded-full bg-card/80 backdrop-blur border border-border flex items-center justify-center" aria-label="Toggle playlist">
            {showPlaylist ? <X className="w-5 h-5" /> : <List className="w-5 h-5" />}
          </button>
        </div>

        {currentPart && (
          <div className="p-3 sm:p-4 border-t border-border bg-card/30">
            <h2 className="font-semibold text-base sm:text-lg leading-tight">{currentPart.name}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{currentPart.subjectName} • {currentPart.chapterName}</p>
            {currentPart.kind === 'recorded' && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>Watched: {Math.round(watchPct * 100)}%</span>
                  <span>{completed.has(currentPart.id) ? '✓ Completed' : 'Completes at 95%'}</span>
                </div>
                <div className="h-1 bg-secondary rounded overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${Math.round(watchPct * 100)}%` }} />
                </div>
              </div>
            )}
            {currentPart.notes_url && (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <a href={currentPart.notes_url} target="_blank" rel="noopener noreferrer"><FileText className="w-4 h-4 mr-1" /> Download Notes</a>
              </Button>
            )}
          </div>
        )}
      </div>

      <aside className="hidden lg:flex flex-col w-[360px] xl:w-[420px] border-l border-border bg-playlist flex-shrink-0">
        <PlaylistContent tree={tree} tests={tests} currentId={currentPartId} completed={completed} enrolled={enrolled} onSelect={selectPart} totalCount={allParts.length} />
      </aside>

      {showPlaylist && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowPlaylist(false)} />
          <div className="relative ml-auto w-[85%] sm:w-[70%] max-w-[400px] h-full bg-playlist animate-in slide-in-from-right duration-300">
            <PlaylistContent tree={tree} tests={tests} currentId={currentPartId} completed={completed} enrolled={enrolled} onSelect={selectPart} totalCount={allParts.length} />
          </div>
        </div>
      )}
    </div>
  );
};

const PlaylistContent = ({ tree, tests, currentId, completed, enrolled, onSelect, totalCount }: any) => (
  <div className="flex flex-col h-full">
    <div className="flex-shrink-0 p-3 sm:p-4 border-b border-border">
      <h2 className="text-sm sm:text-base font-bold tracking-tight">Course Content</h2>
      <p className="text-xs text-muted-foreground mt-0.5">{completed.size} / {totalCount} completed</p>
    </div>
    <div className="flex-1 overflow-y-auto">
      <Accordion type="multiple" className="w-full">
        {tree.map((subject: Subject) => {
          const subjectTests = tests.filter((t: any) => t.scope === 'subject' && t.subject_id === subject.id);
          return (
            <AccordionItem key={subject.id} value={subject.id} className="border-b border-border/50">
              <AccordionTrigger className="px-3 py-2 text-xs font-bold uppercase tracking-wider hover:no-underline">{subject.name}</AccordionTrigger>
              <AccordionContent className="pb-0">
                <Accordion type="multiple">
                  {subject.chapters.map((ch: Chapter) => {
                    const chapTests = tests.filter((t: any) => t.scope === 'chapter' && t.chapter_id === ch.id);
                    return (
                      <AccordionItem key={ch.id} value={ch.id} className="border-0">
                        <AccordionTrigger className="px-4 py-1.5 text-[12px] font-semibold hover:no-underline">{ch.name}</AccordionTrigger>
                        <AccordionContent className="pb-0">
                          {ch.parts.map((p) => {
                            const isActive = p.id === currentId;
                            const isDone = completed.has(p.id);
                            const locked = !enrolled && !p.is_preview;
                            return (
                              <button key={p.id} onClick={() => onSelect(p)} disabled={locked} className={`w-full flex items-center gap-2 pl-6 pr-3 py-2 text-left text-sm transition-colors border-l-2 ${isActive ? 'bg-playlist-active border-primary text-foreground' : 'border-transparent hover:bg-playlist-hover'} ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                                  {isDone ? <span className="text-green-500">✓</span> : p.kind === 'live' ? <Radio className="w-3 h-3 text-red-500" /> : <Play className="w-3 h-3" />}
                                </div>
                                <span className="flex-1 line-clamp-2 text-xs">{p.name}</span>
                                {p.kind === 'live' && <span className="text-[9px] bg-red-500/20 text-red-500 px-1.5 py-0.5 rounded">LIVE</span>}
                                {p.is_preview && <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Free</span>}
                                {p.duration && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{p.duration}</span>}
                              </button>
                            );
                          })}
                          {chapTests.map((t: any) => (
                            <Link key={t.id} to={`/test/${t.id}`} className="w-full flex items-center gap-2 pl-6 pr-3 py-2 text-xs text-primary hover:bg-playlist-hover">
                              <ListChecks className="w-3 h-3" /> Test: {t.title} ({t.duration_minutes}m)
                            </Link>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
                {subjectTests.map((t: any) => (
                  <Link key={t.id} to={`/test/${t.id}`} className="w-full flex items-center gap-2 px-4 py-2 text-xs text-primary hover:bg-playlist-hover border-t border-border/30">
                    <ListChecks className="w-3 h-3" /> Test: {t.title} ({t.duration_minutes}m)
                  </Link>
                ))}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      {tests.filter((t: any) => t.scope === 'course').map((t: any) => (
        <Link key={t.id} to={`/test/${t.id}`} className="flex items-center gap-2 px-3 py-2.5 text-sm text-primary hover:bg-playlist-hover border-t border-border">
          <ListChecks className="w-4 h-4" /> Final Test: {t.title} ({t.duration_minutes}m)
        </Link>
      ))}
    </div>
  </div>
);

export default Learn;
