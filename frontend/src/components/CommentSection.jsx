import React, { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function CommentSection({ videoId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function getAuthHeaders() {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
  }

  useEffect(() => {
    loadComments();
  }, [videoId]);

  async function loadComments() {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/videos/${videoId}/comments`, { headers });
      const data = await response.json();
      setComments(data.comments || []);
      setError(null);
    } catch (err) {
      setError("Failed to load comments");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handlePostComment(e) {
    e.preventDefault();
    if (!newComment.trim()) return;

    try {
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/videos/${videoId}/comments`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ text: newComment })
      });

      if (!response.ok) throw new Error("Failed to post comment");

      const comment = await response.json();
      setComments([comment, ...comments]);
      setNewComment("");
    } catch (err) {
      setError("Failed to post comment");
      console.error(err);
    }
  }

  return (
    <div style={{ marginTop: "2rem", padding: "1rem", border: "1px solid #ddd", borderRadius: "8px" }}>
      <h3>Comments</h3>

      {error && <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>}

      <form onSubmit={handlePostComment} style={{ marginBottom: "1.5rem" }}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          maxLength={1000}
          style={{
            width: "100%",
            padding: "0.5rem",
            borderRadius: "4px",
            border: "1px solid #ddd",
            fontFamily: "inherit",
            marginBottom: "0.5rem"
          }}
          rows={3}
        />
        <button
          type="submit"
          disabled={!newComment.trim() || loading}
          style={{
            padding: "0.5rem 1rem",
            backgroundColor: "#0066cc",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          {loading ? "Posting..." : "Post Comment"}
        </button>
      </form>

      <div>
        {comments.length === 0 ? (
          <p style={{ color: "#666" }}>No comments yet. Be the first to comment!</p>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.commentId}
              style={{
                padding: "1rem",
                marginBottom: "0.5rem",
                backgroundColor: "#f5f5f5",
                borderRadius: "4px"
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: "0.25rem" }}>{comment.userName}</div>
              <div style={{ marginBottom: "0.5rem" }}>{comment.text}</div>
              <div style={{ fontSize: "0.875rem", color: "#666" }}>
                {new Date(comment.createdAt).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
