import React, { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import { MessageSquare, Send } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL;

export function CommentSection({ videoId }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
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
    <div className="glass-panel" style={{ padding: "1.5rem", border: "none" }}>
      <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <MessageSquare size={20} color="var(--accent-primary)" />
        {comments.length} Comments
      </h3>

      {error && <div style={{ color: "var(--danger)", marginBottom: "1rem", fontSize: "0.9rem" }}>{error}</div>}

      <form onSubmit={handlePostComment} style={{ marginBottom: "2rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a public comment..."
          maxLength={1000}
          style={{
            width: "100%",
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid var(--border-light)",
            backgroundColor: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            fontFamily: "inherit",
            resize: "vertical",
            outline: "none",
            transition: "border-color 0.2s"
          }}
          rows={2}
          onFocus={(e) => e.target.style.borderColor = "var(--accent-primary)"}
          onBlur={(e) => e.target.style.borderColor = "var(--border-light)"}
        />
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!newComment.trim() || loading}
          >
            <Send size={16} />
            {loading ? "Posting..." : "Comment"}
          </button>
        </div>
      </form>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {comments.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", textAlign: "center", padding: "2rem 0" }}>
            No comments yet. Be the first to start the conversation!
          </p>
        ) : (
          comments.map((comment) => (
            <div key={comment.commentId} style={{ display: "flex", gap: "1rem" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "var(--bg-tertiary)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                {comment.userName?.charAt(0).toUpperCase() || "U"}
              </div>
              <div style={{ flexGrow: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.25rem" }}>
                  <span style={{ fontWeight: "600", color: "var(--text-primary)", fontSize: "0.95rem" }}>
                    {comment.userName || "Anonymous"}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                    {new Date(comment.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div style={{ color: "var(--text-secondary)", lineHeight: "1.5", fontSize: "0.95rem" }}>
                  {comment.text}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
