import { useRef, useState } from "react";
import { Upload, X, ChevronLeft, Film, CloudLightning } from "lucide-react";
import { api } from "../services/api.js";

const API_URL = import.meta.env.VITE_API_URL || "";

export function UploadPage({ onPageChange }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type.startsWith("video/")) {
      setFile(selectedFile);
      setMessage("");
    } else {
      setMessage("Please select a valid video file (MP4, WebM, MOV)");
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    const selectedFile = e.dataTransfer.files?.[0];
    if (selectedFile && selectedFile.type.startsWith("video/")) {
      setFile(selectedFile);
      setMessage("");
    } else {
      setMessage("Please select a valid video file");
    }
  };

  const handleUpload = async () => {
    if (!file || !API_URL) return;

    setUploading(true);
    setProgress(0);
    setMessage("Initializing quantum upload tunnel...");

    try {
      const uploadConfig = await api.getUploadUrl(file.name, file.type || "video/mp4", file.size);
      if (uploadConfig.error) throw new Error(uploadConfig.error);

      setMessage("Uploading to NovaStream...");

      await api.uploadToS3(uploadConfig.uploadUrl, file, (percent) => {
        setProgress(percent);
      });

      setMessage("✓ Upload complete! AI Processing has begun.");
      setFile(null);
      setProgress(0);

      setTimeout(() => {
        onPageChange("dashboard");
      }, 2000);
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fade-in">
      <nav className="navbar">
        <div className="navbar-brand">
          <Film size={28} />
          <span>Upload Studio</span>
        </div>
        <div className="navbar-actions">
          <button className="btn btn-secondary" onClick={() => onPageChange("dashboard")}>
            <ChevronLeft size={18} />
            Back to Dashboard
          </button>
        </div>
      </nav>

      <main className="page-container" style={{ maxWidth: "800px", marginTop: "4rem" }}>
        <div className="glass-panel" style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <CloudLightning size={48} style={{ color: "var(--accent-primary)", marginBottom: "1rem" }} />
          <h1 style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>Deploy Video</h1>
          <p style={{ marginBottom: "3rem" }}>Our AI will automatically transcribe, moderate, and extract highlights.</p>

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragActive ? "var(--accent-primary)" : "var(--border-light)"}`,
                borderRadius: "16px",
                padding: "4rem 2rem",
                backgroundColor: isDragActive ? "rgba(99, 102, 241, 0.1)" : "var(--bg-secondary)",
                cursor: "pointer",
                transition: "all 0.3s ease",
                transform: isDragActive ? "scale(1.02)" : "scale(1)"
              }}
            >
              <Upload size={48} style={{ color: "var(--text-tertiary)", margin: "0 auto", marginBottom: "1rem" }} />
              <h3 style={{ marginBottom: "0.5rem" }}>Drag & Drop your video</h3>
              <p style={{ fontSize: "0.9rem" }}>Supported formats: MP4, WebM, MOV (Max 5GB)</p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
            </div>
          ) : (
            <div style={{ textAlign: "left", backgroundColor: "var(--bg-secondary)", padding: "1.5rem", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <div>
                  <h4 style={{ margin: 0, color: "var(--text-primary)" }}>{file.name}</h4>
                  <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>{(file.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
                <button
                  onClick={() => setFile(null)}
                  disabled={uploading}
                  style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer" }}
                >
                  <X size={24} />
                </button>
              </div>

              {uploading && (
                <div style={{ marginTop: "1.5rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
                    <span>Uploading...</span>
                    <span>{progress}%</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", backgroundColor: "var(--bg-tertiary)", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent-gradient)", transition: "width 0.2s ease" }} />
                  </div>
                </div>
              )}
            </div>
          )}

          {message && (
            <div style={{
              marginTop: "2rem",
              padding: "1rem",
              borderRadius: "8px",
              backgroundColor: message.includes("Error") ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
              color: message.includes("Error") ? "var(--danger)" : "var(--success)",
              border: `1px solid ${message.includes("Error") ? "rgba(239, 68, 68, 0.2)" : "rgba(34, 197, 94, 0.2)"}`
            }}>
              {message}
            </div>
          )}

          {file && !uploading && (
            <div style={{ marginTop: "2rem" }}>
              <button className="btn btn-primary" onClick={handleUpload} style={{ width: "100%", padding: "1rem", fontSize: "1.1rem" }}>
                <Upload size={20} />
                Deploy Video to AI
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
