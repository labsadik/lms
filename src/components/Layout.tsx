import { ReactNode } from 'react';
import Header from './Header';

const Layout = ({ children, hideHeader = false }: { children: ReactNode; hideHeader?: boolean }) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {!hideHeader && <Header />}
      <main className="flex-1 flex flex-col">{children}</main>
    </div>
  );
};

export default Layout;
