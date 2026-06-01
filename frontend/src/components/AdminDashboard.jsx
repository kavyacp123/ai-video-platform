import React, { useState, useEffect } from "react";
import { fetchAuthSession } from "aws-amplify/auth";

const API_URL = import.meta.env.VITE_API_URL;

export function AdminDashboard() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [filter, setFilter] = useState("all");

  async function getAuthHeaders() {
    const session = await fetchAuthSession();
    return { Authorization: `Bearer ${session.tokens.accessToken.toString()}` };
  }

  useEffect(() => {
    loadAuditLogs();
  }, [selectedUserId, filter]);

  async function loadAuditLogs() {
    if (!selectedUserId) return;

    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ userId: selectedUserId, limit: 100 });

      const response = await fetch(`${API_URL}/admin/audit-logs?${params}`, { headers });

      if (!response.ok) throw new Error("Failed to load audit logs");

      const data = await response.json();
      let logs = data.auditLogs || [];

      if (filter !== "all") {
        logs = logs.filter((log) => log.action.includes(filter.toUpperCase()));
      }

      setAuditLogs(logs);
      setError(null);
    } catch (err) {
      setError("Failed to load audit logs - you may not have admin permissions");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  const actions = ["all", "create_comment", "like_video", "watch_video", "follow_user"];

  return (
    <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <h1>Admin Dashboard</h1>

      <div style={{ backgroundColor: "#f5f5f5", padding: "1.5rem", borderRadius: "8px", marginBottom: "2rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>User ID to Audit</label>
            <input
              type="text"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              placeholder="Enter user ID"
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid #ddd",
                fontFamily: "inherit"
              }}
            />
          </div>

          <div>
            <label style={{ display: "block", marginBottom: "0.5rem", fontWeight: "bold" }}>Action Filter</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "0.5rem",
                borderRadius: "4px",
                border: "1px solid #ddd",
                fontFamily: "inherit"
              }}
            >
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action === "all" ? "All Actions" : action.replace("_", " ").toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div style={{ color: "red", marginBottom: "1rem", padding: "1rem", backgroundColor: "#ffe0e0", borderRadius: "4px" }}>{error}</div>}

      {loading ? (
        <div>Loading audit logs...</div>
      ) : auditLogs.length === 0 ? (
        <div style={{ color: "#666", padding: "2rem", textAlign: "center" }}>
          {selectedUserId ? "No audit logs found for this user" : "Enter a user ID to view audit logs"}
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              backgroundColor: "white",
              borderRadius: "8px",
              overflow: "hidden"
            }}
          >
            <thead style={{ backgroundColor: "#f0f0f0" }}>
              <tr>
                <th style={{ padding: "1rem", textAlign: "left", fontWeight: "bold", borderBottom: "1px solid #ddd" }}>
                  Timestamp
                </th>
                <th style={{ padding: "1rem", textAlign: "left", fontWeight: "bold", borderBottom: "1px solid #ddd" }}>
                  Action
                </th>
                <th style={{ padding: "1rem", textAlign: "left", fontWeight: "bold", borderBottom: "1px solid #ddd" }}>
                  Resource
                </th>
                <th style={{ padding: "1rem", textAlign: "left", fontWeight: "bold", borderBottom: "1px solid #ddd" }}>
                  Status
                </th>
                <th style={{ padding: "1rem", textAlign: "left", fontWeight: "bold", borderBottom: "1px solid #ddd" }}>
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log, idx) => (
                <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "1rem" }}>{new Date(log.createdAt).toLocaleString()}</td>
                  <td style={{ padding: "1rem" }}>{log.action.replace(/_/g, " ")}</td>
                  <td style={{ padding: "1rem" }}>
                    {log.resource} ({log.resourceId})
                  </td>
                  <td style={{ padding: "1rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.25rem 0.75rem",
                        borderRadius: "4px",
                        backgroundColor: log.status === "success" ? "#e8f5e9" : "#ffebee",
                        color: log.status === "success" ? "#2e7d32" : "#c62828",
                        fontSize: "0.875rem"
                      }}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: "1rem", fontSize: "0.875rem" }}>
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
