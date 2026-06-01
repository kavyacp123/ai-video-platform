import React, { useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function FollowButton({ userId }) {
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  async function getAuthHeaders() {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
  }

  async function handleFollow() {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const method = following ? "DELETE" : "POST";

      const response = await fetch(`${API_URL}/users/${userId}/follow`, {
        method,
        headers
      });

      if (!response.ok) throw new Error("Failed to update follow");

      setFollowing(!following);
    } catch (error) {
      console.error("Error updating follow:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleFollow}
      disabled={loading}
      style={{
        padding: "0.5rem 1rem",
        backgroundColor: following ? "#0066cc" : "#ddd",
        color: following ? "white" : "black",
        border: "none",
        borderRadius: "4px",
        cursor: loading ? "not-allowed" : "pointer"
      }}
    >
      {loading ? "..." : following ? "Following" : "Follow"}
    </button>
  );
}
