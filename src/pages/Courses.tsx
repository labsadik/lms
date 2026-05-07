import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Loader2, BookOpen } from 'lucide-react';
import { formatPriceINR } from '@/lib/format';
import { useSEO } from '@/lib/seo';

interface Course {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  instructor: string | null;
  price_inr: number;
}

const Courses = () => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);

  useSEO({
    title: 'All Courses — LearnHub',
    description: 'Browse all available courses on LearnHub. Physics, Chemistry, Math, and more for JEE/NEET preparation.',
  });

  useEffect(() => {
    supabase
      .from('courses')
      .select('id, slug, title, description, thumbnail_url, instructor, price_inr')
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setCourses(data || []);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex-1 px-4 py-8 sm:py-12 max-w-7xl w-full mx-auto">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold">All Courses</h1>
        <p className="text-muted-foreground mt-1">Find the right course to crush your goals</p>
      </header>

      {courses.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No courses published yet. Check back soon!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {courses.map((c) => (
            <Link key={c.id} to={`/courses/${c.slug}`}>
              <Card className="overflow-hidden bg-card border-border hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/10 h-full flex flex-col">
                <div className="aspect-video bg-secondary relative overflow-hidden">
                  {c.thumbnail_url ? (
                    <img src={c.thumbnail_url} alt={c.title} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><BookOpen className="w-10 h-10" /></div>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <h3 className="font-semibold text-base sm:text-lg leading-tight line-clamp-2">{c.title}</h3>
                  {c.instructor && <p className="text-xs text-muted-foreground mt-1">by {c.instructor}</p>}
                  {c.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-2 flex-1">{c.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-lg font-bold text-primary">{c.price_inr === 0 ? 'Free' : formatPriceINR(c.price_inr)}</span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Courses;
