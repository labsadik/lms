import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Users, BookOpen, Tag, ShoppingCart, Wallet } from 'lucide-react';
import { useSEO } from '@/lib/seo';
import { formatPriceINR } from '@/lib/format';

const AdminOverview = () => {
  const [stats, setStats] = useState({ users: 0, courses: 0, enrollments: 0, promocodes: 0, revenue: 0, redemptions: 0 });
  useSEO({ title: 'Admin Overview' });

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase.from('courses').select('id', { count: 'exact', head: true }),
      supabase.from('enrollments').select('amount_paid_inr'),
      supabase.from('promocodes').select('id', { count: 'exact', head: true }),
      supabase.from('promocode_redemptions').select('id', { count: 'exact', head: true }),
    ]).then(([u, c, e, p, r]) => {
      const enrollList = (e.data || []) as any[];
      const revenue = enrollList.reduce((s, x) => s + (x.amount_paid_inr || 0), 0);
      setStats({
        users: u.count || 0,
        courses: c.count || 0,
        enrollments: enrollList.length,
        promocodes: p.count || 0,
        revenue,
        redemptions: r.count || 0,
      });
    });
  }, []);

  const cards = [
    { icon: Users, label: 'Users', value: stats.users },
    { icon: BookOpen, label: 'Courses', value: stats.courses },
    { icon: ShoppingCart, label: 'Enrollments', value: stats.enrollments },
    { icon: Wallet, label: 'Revenue', value: formatPriceINR(stats.revenue) },
    { icon: Tag, label: 'Promocodes', value: stats.promocodes },
    { icon: Tag, label: 'Codes redeemed', value: stats.redemptions },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Overview</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map(({ icon: Icon, label, value }) => (
          <Card key={label} className="p-4 bg-card border-border">
            <Icon className="w-5 h-5 text-primary mb-2" />
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminOverview;
