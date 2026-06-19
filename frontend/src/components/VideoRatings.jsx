import React, { useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { Star } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

export function VideoRatings({ videoId }) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

    async function getAuthHeaders() {
    try {
      const session = await fetchAuthSession();
      if (!session.tokens) return {};
      return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
    } catch (e) {
      return {};
    }
  }

  async function handleRating(value) {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/videos/${videoId}/rate`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ rating: value })
      });

      if (!response.ok) throw new Error("Failed to submit rating");

      setRating(value);
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 2000);
    } catch (error) {
      console.error("Error submitting rating:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", background: "var(--bg-tertiary)", padding: "0.5rem 1rem", borderRadius: "8px", border: "1px solid var(--border-light)" }}>
      <span style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 600 }}>Rate:</span>
      <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
        {[1, 2, 3, 4, 5].map((value) => {
          const isActive = hoveredRating >= value || rating >= value;
          return (
            <button
              key={value}
              onClick={() => handleRating(value)}
              onMouseEnter={() => setHoveredRating(value)}
              onMouseLeave={() => setHoveredRating(0)}
              disabled={loading}
              style={{
                border: "none",
                backgroundColor: "transparent",
                cursor: loading ? "not-allowed" : "pointer",
                padding: "0.25rem",
                display: "flex",
                color: isActive ? "var(--warning)" : "var(--text-tertiary)",
                transition: "color 0.2s, transform 0.1s",
                transform: hoveredRating === value ? "scale(1.2)" : "scale(1)"
              }}
            >
              <Star size={20} fill={isActive ? "currentColor" : "none"} />
            </button>
          );
        })}
      </div>
      {submitted && <span style={{ fontSize: "0.85rem", color: "var(--success)", animation: "fadeIn 0.3s ease" }}>Thanks!</span>}
    </div>
  );
}
