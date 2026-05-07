import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { GraduationCap, Trophy, Zap, Users, BookOpen, Award } from 'lucide-react';
import { useSEO } from '@/lib/seo';

const Home = () => {
  useSEO({
    title: 'LearnHub — Master JEE & Beyond with Top Educators',
    description: 'India\'s next-gen learning platform with structured courses, gamified progress, badges, streaks, and certified instructors. Start free.',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: 'LearnHub',
      description: 'Online learning platform for JEE, NEET, and competitive exams',
    },
  });

  return (
    <div className="flex-1">
      {/* Hero */}
      <section className="relative px-4 py-16 sm:py-24 md:py-32 text-center overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(0_100%_50%/0.15),_transparent_70%)]" />
        <div className="relative max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs sm:text-sm mb-4">
            <Zap className="w-3 h-3" /> Gamified learning experience
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight mb-4">
            Crack JEE with <span className="text-primary">India's best</span><br />structured courses
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            Top educators. Bite-sized chapters. Streaks, XP, badges, and rewards that make studying addictive.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="text-base">
              <Link to="/courses">Browse Courses</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base">
              <Link to="/auth">Sign up free</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-10">Why LearnHub</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: BookOpen, title: 'Structured Courses', desc: 'Subjects → Chapters → Parts. Never feel lost.' },
              { icon: Trophy, title: 'Earn XP & Badges', desc: 'Level up as you learn. Compete on the leaderboard.' },
              { icon: Zap, title: 'Daily Streaks', desc: 'Build a study habit. Don\'t break the chain.' },
              { icon: Award, title: 'Coins & Rewards', desc: 'Redeem coins for course discounts.' },
              { icon: GraduationCap, title: 'Top Faculty', desc: 'Learn from India\'s top JEE educators.' },
              { icon: Users, title: 'Refer & Earn', desc: 'Both you and your friend get discounts.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="p-6 rounded-xl bg-card border border-border hover:border-primary/40 transition-colors">
                <Icon className="w-8 h-8 text-primary mb-3" />
                <h3 className="font-semibold text-lg mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-16 border-t border-border text-center">
        <h2 className="text-3xl font-bold mb-3">Ready to start?</h2>
        <p className="text-muted-foreground mb-6">Join thousands of students leveling up every day.</p>
        <Button asChild size="lg">
          <Link to="/courses">Explore Courses</Link>
        </Button>
      </section>
    </div>
  );
};

export default Home;
