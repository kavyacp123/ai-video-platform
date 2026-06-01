import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { api } from "../services/api.js";

const API_URL = import.meta.env.VITE_API_URL || "";

export function UploadPage({ onPageChange }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [videoId, setVideoId] = useState(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files?.[0];
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
    setMessage("Creating secure upload URL...");

    try {
      const uploadConfig = await api.getUploadUrl(file.name, file.type || "video/mp4", file.size);
      if (uploadConfig.error) throw new Error(uploadConfig.error);

      setVideoId(uploadConfig.videoId);
      setMessage("Uploading to S3...");

      await api.uploadToS3(uploadConfig.uploadUrl, file, (percent) => {
        setProgress(percent);
      });

      setMessage("✓ Upload complete! Processing started...");
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
    <main style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem" }}>
      <div style={{ marginBottom: "2rem" }}>
        <button
          onClick={() => onPageChange("dashboard")}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#ddd",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          ← Back to Dashboard
        </button>
      </div>

      <div
        style={{
          backgroundColor: "white",
          borderRadius: "12px",
          padding: "3rem",
          boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          textAlign: "center"
        }}
      >
        <h1 style={{ marginTop: 0 }}>Upload Video</h1>

        {!file ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed #0066cc",
              borderRadius: "8px",
              padding: "3rem",
              backgroundColor: "#f0f7ff",
              cursor: "pointer",
              marginBottom: "1.5rem",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "#e8f1ff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "#f0f7ff";
            }}
          >
            <Upload size={48} style={{ color: "#0066cc", margin: "0 auto", marginBottom: "1rem" }} />
            <p style={{ margin: 0, fontSize: "1.125rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
              Drop your video here or click to select
            </p>
            <p style={{ margin: 0, color: "#666", fontSize: "0.875rem" }}>
              Supported formats: MP4, WebM, MOV (Max 5GB)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
          </div>
        ) : (
          <div style={{ marginBottom: "1.5rem" }}>
            <div
              style={{
                backgroundColor: "#f0f7ff",
                border: "1px solid #0066cc",
                borderRadius: "8px",
                padding: "1rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}
            >
              <div style={{ textAlign: "left" }}>
                <p style={{ margin: 0, fontWeight: "bold" }}>{file.name}</p>
                <p style={{ margin: "0.25rem 0 0 0", color: "#666", fontSize: "0.875rem" }}>
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={() => setFile(null)}
                disabled={uploading}
                style={{ backgroundColor: "transparent", border: "none", cursor: "pointer" }}
              >
                <X size={20} />
              </button>
            </div>
          </div>
        )}

        {uploading && (
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ marginBottom: "0.5rem", textAlign: "left" }}>
              <p style={{ margin: 0, fontSize: "0.875rem" }}>Upload Progress: {progress}%</p>
            </div>
            <div
              style={{
                backgroundColor: "#e0e0e0",
                borderRadius: "8px",
                overflow: "hidden",
                height: "8px"
              }}
            >
              <div
                style={{
                  backgroundColor: "#0066cc",
                  height: "100%",
                  width: `${progress}%`,
                  transition: "width 0.2s"
                }}
              />
            </div>
          </div>
        )}

        {message && (
          <p
            style={{
              padding: "0.75rem",
              borderRadius: "4px",
              marginBottom: "1rem",
              backgroundColor: message.startsWith("✓") ? "#e8f5e9" : "#ffebee",
              color: message.startsWith("✓") ? "#2e7d32" : "#c62828"
            }}
          >
            {message}
          </p>
        )}

        {file && !uploading && (
          <button
            onClick={handleUpload}
            style={{
              padding: "0.75rem 2rem",
              backgroundColor: "#0066cc",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "1rem"
            }}
          >
            Start Upload
          </button>
        )}
      </div>
    </main>
  );
}
