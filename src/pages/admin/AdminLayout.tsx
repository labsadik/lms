import { Link, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Tag, Users, Shield, LayoutDashboard, ListChecks, Megaphone, Monitor, Wallet } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const AdminLayout = () => {
  const loc = useLocation();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="h-screen flex items-center justify-center p-8 text-center">
        <div className="max-w-sm space-y-3">
          <Monitor className="w-12 h-12 text-primary mx-auto" />
          <h1 className="text-xl font-bold">Desktop only</h1>
          <p className="text-sm text-muted-foreground">
            The admin panel is optimized for larger screens. Please open on a desktop or tablet (≥768px).
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
    // h-screen + overflow-hidden locks the body scroll
    <div className="h-screen flex overflow-hidden bg-background">
      
      {/* Sidebar - fixed width, full height, won't scroll with the page */}
      <aside className="w-56 h-full border-r border-border bg-card/50 p-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-6 text-sm font-bold">
          <Shield className="w-4 h-4 text-primary" /> Admin Panel
        </div>
        <nav className="flex flex-col gap-1">
          {items.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? loc.pathname === to : loc.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active 
                    ? 'bg-primary text-primary-foreground shadow-sm' 
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" /> {label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content - takes remaining width, independent vertical scroll */}
      <main className="flex-1 h-full overflow-y-auto">
        <div className="p-6 lg:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>
      
    </div>
  );
};

export default AdminLayout;