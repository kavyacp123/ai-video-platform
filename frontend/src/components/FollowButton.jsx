import React, { useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { UserPlus, UserCheck } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

export function FollowButton({ userId }) {
  const [following, setFollowing] = useState(false);
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

  async function handleFollow() {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const method = following ? "DELETE" : "POST";

      const response = await fetch(`${API_URL}/users/${userId}/follow`, {
        method,
        headers
      });

      if (!response.ok) throw new Error("Failed to update follow status");

      setFollowing(!following);
    } catch (error) {
      console.error("Error updating follow status:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className={`btn ${following ? "btn-secondary" : "btn-primary"}`}
      onClick={handleFollow}
      disabled={loading}
      style={{ marginLeft: "auto", borderRadius: "9999px", padding: "0.5rem 1.25rem", fontSize: "0.85rem" }}
    >
      {following ? <UserCheck size={16} /> : <UserPlus size={16} />}
      {following ? "Following" : "Follow"}
    </button>
  );
}
