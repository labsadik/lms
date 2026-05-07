import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { RequireAuth, RequireAdmin } from "@/components/RequireAuth";
import Layout from "@/components/Layout";
import Home from "./pages/Home";
import Auth from "./pages/Auth";
import Courses from "./pages/Courses";
import CourseDetail from "./pages/CourseDetail";
import Learn from "./pages/Learn";
import Study from "./pages/Study";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Refer from "./pages/Refer";
import Rewards from "./pages/Rewards";
import TestPage from "./pages/TestPage";
import Leaderboard from "./pages/Leaderboard";
import AdminLayout from "./pages/admin/AdminLayout";
import AdminOverview from "./pages/admin/AdminOverview";
import AdminRevenue from "./pages/admin/AdminRevenue";
import AdminCourses from "./pages/admin/AdminCourses";
import AdminCourseContent from "./pages/admin/AdminCourseContent";
import AdminPromocodes from "./pages/admin/AdminPromocodes";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminTests from "./pages/admin/AdminTests";
import AdminAnnouncements from "./pages/admin/AdminAnnouncements";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Layout><Home /></Layout>} />
              <Route path="/auth" element={<Layout><Auth /></Layout>} />
              <Route path="/courses" element={<Layout><Courses /></Layout>} />
              <Route path="/courses/:slug" element={<Layout><CourseDetail /></Layout>} />
              <Route path="/learn/:slug" element={<RequireAuth><Layout><Learn /></Layout></RequireAuth>} />
              <Route path="/study" element={<RequireAuth><Layout><Study /></Layout></RequireAuth>} />
              <Route path="/dashboard" element={<RequireAuth><Layout><Dashboard /></Layout></RequireAuth>} />
              <Route path="/profile" element={<RequireAuth><Layout><Profile /></Layout></RequireAuth>} />
              <Route path="/refer" element={<RequireAuth><Layout><Refer /></Layout></RequireAuth>} />
              <Route path="/rewards" element={<RequireAuth><Layout><Rewards /></Layout></RequireAuth>} />
              <Route path="/test/:id" element={<RequireAuth><Layout><TestPage /></Layout></RequireAuth>} />
              <Route path="/leaderboard/:slug" element={<Layout><Leaderboard /></Layout>} />
              <Route path="/admin" element={<RequireAdmin><Layout><AdminLayout /></Layout></RequireAdmin>}>
                <Route index element={<AdminOverview />} />
                <Route path="courses" element={<AdminCourses />} />
                <Route path="courses/:id" element={<AdminCourseContent />} />
                <Route path="promocodes" element={<AdminPromocodes />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="revenue" element={<AdminRevenue />} />
                <Route path="tests" element={<AdminTests />} />
                <Route path="announcements" element={<AdminAnnouncements />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
