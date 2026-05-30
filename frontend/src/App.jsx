import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { signInWithRedirect } from "aws-amplify/auth";
import {
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Film,
  Grid2X2,
  LogIn,
  Play,
  RefreshCw,
  Subtitles,
  UploadCloud,
  Video
} from "lucide-react";
import { api } from "./services/api.js";

const API_URL = import.meta.env.VITE_API_URL || "";

const statusLabels = {
  UPLOAD_URL_CREATED: "Waiting for upload",
  AI_PLAN_CREATED: "AI plan created",
  TRANSCODING: "Transcoding to HLS",
  READY: "Ready to stream",
  FAILED: "Processing failed"
};

function App() {
  const [page, setPage] = useState("dashboard");
  const [file, setFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [video, setVideo] = useState(null);
  const [library, setLibrary] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState("Choose a video to begin.");
  const videoRef = useRef(null);

  const canUseApi = Boolean(API_URL);

  useEffect(() => {
    if (!video?.playbackUrl || !videoRef.current) {
      return;
    }

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

  const createUploadAndSendFile = async () => {
    if (!file || !canUseApi) {
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setMessage("Creating secure upload URL...");

    try {
      const uploadConfig = await api.getUploadUrl(file.name, file.type || "video/mp4", file.size);
      if (uploadConfig.error) throw new Error(uploadConfig.message || uploadConfig.error);
      setVideo({ videoId: uploadConfig.videoId, status: "UPLOAD_URL_CREATED" });
      setMessage("Uploading directly to S3...");

      await api.uploadToS3(uploadConfig.uploadUrl, file, (progress) => setUploadProgress(progress));

      setMessage("Upload complete. MediaConvert will start soon.");
      await refreshVideo(uploadConfig.videoId);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setIsUploading(false);
    }
  };

  const refreshVideo = async (videoId = video?.videoId) => {
    if (!videoId || !canUseApi) {
      return;
    }

    const data = await api.getVideo(videoId);
    if (data.error) throw new Error(data.message || data.error);
    setVideo(data);
    setMessage(statusLabels[data.status] || data.status || "Video updated.");
  };

  const loadLibrary = async () => {
    if (!canUseApi) return;
    const data = await api.listVideos();
    setLibrary(data.items || []);
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="intro">
          <div className="brand-mark">
            <Video size={26} />
          </div>
          <div>
            <p className="eyebrow">Serverless AI Video Platform</p>
            <h1>Upload, orchestrate, and stream AI-processed video globally.</h1>
          </div>
        </div>

        <nav className="nav-tabs">
          <button className={page === "auth" ? "secondary active" : "secondary"} onClick={() => setPage("auth")}>
            <LogIn size={18} />
            Auth
          </button>
          <button
            className={page === "dashboard" ? "secondary active" : "secondary"}
            onClick={() => {
              setPage("dashboard");
              loadLibrary();
            }}
          >
            <Grid2X2 size={18} />
            Dashboard
          </button>
          <button className={page === "upload" ? "secondary active" : "secondary"} onClick={() => setPage("upload")}>
            <UploadCloud size={18} />
            Upload
          </button>
          <button className={page === "watch" ? "secondary active" : "secondary"} onClick={() => setPage("watch")}>
            <Play size={18} />
            Watch
          </button>
        </nav>

        {page === "auth" && <AuthPage />}
        {page === "dashboard" && <DashboardPage library={library} onRefresh={loadLibrary} onWatch={(item) => {
          setVideo(item);
          setPage("watch");
        }} />}
        {page === "upload" && (
        <div className="control-panel">
          <label className="drop-zone">
            <UploadCloud size={34} />
            <span>{file ? file.name : "Select an MP4, MOV, or WebM file"}</span>
            <input
              type="file"
              accept="video/*"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>

          <div className="actions">
            <button onClick={createUploadAndSendFile} disabled={!file || isUploading || !canUseApi}>
              {isUploading ? <RefreshCw className="spin" size={18} /> : <UploadCloud size={18} />}
              Upload
            </button>
            <button className="secondary" onClick={() => refreshVideo()} disabled={!video?.videoId}>
              <RefreshCw size={18} />
              Refresh
            </button>
          </div>

          {!canUseApi && (
            <p className="notice">Set VITE_API_URL in frontend/.env after deploying the CDK stack.</p>
          )}

          {isUploading && (
            <div className="progress-bar">
              <span style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
        </div>
        )}

        {page !== "auth" && (
        <div className="status-strip">
          <StatusItem icon={<CheckCircle2 size={18} />} label="Upload" active={Boolean(video)} />
          <StatusItem icon={<BrainCircuit size={18} />} label="AI Plan" active={Boolean(video?.processingPlan)} />
          <StatusItem icon={<Clock3 size={18} />} label="Transcode" active={video?.status === "TRANSCODING"} />
          <StatusItem icon={<Subtitles size={18} />} label="Subtitles" active={Boolean(video?.subtitles)} />
          <StatusItem icon={<Play size={18} />} label="Playback" active={Boolean(video?.playbackUrl)} />
        </div>
        )}

        <p className="message">{message}</p>

        {page === "watch" && (
        <section className="player-area">
          {video?.playbackUrl ? (
            <video ref={videoRef} controls playsInline />
          ) : (
            <div className="empty-player">
              <Play size={44} />
              <span>HLS playback appears here after processing.</span>
            </div>
          )}
        </section>
        )}

        {video && (
          <dl className="metadata">
            <div>
              <dt>Video ID</dt>
              <dd>{video.videoId}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{statusLabels[video.status] || video.status}</dd>
            </div>
            {video.playbackUrl && (
              <div>
                <dt>HLS URL</dt>
                <dd>{video.playbackUrl}</dd>
              </div>
            )}
          </dl>
        )}

        {video?.processingPlan && (
          <section className="plan-panel">
            <div className="plan-heading">
              <BrainCircuit size={22} />
              <h2>Supervisor Plan</h2>
            </div>
            <p>{video.processingPlan.reason}</p>
            <div className="plan-grid">
              <PlanFlag label="HLS" enabled={video.processingPlan.generateHls} />
              <PlanFlag label="Subtitles" enabled={video.processingPlan.generateSubtitles} />
              <PlanFlag label="Thumbnail" enabled={video.processingPlan.generateThumbnail} />
              <PlanFlag label="Highlights" enabled={video.processingPlan.generateHighlights} />
            </div>
            <div className="renditions">
              {(video.processingPlan.renditions || []).map((rendition) => (
                <span key={rendition.name}>
                  {rendition.name} · {rendition.bitrate / 1000000} Mbps
                </span>
              ))}
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

function AuthPage() {
  return (
    <section className="plan-panel">
      <div className="plan-heading">
        <LogIn size={22} />
        <h2>Auth</h2>
      </div>
      <p>Cognito Hosted UI and Google OAuth are configured in CDK. Sign in to upload and manage videos.</p>
      <div className="actions">
        <button onClick={() => signInWithRedirect({ provider: "Google" })}>Continue With Google</button>
      </div>
    </section>
  );
}

function DashboardPage({ library, onRefresh, onWatch }) {
  return (
    <section className="library-panel">
      <div className="library-header">
        <h2>Video Library</h2>
        <button className="secondary" onClick={onRefresh}>
          <RefreshCw size={18} />
          Refresh
        </button>
      </div>
      <div className="video-grid">
        {library.length === 0 ? (
          <div className="empty-card">
            <Film size={34} />
            <span>No videos loaded yet.</span>
          </div>
        ) : (
          library.map((item) => <VideoCard key={item.videoId} item={item} onWatch={() => onWatch(item)} />)
        )}
      </div>
    </section>
  );
}

function VideoCard({ item, onWatch }) {
  return (
    <article className="video-card">
      <div className="poster">{item.thumbnailUrl ? <img src={item.thumbnailUrl} alt="" /> : <Video size={32} />}</div>
      <h3>{item.title || item.videoId}</h3>
      <span className="badge">{statusLabels[item.status] || item.status}</span>
      <button className="secondary" onClick={onWatch}>
        <Play size={18} />
        Watch
      </button>
    </article>
  );
}

function StatusItem({ icon, label, active }) {
  return (
    <div className={active ? "status-item active" : "status-item"}>
      {icon}
      <span>{label}</span>
    </div>
  );
}

function PlanFlag({ label, enabled }) {
  return (
    <div className={enabled ? "plan-flag enabled" : "plan-flag"}>
      <span>{label}</span>
      <strong>{enabled ? "On" : "Off"}</strong>
    </div>
  );
}

export default App;
