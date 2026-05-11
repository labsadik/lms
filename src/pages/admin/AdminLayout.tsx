import { Link, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Tag, Users, Shield, LayoutDashboard, ListChecks, Megaphone, Monitor, Wallet } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const AdminLayout = () => {
  const loc = useLocation();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="fixed inset-0 flex items-center justify-center p-8 text-center bg-background">
        <div className="max-w-sm space-y-4">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center border border-border">
            <Monitor className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Desktop Required</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            The admin panel is optimized for larger screens. Please switch to a desktop or tablet.
          </p>
        </div>
      </div>
    );
  }

  const items = [
    { to: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
    { to: '/admin/courses', label: 'Courses', icon: BookOpen },
    { to: '/admin/tests', label: 'Tests', icon: ListChecks },
    { to: '/admin/announcements', label: 'Announce', icon: Megaphone },
    { to: '/admin/promocodes', label: 'Promocodes', icon: Tag },
    { to: '/admin/revenue', label: 'Revenue', icon: Wallet },
    { to: '/admin/users', label: 'Users', icon: Users },
  ];

  return (
    /* 
      SCROLL FIX EXPLAINED:
      "fixed inset-0" glues the entire layout to the screen like a desktop app.
      "overflow-hidden" kills the default browser body scroll completely.
    */
    <div className="fixed inset-0 flex overflow-hidden bg-muted/40">
      
      {/* 
        SIDEBAR: Locked in place. 
        Will NEVER move or scroll when you scroll the main content.
      */}
      <aside className="w-[240px] h-full bg-card border-r border-border flex flex-col shadow-sm flex-shrink-0 z-10">
        
        <div className="h-16 flex items-center gap-3 px-5 border-b border-border shrink-0">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-sm">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight leading-none">LearnHub</span>
            <span className="text-[10px] text-muted-foreground font-medium leading-none mt-1">Admin Panel</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1 mt-2">
          {items.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? loc.pathname === to : loc.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all duration-200 group ${
                  active 
                    ? 'bg-primary/10 text-primary border-l-[3px] border-primary pl-[9px]' 
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground border-l-[3px] border-transparent pl-[9px] hover:border-border'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'}`} /> 
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border shrink-0">
          <p className="text-[10px] text-muted-foreground text-center font-mono">v1.0.0 • Secure</p>
        </div>
      </aside>

      {/* 
        RIGHT SIDE MAIN CONTENT: 
        "flex-1" takes up all remaining width.
        "h-full" ensures it perfectly matches the screen height.
        The nested div with "overflow-y-auto" is the ONLY thing that scrolls.
      */}
      <main className="flex-1 h-full flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 lg:p-8 w-full max-w-[1600px] mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
      
    </div>
  );
};

export default AdminLayout;