import React, { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function RecommendationsPanel({ videoId, userId }) {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);

  async function getAuthHeaders() {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
  }

  useEffect(() => {
    loadRecommendations();
  }, [videoId]);

  async function loadRecommendations() {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/videos/${videoId}/recommendations?userId=${userId}&limit=6`, { headers });

      if (!response.ok) throw new Error("Failed to load recommendations");

      const data = await response.json();
      setRecommendations(data.recommendations || []);
    } catch (error) {
      console.error("Error loading recommendations:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={{ padding: "1rem", textAlign: "center" }}>Loading recommendations...</div>;

  return (
    <div style={{ marginTop: "2rem", padding: "1.5rem", backgroundColor: "#f5f5f5", borderRadius: "8px" }}>
      <h3>Recommended For You</h3>

      {recommendations.length === 0 ? (
        <p style={{ color: "#666" }}>No recommendations yet. Watch more videos to get personalized suggestions.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "1rem" }}>
          {recommendations.map((rec) => (
            <div
              key={rec.videoId}
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                overflow: "hidden",
                cursor: "pointer",
                boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                transition: "transform 0.2s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
              <div
                style={{
                  backgroundColor: "#000",
                  aspectRatio: "16/9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.75rem",
                  color: "#666"
                }}
              >
                Thumbnail
              </div>
              <div style={{ padding: "0.75rem" }}>
                <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem" }}>{rec.title}</h4>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: "0.75rem"
                  }}
                >
                  <span style={{ color: "#0066cc", fontWeight: "bold" }}>{rec.similarity}% match</span>
                  <span style={{ color: "#666" }}>Popular</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
