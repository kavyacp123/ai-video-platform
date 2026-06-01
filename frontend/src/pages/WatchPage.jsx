import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { ChevronLeft } from "lucide-react";
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

  if (loading) return <div style={{ textAlign: "center", padding: "2rem" }}>Loading video...</div>;
  if (!video) return <div style={{ textAlign: "center", padding: "2rem", color: "red" }}>Video not found</div>;

  return (
    <main style={{ backgroundColor: "#000", minHeight: "100vh" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <div style={{ padding: "1rem" }}>
          <button
            onClick={() => onPageChange("dashboard")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 1rem",
              backgroundColor: "rgba(255,255,255,0.1)",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            <ChevronLeft size={20} />
            Back
          </button>
        </div>

        <div style={{ aspectRatio: "16/9", backgroundColor: "#1a1a1a" }}>
          <video
            ref={videoRef}
            controls
            style={{ width: "100%", height: "100%" }}
            onPlay={(e) => {
              const tracker = {
                trackPlay: (pos) => console.log("Playing at:", pos),
                trackPause: (pos) => console.log("Paused at:", pos)
              };
            }}
          />
        </div>

        <div style={{ backgroundColor: "#111", color: "white" }}>
          <VideoWatch videoId={videoId} videoTitle={video.title} creatorUserId={video.userId} videoDuration={video.duration || 0} />
        </div>
      </div>
    </main>
  );
}
