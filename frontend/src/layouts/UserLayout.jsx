import { Outlet, useLocation } from 'react-router-dom';
import TopNavBar from '../components/TopNavBar.jsx';
import Footer from '../components/Footer.jsx';
import FloatingChatbot from '../components/FloatingChatbot.jsx';

// User-facing layout: sticky header at top, footer pinned to the bottom of
// the viewport when content is short, floating chat button anchored to the
// bottom-right with enough padding to avoid covering CTAs. The Outlet area
// uses `flex-1` so the footer is always pushed to the end.
export default function UserLayout() {
  const location = useLocation();
  // Hide chat on the dedicated messages page (its own conversation UI).
  const hideChat = location.pathname.startsWith('/messages');

  return (
    <div className="min-h-screen flex flex-col bg-background text-on-background">
      <TopNavBar />
      <main className="flex-1 flex flex-col w-full">
        <Outlet />
      </main>
      <Footer />
      {!hideChat && <FloatingChatbot />}
    </div>
  );
}
