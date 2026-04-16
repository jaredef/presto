// React Query Island — A real React component using @tanstack/react-query
// This is the DO style operating inside a bounded region of a REST representation.

import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, refetchOnWindowFocus: false } },
});

interface Post {
  id: number;
  title: string;
  body: string;
  slug: string;
  status: string;
}

function PostList({ apiUrl, token }: { apiUrl: string; token: string }) {
  const [filter, setFilter] = useState("all");

  const { data: posts, isLoading, error, refetch, isFetching } = useQuery<Post[]>({
    queryKey: ["posts", filter],
    queryFn: async () => {
      const resp = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await resp.json();
      // The channel handler returns { data: [...] } or the data directly
      const items = Array.isArray(json) ? json : (json.data || json);
      if (!Array.isArray(items)) return [];
      if (filter === "all") return items;
      return items.filter((p: Post) => p.status === filter);
    },
  });

  return (
    <div style={{ fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center" }}>
        <button
          onClick={() => setFilter("all")}
          style={{
            padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid #e5e5e5",
            background: filter === "all" ? "#1a1a1a" : "#fff", color: filter === "all" ? "#fff" : "#1a1a1a",
            cursor: "pointer", fontSize: "0.8rem",
          }}
        >All</button>
        <button
          onClick={() => setFilter("published")}
          style={{
            padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid #e5e5e5",
            background: filter === "published" ? "#1a1a1a" : "#fff", color: filter === "published" ? "#fff" : "#1a1a1a",
            cursor: "pointer", fontSize: "0.8rem",
          }}
        >Published</button>
        <button
          onClick={() => setFilter("draft")}
          style={{
            padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid #e5e5e5",
            background: filter === "draft" ? "#1a1a1a" : "#fff", color: filter === "draft" ? "#fff" : "#1a1a1a",
            cursor: "pointer", fontSize: "0.8rem",
          }}
        >Draft</button>
        <button
          onClick={() => refetch()}
          style={{
            padding: "0.35rem 0.75rem", borderRadius: "6px", border: "1px solid #e5e5e5",
            background: "#fff", cursor: "pointer", fontSize: "0.8rem", marginLeft: "auto",
          }}
        >{isFetching ? "Refreshing..." : "↻ Refetch"}</button>
      </div>

      {isLoading && (
        <div style={{ padding: "2rem", textAlign: "center", color: "#888" }}>
          Loading posts...
        </div>
      )}

      {error && (
        <div style={{ padding: "1rem", background: "#fef2f2", borderRadius: "8px", color: "#ef4444", fontSize: "0.85rem" }}>
          Error: {(error as Error).message}
        </div>
      )}

      {posts && posts.length === 0 && (
        <div style={{ padding: "1rem", background: "#f0f9ff", borderRadius: "8px", color: "#3b82f6", fontSize: "0.85rem" }}>
          No posts matching filter.
        </div>
      )}

      {posts && posts.map((post) => (
        <div key={post.id} style={{
          padding: "0.75rem", border: "1px solid #e5e5e5", borderRadius: "8px",
          marginBottom: "0.5rem", background: "#fff",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: "0.9rem" }}>{post.title}</strong>
            <span style={{
              fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: "100px",
              background: post.status === "published" ? "#dcfce7" : "#f3f4f6",
              color: post.status === "published" ? "#166534" : "#6b7280",
            }}>{post.status}</span>
          </div>
          <div style={{ fontSize: "0.8rem", color: "#888", marginTop: "0.25rem" }}>{post.body}</div>
        </div>
      ))}

      <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#aaa" }}>
        Rendered by React {React.version} + React Query. {posts?.length || 0} posts. Filter: {filter}.
        {isFetching && " Fetching..."}
      </div>
    </div>
  );
}

// Standard island interface
import { defineIsland } from "../../src/islands/define";

defineIsland({
  name: "react-query-posts",
  mount(el, props) {
    const token = (props.token as string) || "";
    const root = createRoot(el);
    root.render(
      <QueryClientProvider client={queryClient}>
        <PostList apiUrl="/api/channel/builder/posts" token={token} />
      </QueryClientProvider>
    );
  },
});
