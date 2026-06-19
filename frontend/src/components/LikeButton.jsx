import React, { useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { Heart } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

export function LikeButton({ videoId }) {
  const [liked, setLiked] = useState(false);
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
      className="btn"
      onClick={handleLike}
      disabled={loading}
      style={{
        backgroundColor: liked ? "rgba(239, 68, 68, 0.15)" : "var(--bg-tertiary)",
        color: liked ? "var(--danger)" : "var(--text-secondary)",
        border: `1px solid ${liked ? "rgba(239, 68, 68, 0.3)" : "var(--border-light)"}`,
        transition: "all 0.2s ease"
      }}
    >
      <Heart size={18} fill={liked ? "currentColor" : "none"} />
      {liked ? "Liked" : "Like"}
    </button>
  );
}
