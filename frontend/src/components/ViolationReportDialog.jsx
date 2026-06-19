import React, { useState } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

const VIOLATION_REASONS = [
  { value: "copyright", label: "Copyright Infringement" },
  { value: "hate_speech", label: "Hate Speech" },
  { value: "violent_content", label: "Violent Content" },
  { value: "spam", label: "Spam" },
  { value: "misinformation", label: "Misinformation" },
  { value: "sexual_content", label: "Sexual Content" },
  { value: "other", label: "Other" }
];

export function ViolationReportDialog({ videoId, onClose }) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
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

  async function handleSubmit(e) {
    e.preventDefault();

    if (!reason || !description.trim()) {
      setError("Please fill in all fields");
      return;
    }

    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const response = await fetch(`${API_URL}/videos/${videoId}/report-violation`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          description: description.trim()
        })
      });

      if (!response.ok) throw new Error("Failed to submit report");

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      setError("Failed to submit report");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          padding: "2rem",
          maxWidth: "500px",
          width: "90%",
          boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Report Content</h2>

        {error && <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>}
        {success && (
          <div style={{ color: "green", marginBottom: "1rem" }}>Report submitted successfully! Thank you for your feedback.</div>
        )}

        {!success && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                  fontFamily: "inherit"
                }}
              >
                <option value="">Select a reason</option>
                {VIOLATION_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={loading}
                placeholder="Please describe the issue..."
                maxLength={500}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                  fontFamily: "inherit",
                  minHeight: "100px",
                  resize: "vertical"
                }}
              />
              <div style={{ fontSize: "0.875rem", color: "#666", marginTop: "0.25rem" }}>
                {description.length}/500
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  backgroundColor: "#ff4444",
                  color: "white",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: "bold"
                }}
              >
                {loading ? "Submitting..." : "Submit Report"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "0.75rem",
                  backgroundColor: "#ddd",
                  border: "none",
                  borderRadius: "4px",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: "bold"
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
