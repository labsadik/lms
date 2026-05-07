import { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import VideoPlayer from '@/components/VideoPlayer';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  List, 
  X, 
  FileText, 
  Play, 
  Clock, 
  ChevronRight, 
  Radio, 
  ListChecks, 
  Trophy, 
  ExternalLink,
  Lock,
  Menu
} from 'lucide-react';
import { completePart, awardWatchedMinute } from '@/lib/gamify';
import { useAuth } from '@/contexts/AuthContext';
import { useSEO } from '@/lib/seo';
import { toast } from 'sonner';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { cn } from '@/lib/utils';

// --- Types ---
interface Part { 
  id: string; 
  name: string; 
  video_id: string; 
  live_url: string | null; 
  kind: 'recorded' | 'live'; 
  notes_url: string | null; 
  duration: string | null; 
  position: number; 
  is_preview: boolean; 
}
interface Chapter { 
  id: string; 
  name: string; 
  position: number; 
  parts: Part[]; 
}
interface Subject { 
  id: string; 
  name: string; 
  position: number; 
  chapters: Chapter[]; 
}

const Learn = () => {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();
  const { user } = useAuth();
  
  // State
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

  // --- Data Loading ---
  useEffect(() => {
    const load = async () => {
      if (!slug) return;
      
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
      if (firstPart && !currentPartId) setCurrentPartId(firstPart.id);

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

  useEffect(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [currentPart?.id]);

  // --- Handlers ---
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
    // Close sidebar on mobile after selection
    if (window.innerWidth < 1024) setShowPlaylist(false);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center min-h-[50vh]"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!course) return <div className="flex-1 flex items-center justify-center min-h-[50vh] text-muted-foreground">Course not found</div>;
  if (allParts.length === 0) return <div className="flex-1 flex items-center justify-center min-h-[50vh] text-muted-foreground">No content available yet</div>;

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-theme(spacing.16))] overflow-hidden bg-background">
      
      {/* --- LEFT SIDEBAR: Playlist (Visible on PC, Slide-in on Mobile) --- */}
      <aside 
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[85vw] sm:w-[380px] bg-card border-r border-border shadow-xl transform transition-transform duration-300 ease-in-out lg:relative lg:transform-none lg:w-[350px] xl:w-[400px] lg:shadow-none lg:flex flex-col",
          showPlaylist ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <PlaylistContent 
          tree={tree} 
          tests={tests} 
          currentId={currentPartId} 
          completed={completed} 
          enrolled={enrolled} 
          onSelect={selectPart} 
          totalCount={allParts.length} 
          onClose={() => setShowPlaylist(false)}
        />
      </aside>

      {/* Mobile Overlay Backdrop */}
      {showPlaylist && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setShowPlaylist(false)}
        />
      )}

      {/* --- RIGHT SIDE: Video Player & Info --- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto lg:overflow-hidden relative bg-background">
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Mobile Toggle Button */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="lg:hidden mr-1"
              onClick={() => setShowPlaylist(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>

            <Button asChild variant="ghost" size="sm" className="gap-2 hidden sm:flex">
              <Link to={`/courses/${slug}`}>
                <ChevronRight className="w-4 h-4 rotate-180" /> 
                Back to Course
              </Link>
            </Button>
            <span className="font-semibold text-sm truncate max-w-[150px] sm:max-w-md">{course.title}</span>
          </div>
          
          <div className="flex items-center gap-2">
             <Button asChild variant="outline" size="sm" className="hidden md:flex">
              <Link to={`/leaderboard/${slug}`}><Trophy className="w-4 h-4 mr-2 text-yellow-500" /> Leaderboard</Link>
            </Button>
          </div>
        </div>

        {/* Video Container */}
        <div className="flex-1 bg-black relative w-full aspect-video lg:aspect-auto flex flex-col">
          {currentPart?.kind === 'live' && currentPart.live_url ? (
            <div className="flex flex-col items-center justify-center h-full text-white gap-4 p-6 text-center">
              <div className="relative">
                <div className="absolute inset-0 bg-red-500 blur-xl opacity-20 animate-pulse rounded-full"></div>
                <Radio className="w-16 h-16 text-red-500 relative z-10 animate-pulse" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-2">Live Class: {currentPart.name}</h3>
                <p className="text-gray-400 max-w-md mx-auto">This session is currently live.</p>
              </div>
              <Button asChild size="lg" className="bg-red-600 hover:bg-red-700 text-white mt-4">
                <a href={currentPart.live_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" /> Join Live
                </a>
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
            <div className="flex items-center justify-center h-full text-gray-500 bg-zinc-900">Select a lecture to start</div>
          )}
        </div>

        {/* Video Details Footer */}
        {currentPart && (
          <div className="p-4 md:p-6 bg-card border-t border-border">
            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
              <div className="flex-1">
                <h1 className="text-xl md:text-2xl font-bold text-foreground leading-tight">{currentPart.name}</h1>
                <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                  <span className="font-medium text-primary">{currentPart.subjectName}</span>
                  <span>•</span>
                  <span>{currentPart.chapterName}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-2 shrink-0">
                 {currentPart.notes_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={currentPart.notes_url} target="_blank" rel="noopener noreferrer">
                      <FileText className="w-4 h-4 mr-2" /> Notes
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {/* HIDDEN Progress Bar Logic (UI Hidden, Logic Active) */}
            <div className="mt-6 space-y-2">
               {/* We hide the visual bar but keep the container for layout spacing if needed, or just hide it entirely */}
               <div className="hidden">
                <div className="flex justify-between text-xs font-medium text-muted-foreground">
                  <span>Progress</span>
                  <span>{Math.round(watchPct * 100)}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all duration-300 ease-out" 
                    style={{ width: `${Math.round(watchPct * 100)}%` }} 
                  />
                </div>
              </div>
              
              {/* Show simple text status instead of bar */}
              <div className="flex items-center justify-between text-sm">
                 <span className="text-muted-foreground">
                   {currentPart.kind === 'recorded' ? 'Tracking progress...' : 'Live Session'}
                 </span>
                 {completed.has(currentPart.id) && (
                   <span className="flex items-center gap-1 text-green-600 font-bold text-sm">
                     <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">✓</span> Completed
                   </span>
                 )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// --- Sub-Component: Playlist Content ---
const PlaylistContent = ({ tree, tests, currentId, completed, enrolled, onSelect, totalCount, onClose }: any) => (
  <div className="flex flex-col h-full bg-card">
    {/* Sidebar Header */}
    <div className="flex-shrink-0 p-4 border-b border-border flex items-center justify-between bg-muted/30">
      <div>
        <h2 className="font-bold text-lg">Content</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {completed.size} / {totalCount} Completed
        </p>
      </div>
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onClose}>
        <X className="w-5 h-5" />
      </Button>
    </div>

    {/* Scrollable List */}
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <Accordion type="multiple" defaultValue={[tree[0]?.id]} className="w-full">
        {tree.map((subject: Subject) => {
          const subjectTests = tests.filter((t: any) => t.scope === 'subject' && t.subject_id === subject.id);
          
          return (
            <AccordionItem key={subject.id} value={subject.id} className="border-b border-border/50 last:border-0">
              <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 data-[state=open]:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3 text-left w-full">
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-bold text-foreground">{subject.name}</span>
                  </div>
                </div>
              </AccordionTrigger>
              
              <AccordionContent className="pb-2 pt-0 px-2">
                <div className="space-y-1 ml-2 border-l-2 border-border/50 pl-2 my-1">
                  {subject.chapters.map((ch: Chapter) => {
                    const chapTests = tests.filter((t: any) => t.scope === 'chapter' && t.chapter_id === ch.id);
                    
                    return (
                      <div key={ch.id} className="mb-2">
                        <Accordion type="multiple" defaultValue={[ch.id]} className="w-full">
                          <AccordionItem value={ch.id} className="border-0">
                            <AccordionTrigger className="py-2 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:no-underline data-[state=open]:text-foreground">
                              <span className="flex items-center gap-2">
                                <ChevronRight className="w-3 h-3 transition-transform duration-200" />
                                {ch.name}
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-1 pt-1">
                              <div className="flex flex-col space-y-0.5">
                                {ch.parts.map((p: Part) => {
                                  const isActive = p.id === currentId;
                                  const isDone = completed.has(p.id);
                                  const locked = !enrolled && !p.is_preview;
                                  
                                  return (
                                    <button 
                                      key={p.id} 
                                      onClick={() => onSelect(p)} 
                                      disabled={locked} 
                                      className={cn(
                                        "group w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm rounded-md transition-all",
                                        isActive 
                                          ? "bg-primary/10 text-primary font-medium ring-1 ring-primary/20" 
                                          : "hover:bg-muted text-muted-foreground hover:text-foreground",
                                        locked && "opacity-60 cursor-not-allowed hover:bg-transparent"
                                      )}
                                    >
                                      <div className={cn(
                                        "flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full border",
                                        isDone ? "bg-green-500 border-green-500 text-white" : 
                                        isActive ? "border-primary text-primary" : "border-muted-foreground/30 text-muted-foreground",
                                        locked && "border-gray-400 bg-gray-100 dark:bg-gray-800"
                                      )}>
                                        {locked ? <Lock className="w-2.5 h-2.5" /> :
                                         isDone ? <span className="text-[10px]">✓</span> : 
                                         p.kind === 'live' ? <Radio className="w-2.5 h-2.5" /> : 
                                         <Play className="w-2.5 h-2.5 fill-current" />}
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        <p className={cn("truncate text-xs md:text-sm", isActive && "font-semibold")}>{p.name}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                           {p.duration && <span className="text-[10px] flex items-center gap-0.5 opacity-70"><Clock className="w-2.5 h-2.5" /> {p.duration}</span>}
                                           {p.is_preview && <span className="text-[9px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1 rounded">Preview</span>}
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}

                                {chapTests.map((t: any) => (
                                  <Link 
                                    key={t.id} 
                                    to={`/test/${t.id}`} 
                                    className="flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-primary/5 rounded-md mx-1 transition-colors"
                                  >
                                    <ListChecks className="w-3.5 h-3.5" /> 
                                    <span className="truncate">Quiz: {t.title}</span>
                                  </Link>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>
                    );
                  })}
                  
                  {subjectTests.map((t: any) => (
                    <Link 
                      key={t.id} 
                      to={`/test/${t.id}`} 
                      className="flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-primary hover:bg-primary/5 rounded-md mx-2 mt-2 border border-primary/10 transition-colors"
                    >
                      <Trophy className="w-3.5 h-3.5" /> 
                      <span>Exam: {t.title}</span>
                    </Link>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
      
      {tests.filter((t: any) => t.scope === 'course').map((t: any) => (
        <div className="p-4 border-t border-border bg-muted/20">
           <Link 
            key={t.id} 
            to={`/test/${t.id}`} 
            className="flex items-center justify-between w-full p-3 bg-primary text-primary-foreground rounded-lg shadow-sm hover:bg-primary/90 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4" /> 
              <span className="font-bold text-sm">Final Exam</span>
            </div>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ))}
    </div>
  </div>
);

export default Learn;