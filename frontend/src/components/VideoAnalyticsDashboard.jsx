import React, { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function VideoAnalyticsDashboard({ videoId }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function getAuthHeaders() {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
  }

  useEffect(() => {
    loadAnalytics();
  }, [videoId]);

  async function loadAnalytics() {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/videos/${videoId}/analytics`, { headers });

      if (!response.ok) throw new Error("Failed to load analytics");

      const data = await response.json();
      setAnalytics(data);
      setError(null);
    } catch (err) {
      setError("Failed to load analytics");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div>Loading analytics...</div>;
  if (error) return <div style={{ color: "red" }}>{error}</div>;
  if (!analytics) return null;

  return (
    <div style={{ padding: "1rem", backgroundColor: "#f5f5f5", borderRadius: "8px", marginTop: "2rem" }}>
      <h3>Video Analytics</h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginTop: "1rem"
        }}
      >
        <div style={{ padding: "1rem", backgroundColor: "white", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "0.875rem", color: "#666" }}>Total Views</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", marginTop: "0.5rem" }}>{analytics.totalWatches || 0}</div>
        </div>

        <div style={{ padding: "1rem", backgroundColor: "white", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "0.875rem", color: "#666" }}>Total Likes</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", marginTop: "0.5rem" }}>{analytics.totalLikes || 0}</div>
        </div>

        <div style={{ padding: "1rem", backgroundColor: "white", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "0.875rem", color: "#666" }}>Average Rating</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", marginTop: "0.5rem" }}>
            {analytics.averageRating} ★
          </div>
        </div>

        <div style={{ padding: "1rem", backgroundColor: "white", borderRadius: "4px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontSize: "0.875rem", color: "#666" }}>Engagement Events</div>
          <div style={{ fontSize: "2rem", fontWeight: "bold", marginTop: "0.5rem" }}>
            {analytics.totalEngagementEvents || 0}
          </div>
        </div>
      </div>

      {analytics.engagementBreakdown && (
        <div style={{ marginTop: "1.5rem", padding: "1rem", backgroundColor: "white", borderRadius: "4px" }}>
          <h4>Engagement Breakdown</h4>
          <div style={{ display: "flex", gap: "2rem", marginTop: "1rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: "0.875rem", color: "#666" }}>Plays</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{analytics.engagementBreakdown.plays}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", color: "#666" }}>Pauses</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{analytics.engagementBreakdown.pauses}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", color: "#666" }}>Skips</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{analytics.engagementBreakdown.skips}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.875rem", color: "#666" }}>Replays</div>
              <div style={{ fontSize: "1.5rem", fontWeight: "bold" }}>{analytics.engagementBreakdown.replays}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
