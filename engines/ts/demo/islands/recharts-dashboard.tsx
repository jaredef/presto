// Recharts Island — Data visualization operating at Layer 5
// inside a bounded region of a Layer 0 representation.
// This is a genuine UI capability: the surface shows the data,
// the depth visualizes it. Neither replaces the other.

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
} from "recharts";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#3b82f6", "#ec4899", "#8b5cf6", "#14b8a6"];

type ChartView = "bar" | "pie" | "line";

interface Post {
  id: number;
  title: string;
  status: string;
  slug: string;
}

interface Task {
  id: number;
  title: string;
  status: string;
  priority: string;
}

function Dashboard({ posts, tasks }: { posts: Post[]; tasks: Task[] }) {
  const [view, setView] = useState<ChartView>("bar");

  // Compute chart data from the server-provided records
  const statusData = [
    { name: "Published", count: posts.filter(p => p.status === "published").length, fill: "#22c55e" },
    { name: "Draft", count: posts.filter(p => p.status === "draft").length, fill: "#f59e0b" },
  ];

  const taskStatusData = [
    { name: "To Do", count: tasks.filter(t => t.status === "todo").length, fill: "#6366f1" },
    { name: "In Progress", count: tasks.filter(t => t.status === "in-progress").length, fill: "#f59e0b" },
    { name: "Done", count: tasks.filter(t => t.status === "done").length, fill: "#22c55e" },
  ];

  const priorityData = [
    { name: "High", count: tasks.filter(t => t.priority === "high").length },
    { name: "Medium", count: tasks.filter(t => t.priority === "medium").length },
    { name: "Low", count: tasks.filter(t => t.priority === "low").length },
  ];

  const timelineData = posts.map((p, i) => ({
    name: p.title.length > 15 ? p.title.substring(0, 15) + "..." : p.title,
    index: i + 1,
    titleLength: p.title.length,
    bodyProxy: p.slug.length * 10,
  }));

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        {(["bar", "pie", "line"] as ChartView[]).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            style={{
              padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid #e5e5e5",
              background: view === v ? "#1a1a1a" : "#fff", color: view === v ? "#fff" : "#1a1a1a",
              cursor: "pointer", fontSize: "0.8rem", textTransform: "capitalize",
            }}
          >{v} Chart</button>
        ))}
      </div>

      {view === "bar" && (
        <div>
          <h4 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "#666" }}>Tasks by Status &amp; Priority</h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={taskStatusData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {taskStatusData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ marginTop: "1rem" }}>
            <h4 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "#666" }}>Tasks by Priority</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={priorityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" fontSize={12} />
                <YAxis type="category" dataKey="name" fontSize={12} width={60} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {view === "pie" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <div>
            <h4 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "#666", textAlign: "center" }}>Post Status</h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={statusData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h4 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "#666", textAlign: "center" }}>Task Status</h4>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={taskStatusData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {taskStatusData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {view === "line" && (
        <div>
          <h4 style={{ fontSize: "0.85rem", marginBottom: "0.5rem", color: "#666" }}>Posts Overview</h4>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timelineData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" fontSize={10} angle={-30} textAnchor="end" height={60} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="titleLength" stroke="#6366f1" name="Title Length" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="bodyProxy" stroke="#22c55e" name="Content Score" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ marginTop: "0.75rem", fontSize: "0.7rem", color: "#aaa" }}>
        Rendered by React {React.version} + Recharts 3. {posts.length} posts, {tasks.length} tasks.
        Chart view: {view}. Data provided by the server via data attributes.
      </div>
    </div>
  );
}

// Standard island interface
import { defineIsland } from "../../src/islands/define";

defineIsland({
  name: "recharts-dashboard",
  mount(el, props) {
    const data = (props.data as { posts?: Post[]; tasks?: Task[] }) || {};
    const posts = data.posts || (Array.isArray(props.data) ? props.data : []);
    const tasks = data.tasks || [];
    createRoot(el).render(<Dashboard posts={posts as Post[]} tasks={tasks as Task[]} />);
  },
});
