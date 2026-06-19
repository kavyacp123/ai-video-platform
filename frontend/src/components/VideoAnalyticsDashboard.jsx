import React, { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { BarChart3, Eye, Heart, Star, Activity } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

export function VideoAnalyticsDashboard({ videoId }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

    async function getAuthHeaders() {
    try {
      const session = await fetchAuthSession();
      if (!session.tokens) return {};
      return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
    } catch (e) {
      return {};
    }
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

  if (loading) return (
    <div className="glass-panel" style={{ padding: "2rem", display: "flex", justifyContent: "center" }}>
      <div className="spinner"></div>
    </div>
  );
  if (error) return <div style={{ color: "var(--danger)", padding: "1rem" }}>{error}</div>;
  if (!analytics) return null;

  return (
    <div className="glass-panel" style={{ padding: "1.5rem" }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem", color: "var(--text-primary)" }}>
        <BarChart3 size={20} color="var(--accent-secondary)" />
        Video Analytics
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
        <div style={{ padding: "1rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Eye size={14} /> Total Views
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: "700", marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {analytics.totalWatches || 0}
          </div>
        </div>

        <div style={{ padding: "1rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Heart size={14} /> Total Likes
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: "700", marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {analytics.totalLikes || 0}
          </div>
        </div>

        <div style={{ padding: "1rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Star size={14} /> Avg Rating
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: "700", marginTop: "0.5rem", color: "var(--warning)" }}>
            {analytics.averageRating}
          </div>
        </div>

        <div style={{ padding: "1rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
          <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Activity size={14} /> Engagements
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: "700", marginTop: "0.5rem", color: "var(--accent-primary)" }}>
            {analytics.totalEngagementEvents || 0}
          </div>
        </div>
      </div>

      {analytics.engagementBreakdown && (
        <div style={{ marginTop: "1.5rem", padding: "1.25rem", backgroundColor: "var(--bg-tertiary)", borderRadius: "12px", border: "1px solid var(--border-light)" }}>
          <h4 style={{ fontSize: "0.95rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>Engagement Breakdown</h4>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Plays</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "600" }}>{analytics.engagementBreakdown.plays}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Pauses</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "600" }}>{analytics.engagementBreakdown.pauses}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Skips</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "600" }}>{analytics.engagementBreakdown.skips}</div>
            </div>
            <div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>Replays</div>
              <div style={{ fontSize: "1.25rem", fontWeight: "600" }}>{analytics.engagementBreakdown.replays}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
