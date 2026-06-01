import React, { useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function LikeButton({ videoId }) {
  const [liked, setLiked] = useState(false);
  const [loading, setLoading] = useState(false);

  async function getAuthHeaders() {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
  }

  async function handleLike() {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const method = liked ? "DELETE" : "POST";

      const response = await fetch(`${API_URL}/videos/${videoId}/like`, {
        method,
        headers
      });

      if (!response.ok) throw new Error("Failed to update like");

      setLiked(!liked);
    } catch (error) {
      console.error("Error updating like:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLike}
      disabled={loading}
      style={{
        padding: "0.5rem 1rem",
        backgroundColor: liked ? "#ff4444" : "#ddd",
        color: liked ? "white" : "black",
        border: "none",
        borderRadius: "4px",
        cursor: loading ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem"
      }}
    >
      {liked ? "❤️" : "🤍"} {liked ? "Unlike" : "Like"}
    </button>
  );
}
