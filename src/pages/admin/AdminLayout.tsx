import { Link, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Tag, Users, Shield, LayoutDashboard, ListChecks, Megaphone, Monitor, Wallet } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

const AdminLayout = () => {
  const loc = useLocation();
  const isMobile = useIsMobile();
  if (isMobile) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div className="max-w-sm space-y-3">
          <Monitor className="w-12 h-12 text-primary mx-auto" />
          <h1 className="text-xl font-bold">Desktop only</h1>
          <p className="text-sm text-muted-foreground">The admin panel is optimized for larger screens. Please open on a desktop or tablet (≥768px).</p>
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
    <div className="flex-1 flex flex-col lg:flex-row">
      <aside className="lg:w-56 border-b lg:border-b-0 lg:border-r border-border bg-card/50 p-2 lg:p-4 flex-shrink-0">
        <div className="hidden lg:flex items-center gap-2 mb-4 text-sm font-bold">
          <Shield className="w-4 h-4 text-primary" /> Admin Panel
        </div>
        <nav className="flex lg:flex-col gap-1 overflow-x-auto">
          {items.map(({ to, label, icon: Icon, exact }) => {
            const active = exact ? loc.pathname === to : loc.pathname.startsWith(to);
            return (
              <Link key={to} to={to} className={`flex items-center gap-2 px-3 py-2 rounded text-sm whitespace-nowrap transition-colors ${active ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}>
                <Icon className="w-4 h-4" /> {label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 p-4 sm:p-6"><Outlet /></div>
    </div>
  );
};

export default AdminLayout;
