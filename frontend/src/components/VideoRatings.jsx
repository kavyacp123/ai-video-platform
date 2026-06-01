import React, { useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function VideoRatings({ videoId }) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function getAuthHeaders() {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
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
    <div style={{ padding: "1rem", backgroundColor: "#f9f9f9", borderRadius: "8px" }}>
      <div style={{ marginBottom: "1rem" }}>
        <h4>Rate this video</h4>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              onClick={() => handleRating(value)}
              onMouseEnter={() => setHoveredRating(value)}
              onMouseLeave={() => setHoveredRating(0)}
              disabled={loading}
              style={{
                fontSize: "2rem",
                border: "none",
                backgroundColor: "transparent",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: hoveredRating >= value || rating >= value ? 1 : 0.3,
                transition: "opacity 0.2s"
              }}
            >
              ★
            </button>
          ))}
        </div>
        {submitted && <p style={{ color: "green", marginTop: "0.5rem" }}>Rating submitted!</p>}
      </div>
    </div>
  );
}
