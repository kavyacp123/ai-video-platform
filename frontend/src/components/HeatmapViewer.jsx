import React, { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function HeatmapViewer({ videoId, videoDuration }) {
  const [heatmap, setHeatmap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  async function getAuthHeaders() {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
  }

  useEffect(() => {
    loadHeatmap();
  }, [videoId]);

  async function loadHeatmap() {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/videos/${videoId}/heatmap`, { headers });

      if (!response.ok) throw new Error("Failed to load heatmap");

      const data = await response.json();
      setHeatmap(data.heatmap);
      setStats(data.stats);
    } catch (error) {
      console.error("Error loading heatmap:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{ padding: "1rem", textAlign: "center" }}>Loading heatmap...</div>;
  if (!heatmap) return null;

  const maxValue = Math.max(...Object.values(heatmap).map((v) => v.plays || 0));

  return (
    <div style={{ marginTop: "2rem", padding: "1.5rem", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
      <h3>Viewer Heatmap</h3>

      {stats && (
        <div style={{ marginBottom: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ fontSize: "0.875rem" }}>
            <span style={{ color: "#666" }}>Total Events:</span> <strong>{stats.totalEvents}</strong>
          </div>
          <div style={{ fontSize: "0.875rem" }}>
            <span style={{ color: "#666" }}>Avg Engagement:</span> <strong>{stats.avgEngagement}</strong>
          </div>
          <div style={{ fontSize: "0.875rem" }}>
            <span style={{ color: "#666" }}>Plays:</span> <strong>{stats.eventBreakdown.play}</strong>
          </div>
          <div style={{ fontSize: "0.875rem" }}>
            <span style={{ color: "#666" }}>Skips:</span> <strong>{stats.eventBreakdown.skip}</strong>
          </div>
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <div style={{ height: "60px", backgroundColor: "white", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
          {Object.entries(heatmap)
            .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
            .map(([time, data]) => {
              const height = ((data.plays || 0) / maxValue) * 100;
              const intensity = Math.round(((data.plays || 0) / maxValue) * 100);
              return (
                <div
                  key={time}
                  style={{
                    flex: 1,
                    height: "100%",
                    backgroundColor: getHeatmapColor(intensity),
                    cursor: "pointer",
                    transition: "opacity 0.2s",
                    opacity: 0.7
                  }}
                  title={`${time}s: ${data.plays} plays, ${data.skips} skips`}
                  onMouseEnter={(e) => (e.target.style.opacity = "1")}
                  onMouseLeave={(e) => (e.target.style.opacity = "0.7")}
                />
              );
            })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.75rem",
            color: "#666",
            marginTop: "0.5rem"
          }}
        >
          <span>0s</span>
          <span>{videoDuration || "Unknown"}s</span>
        </div>
      </div>

      <div style={{ padding: "0.75rem", backgroundColor: "white", borderRadius: "4px", fontSize: "0.875rem" }}>
        <p style={{ margin: 0, marginBottom: "0.5rem" }}>
          <strong>Color Legend:</strong>
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "2px",
                backgroundColor: "#ff4444"
              }}
            />
            <span>High engagement</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "2px",
                backgroundColor: "#ffaa00"
              }}
            />
            <span>Medium engagement</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "16px",
                height: "16px",
                borderRadius: "2px",
                backgroundColor: "#44ff44"
              }}
            />
            <span>Low engagement</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function getHeatmapColor(intensity) {
  // Green (low) → Yellow → Red (high)
  if (intensity < 33) return "#44ff44";
  if (intensity < 66) return "#ffaa00";
  return "#ff4444";
}
