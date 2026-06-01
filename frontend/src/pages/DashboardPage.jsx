import { useEffect, useState } from "react";
import { signOut } from "aws-amplify/auth";
import { Grid2X2, Upload, LogOut } from "lucide-react";
import { api } from "../services/api.js";

const API_URL = import.meta.env.VITE_API_URL || "";

export function DashboardPage({ onPageChange }) {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    if (!API_URL) return;
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

  return (
    <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1 style={{ margin: 0, marginBottom: "0.5rem" }}>Video Library</h1>
          <p style={{ color: "#666", margin: 0 }}>Manage and watch your videos</p>
        </div>
        <div style={{ display: "flex", gap: "1rem" }}>
          <button
            onClick={() => onPageChange("upload")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              backgroundColor: "#0066cc",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            <Upload size={20} />
            Upload Video
          </button>
          <button
            onClick={handleLogout}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              backgroundColor: "#ff4444",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer"
            }}
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem" }}>Loading videos...</div>
      ) : library.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
          <Grid2X2 size={48} style={{ color: "#ccc", margin: "0 auto", marginBottom: "1rem" }} />
          <p style={{ color: "#666", marginBottom: "1.5rem" }}>No videos yet. Upload your first video to get started!</p>
          <button
            onClick={() => onPageChange("upload")}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#0066cc",
              color: "white",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: "bold"
            }}
          >
            Upload Video
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: "1.5rem" }}>
          {library.map((video) => (
            <div
              key={video.videoId}
              onClick={() => onPageChange("watch", video.videoId)}
              style={{
                cursor: "pointer",
                borderRadius: "8px",
                overflow: "hidden",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                transition: "transform 0.2s, box-shadow 0.2s",
                backgroundColor: "white"
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = "0 8px 16px rgba(0,0,0,0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
              }}
            >
              <div
                style={{
                  backgroundColor: "#000",
                  aspectRatio: "16/9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.875rem",
                  color: "#666"
                }}
              >
                Thumbnail
              </div>
              <div style={{ padding: "1rem" }}>
                <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>{video.title}</h3>
                <p style={{ margin: "0.25rem 0", fontSize: "0.875rem", color: "#666" }}>
                  Status: <strong>{video.status}</strong>
                </p>
                <p style={{ margin: "0.25rem 0", fontSize: "0.875rem", color: "#666" }}>
                  {new Date(video.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
