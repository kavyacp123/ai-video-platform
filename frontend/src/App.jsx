import { useState, useEffect } from "react";
import "@aws-amplify/ui-react/styles.css";
import { getCurrentUser, signOut } from "aws-amplify/auth";
import { Hub } from "aws-amplify/utils";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { UploadPage } from "./pages/UploadPage.jsx";
import { WatchPage } from "./pages/WatchPage.jsx";
import { AdminDashboard } from "./components/AdminDashboard.jsx";
import LandingPage from "./pages/LandingPage.jsx";

function AppContent() {
  const [page, setPage] = useState("dashboard");
  const [watchVideoId, setWatchVideoId] = useState(null);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    checkAuth();

    const unsubscribe = Hub.listen("auth", ({ payload }) => {
      if (payload.event === "signedIn") {
        checkAuth();
      }
      if (payload.event === "signedOut") {
        setUser(null);
      }
    });
    return unsubscribe;
  }, []);

  async function checkAuth() {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch {
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      setUser(null);
      setPage("dashboard");
    } catch (error) {
      console.error("Sign out error:", error);
    }
  }

  const handlePageChange = (newPage, videoId = null) => {
    setPage(newPage);
    if (videoId) {
      setWatchVideoId(videoId);
    }
  };

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  // Show landing page if not signed in
  if (!user) {
    return <LandingPage />;
  }

  return (
    <div className="app-container">
      {page === "dashboard" && <DashboardPage onPageChange={handlePageChange} onSignOut={handleSignOut} user={user} />}
      {page === "upload" && <UploadPage onPageChange={handlePageChange} />}
      {page === "watch" && watchVideoId && <WatchPage videoId={watchVideoId} onPageChange={handlePageChange} />}
      {page === "admin" && <AdminDashboard onPageChange={handlePageChange} />}
    </div>
  );
}

export default function App() {
  return (
    <AppContent />
  );
}
