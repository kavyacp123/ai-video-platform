import { useState } from "react";
import "@aws-amplify/ui-react/styles.css";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { UploadPage } from "./pages/UploadPage.jsx";
import { WatchPage } from "./pages/WatchPage.jsx";
import { AdminDashboard } from "./components/AdminDashboard.jsx";

function AppContent() {
  const [page, setPage] = useState("dashboard");
  const [watchVideoId, setWatchVideoId] = useState(null);

  const handlePageChange = (newPage, videoId = null) => {
    setPage(newPage);
    if (videoId) {
      setWatchVideoId(videoId);
    }
  };

  return (
    <div className="app-container">
      {page === "dashboard" && <DashboardPage onPageChange={handlePageChange} />}
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
