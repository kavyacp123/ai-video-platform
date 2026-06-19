import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { ChevronLeft, PlayCircle } from "lucide-react";
import { api } from "../services/api.js";
import { VideoWatch } from "../components/VideoWatch.jsx";

export function WatchPage({ videoId, onPageChange }) {
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef(null);

  useEffect(() => {
    loadVideo();
  }, [videoId]);

  useEffect(() => {
    if (!video?.playbackUrl || !videoRef.current) return;

    const element = videoRef.current;

    if (element.canPlayType("application/vnd.apple.mpegurl")) {
      element.src = video.playbackUrl;
      return;
    }

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(video.playbackUrl);
      hls.attachMedia(element);
      return () => hls.destroy();
    }
  }, [video?.playbackUrl]);

  const loadVideo = async () => {
    try {
      const data = await api.getVideo(videoId);
      setVideo(data);
    } catch (error) {
      console.error("Failed to load video:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="app-container loader-container">
      <div className="spinner"></div>
      <p>Loading stream...</p>
    </div>
  );

  if (!video) return (
    <div className="app-container empty-state">
      <h3>Video not found</h3>
      <button className="btn btn-primary" onClick={() => onPageChange("dashboard")}>Go Home</button>
    </div>
  );

  return (
    <div className="app-container fade-in" style={{ backgroundColor: "#000" }}>
      <nav className="navbar" style={{ background: "transparent", borderBottom: "none" }}>
        <div className="navbar-actions">
          <button className="btn btn-secondary" onClick={() => onPageChange("dashboard")} style={{ background: "rgba(255,255,255,0.1)", border: "none" }}>
            <ChevronLeft size={18} />
            Back to Studio
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: "1600px", margin: "0 auto", width: "100%" }}>
        {/* Cinematic Player */}
        <div style={{ aspectRatio: "16/9", backgroundColor: "#000", position: "relative", boxShadow: "0 20px 40px rgba(0,0,0,0.8)" }}>
          <video
            ref={videoRef}
            controls
            autoPlay
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        {/* Video Metadata Panel */}
        <div className="page-container" style={{ padding: "3rem 5%" }}>
          <div className="glass-panel" style={{ padding: "2rem", border: "none", background: "var(--bg-secondary)" }}>
             <VideoWatch videoId={videoId} videoTitle={video.title} creatorUserId={video.userId} videoDuration={video.duration || 0} />
          </div>
        </div>
      </main>
    </div>
  );
}
