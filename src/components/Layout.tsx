import { ReactNode } from 'react';
import Header from './Header';
import TabMobileNavbar from './tab-mobile-navbar';

const Layout = ({
  children,
  hideHeader = false,
}: {
  children: ReactNode;
  hideHeader?: boolean;
}) => {
  return (
    <div className="bg-background">
      
      {/* Normal Header */}
      {!hideHeader && (
        <div className="bg-background">
          <Header />
        </div>
      )}

      {/* Main Content */}
      <main className="pb-14">
        {children}
      </main>

      {/* Fixed Bottom Navbar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t">
        <TabMobileNavbar />
      </div>
    </div>
  );
};

export default Layout;