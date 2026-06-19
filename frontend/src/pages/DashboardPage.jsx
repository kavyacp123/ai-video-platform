import { useEffect, useState } from "react";
import { signOut } from "aws-amplify/auth";
import { Grid2X2, Upload, LogOut, PlayCircle, Loader2 } from "lucide-react";
import { api } from "../services/api.js";

const CLOUDFRONT_DOMAIN = import.meta.env.VITE_CLOUDFRONT_DOMAIN || "";

export function DashboardPage({ onPageChange }) {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    try {
      const data = await api.listVideos();
      setLibrary(data.items || []);
    } catch (error) {
      console.error("Failed to load library:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      window.location.href = "/";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const getMediaUrl = (key) => {
    if (!key) return null;
    if (key.startsWith('http')) return key;
    return CLOUDFRONT_DOMAIN ? `https://${CLOUDFRONT_DOMAIN}/${key}` : null;
  };

  return (
    <div className="fade-in">
      <nav className="navbar">
        <div className="navbar-brand">
          <PlayCircle size={28} />
          <span>NovaStream</span>
        </div>
        <div className="navbar-actions">
          <button className="btn btn-primary" onClick={() => onPageChange("upload")}>
            <Upload size={18} />
            Upload Video
          </button>
          <button className="btn btn-secondary" onClick={handleLogout}>
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </nav>

      <main className="page-container">
        <header style={{ marginBottom: "2rem" }}>
          <h1>Your Studio</h1>
          <p>Manage, preview, and watch your uploaded videos.</p>
        </header>

        {loading ? (
          <div className="loader-container">
            <div className="spinner"></div>
            <p>Loading your library...</p>
          </div>
        ) : library.length === 0 ? (
          <div className="empty-state">
            <Grid2X2 size={64} />
            <h3>No videos yet</h3>
            <p>Your studio is empty! Upload your first video to see the AI magic in action.</p>
            <button className="btn btn-primary" onClick={() => onPageChange("upload")}>
              <Upload size={18} />
              Upload Now
            </button>
          </div>
        ) : (
          <div className="video-grid">
            {library.map((video) => {
              const thumbnailUrl = getMediaUrl(video.thumbnailUrl);
              const previewClipUrl = video.clips?.[0]?.s3Key ? getMediaUrl(video.clips[0].s3Key) : null;
              
              return (
                <div
                  key={video.videoId}
                  className="video-card glass-panel"
                  onClick={() => onPageChange("watch", video.videoId)}
                >
                  <div className="video-card-thumbnail-container">
                    {thumbnailUrl ? (
                      <img src={thumbnailUrl} alt={video.title} className="video-card-thumbnail" />
                    ) : (
                      <div className="loader-container" style={{ padding: "2rem", height: "100%" }}>
                        {video.status === "PROCESSING" ? <div className="spinner"></div> : <PlayCircle size={48} color="#4f46e5" />}
                      </div>
                    )}
                    
                    {/* The Netflix-Style Hover Preview Magic */}
                    {previewClipUrl && (
                      <video 
                        src={previewClipUrl} 
                        className="video-card-preview" 
                        muted 
                        loop 
                        playsInline
                        onMouseOver={(e) => e.target.play().catch(() => {})}
                        onMouseOut={(e) => { e.target.pause(); e.target.currentTime = 0; }}
                      />
                    )}
                  </div>
                  
                  <div className="video-card-info">
                    <div className="video-card-title">{video.title || "Untitled Video"}</div>
                    <div className="video-card-meta">
                      <span className={`status-badge status-${video.status}`}>
                        {video.status}
                      </span>
                      <span>
                        {new Date(video.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
