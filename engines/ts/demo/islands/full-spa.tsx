// Island: Full React SPA
// An entire multi-view application with client-side routing, state, and
// multiple screens — mounted as a single island inside a PRESTO page.
//
// This proves that the encapsulation handles not just components but
// entire applications. The migration path: enclose, then surface.

import React, { useState, createContext, useContext, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { defineIsland } from "../../src/islands/define";

// --- Client-side router (no dependency — 30 lines) ---
function useRouter() {
  const [path, setPath] = useState(window.location.hash.slice(1) || "/");
  React.useEffect(() => {
    const handler = () => setPath(window.location.hash.slice(1) || "/");
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  const navigate = (to: string) => { window.location.hash = to; };
  return { path, navigate };
}

// --- Global state (like Redux — context + reducer) ---
interface AppState {
  user: { name: string; role: string } | null;
  theme: "light" | "dark";
  notifications: { id: number; text: string; read: boolean }[];
  todos: { id: number; text: string; done: boolean }[];
}

type Action =
  | { type: "LOGIN"; name: string; role: string }
  | { type: "LOGOUT" }
  | { type: "TOGGLE_THEME" }
  | { type: "ADD_TODO"; text: string }
  | { type: "TOGGLE_TODO"; id: number }
  | { type: "DELETE_TODO"; id: number }
  | { type: "READ_NOTIFICATION"; id: number }
  | { type: "ADD_NOTIFICATION"; text: string };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "LOGIN": return { ...state, user: { name: action.name, role: action.role } };
    case "LOGOUT": return { ...state, user: null };
    case "TOGGLE_THEME": return { ...state, theme: state.theme === "light" ? "dark" : "light" };
    case "ADD_TODO": return { ...state, todos: [...state.todos, { id: Date.now(), text: action.text, done: false }] };
    case "TOGGLE_TODO": return { ...state, todos: state.todos.map(t => t.id === action.id ? { ...t, done: !t.done } : t) };
    case "DELETE_TODO": return { ...state, todos: state.todos.filter(t => t.id !== action.id) };
    case "READ_NOTIFICATION": return { ...state, notifications: state.notifications.map(n => n.id === action.id ? { ...n, read: true } : n) };
    case "ADD_NOTIFICATION": return { ...state, notifications: [{ id: Date.now(), text: action.text, read: false }, ...state.notifications] };
    default: return state;
  }
}

const StateCtx = createContext<{ state: AppState; dispatch: React.Dispatch<Action> }>(null!);
function useAppState() { return useContext(StateCtx); }

// --- Components ---
const s = {
  nav: { display: "flex", gap: "0.75rem", padding: "0.75rem 1rem", borderBottom: "1px solid #e5e5e5", background: "#fff", fontSize: "0.85rem" } as const,
  navLink: { cursor: "pointer", color: "#666", textDecoration: "none" } as const,
  navActive: { cursor: "pointer", color: "#1a1a1a", fontWeight: 600, textDecoration: "none" } as const,
  page: { padding: "1.5rem" } as const,
  card: { border: "1px solid #e5e5e5", borderRadius: "8px", padding: "1rem", marginBottom: "0.75rem", background: "#fff" } as const,
  btn: { padding: "0.35rem 0.75rem", border: "1px solid #e5e5e5", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", background: "#fff" } as const,
  btnPrimary: { padding: "0.35rem 0.75rem", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.8rem", background: "#1a1a1a", color: "#fff" } as const,
  input: { padding: "0.4rem 0.6rem", border: "1px solid #e5e5e5", borderRadius: "6px", fontSize: "0.85rem", width: "100%" } as const,
  badge: { fontSize: "0.65rem", padding: "0.1rem 0.4rem", borderRadius: "100px", background: "#dbeafe", color: "#1e40af" } as const,
};

function NavBar() {
  const { path, navigate } = useRouter();
  const { state, dispatch } = useAppState();
  const unread = state.notifications.filter(n => !n.read).length;
  const links = [
    { to: "/", label: "Dashboard" },
    { to: "/todos", label: "Todos" },
    { to: "/notifications", label: `Notifications${unread > 0 ? ` (${unread})` : ""}` },
    { to: "/settings", label: "Settings" },
  ];
  return (
    <div style={s.nav}>
      <strong style={{ marginRight: "auto" }}>SPA Island</strong>
      {links.map(l => (
        <a key={l.to} onClick={() => navigate(l.to)} style={path === l.to ? s.navActive : s.navLink}>{l.label}</a>
      ))}
      {state.user ? (
        <span style={{ fontSize: "0.75rem", color: "#888" }}>{state.user.name}</span>
      ) : (
        <a onClick={() => dispatch({ type: "LOGIN", name: "Demo User", role: "admin" })} style={s.navLink}>Login</a>
      )}
    </div>
  );
}

function DashboardPage() {
  const { state } = useAppState();
  const todoDone = state.todos.filter(t => t.done).length;
  return (
    <div style={s.page}>
      <h2 style={{ margin: "0 0 1rem" }}>Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
        <div style={s.card}><div style={{ fontSize: "1.5rem", fontWeight: 700 }}>{state.todos.length}</div><div style={{ fontSize: "0.8rem", color: "#888" }}>Total Todos</div></div>
        <div style={s.card}><div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>{todoDone}</div><div style={{ fontSize: "0.8rem", color: "#888" }}>Completed</div></div>
        <div style={s.card}><div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#6366f1" }}>{state.notifications.filter(n => !n.read).length}</div><div style={{ fontSize: "0.8rem", color: "#888" }}>Unread</div></div>
      </div>
      <div style={{ ...s.card, marginTop: "1rem" }}>
        <div style={{ fontSize: "0.85rem", color: "#888" }}>
          This is a full React SPA with client-side routing (hash-based), global state (context + reducer),
          multiple views, and interactive components. The entire application runs inside a single PRESTO island.
          The header and footer outside this area are server-rendered HTML at Layer 0.
        </div>
      </div>
    </div>
  );
}

function TodosPage() {
  const { state, dispatch } = useAppState();
  const [input, setInput] = useState("");
  const add = () => { if (input.trim()) { dispatch({ type: "ADD_TODO", text: input.trim() }); setInput(""); } };
  return (
    <div style={s.page}>
      <h2 style={{ margin: "0 0 1rem" }}>Todos</h2>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
        <input style={s.input} value={input} onChange={e => setInput(e.target.value)} placeholder="Add a todo..." onKeyDown={e => e.key === "Enter" && add()} />
        <button style={s.btnPrimary} onClick={add}>Add</button>
      </div>
      {state.todos.length === 0 && <div style={{ color: "#888", fontSize: "0.85rem" }}>No todos yet. Add one above.</div>}
      {state.todos.map(t => (
        <div key={t.id} style={{ ...s.card, display: "flex", alignItems: "center", gap: "0.75rem", opacity: t.done ? 0.5 : 1 }}>
          <input type="checkbox" checked={t.done} onChange={() => dispatch({ type: "TOGGLE_TODO", id: t.id })} />
          <span style={{ flex: 1, textDecoration: t.done ? "line-through" : "none", fontSize: "0.9rem" }}>{t.text}</span>
          <button onClick={() => dispatch({ type: "DELETE_TODO", id: t.id })} style={{ ...s.btn, color: "#ef4444", border: "none" }}>×</button>
        </div>
      ))}
    </div>
  );
}

function NotificationsPage() {
  const { state, dispatch } = useAppState();
  return (
    <div style={s.page}>
      <h2 style={{ margin: "0 0 1rem" }}>Notifications</h2>
      <button style={s.btn} onClick={() => dispatch({ type: "ADD_NOTIFICATION", text: `Notification at ${new Date().toLocaleTimeString()}` })}>
        Simulate Notification
      </button>
      <div style={{ marginTop: "1rem" }}>
        {state.notifications.length === 0 && <div style={{ color: "#888", fontSize: "0.85rem" }}>No notifications.</div>}
        {state.notifications.map(n => (
          <div key={n.id} style={{ ...s.card, display: "flex", justifyContent: "space-between", alignItems: "center", background: n.read ? "#fff" : "#f0f9ff" }}>
            <span style={{ fontSize: "0.85rem" }}>{n.text}</span>
            {!n.read && <button style={s.btn} onClick={() => dispatch({ type: "READ_NOTIFICATION", id: n.id })}>Mark read</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsPage() {
  const { state, dispatch } = useAppState();
  return (
    <div style={s.page}>
      <h2 style={{ margin: "0 0 1rem" }}>Settings</h2>
      <div style={s.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
          <span style={{ fontSize: "0.9rem" }}>Theme</span>
          <button style={s.btn} onClick={() => dispatch({ type: "TOGGLE_THEME" })}>{state.theme === "light" ? "🌙 Dark" : "☀️ Light"}</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.9rem" }}>Account</span>
          {state.user ? (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.8rem" }}>{state.user.name} <span style={s.badge}>{state.user.role}</span></span>
              <button style={s.btn} onClick={() => dispatch({ type: "LOGOUT" })}>Logout</button>
            </div>
          ) : (
            <button style={s.btnPrimary} onClick={() => dispatch({ type: "LOGIN", name: "Demo User", role: "admin" })}>Login</button>
          )}
        </div>
      </div>
      <div style={{ ...s.card, fontSize: "0.8rem", color: "#888" }}>
        This settings page is part of the React SPA island. It manages client-side state that persists
        across navigation within the island (theme toggle, login state). In a full application, this
        page could be surfaced to Layer 0 — it's just a form with two toggles.
      </div>
    </div>
  );
}

function App({ serverPosts }: { serverPosts?: any[] }) {
  const { path } = useRouter();
  const [state, dispatch] = React.useReducer(reducer, {
    user: null,
    theme: "light",
    notifications: [
      { id: 1, text: "Welcome to the SPA island", read: false },
      { id: 2, text: "This entire app runs in a bounded div", read: false },
    ],
    todos: [
      { id: 1, text: "Explore the dashboard", done: false },
      { id: 2, text: "Add a todo item", done: false },
      { id: 3, text: "Check notifications", done: false },
      { id: 4, text: "Try the settings page", done: false },
      ...(serverPosts || []).map((p: any, i: number) => ({ id: 100 + i, text: `Read: ${p.title}`, done: false })),
    ],
  });

  const bg = state.theme === "dark" ? "#1a1a2e" : "#fafafa";
  const fg = state.theme === "dark" ? "#e0e0e0" : "#1a1a1a";

  return (
    <StateCtx.Provider value={{ state, dispatch }}>
      <div style={{ fontFamily: "system-ui, sans-serif", background: bg, color: fg, borderRadius: "8px", overflow: "hidden", border: "1px solid #e5e5e5", minHeight: "500px" }}>
        <NavBar />
        {path === "/" && <DashboardPage />}
        {path === "/todos" && <TodosPage />}
        {path === "/notifications" && <NotificationsPage />}
        {path === "/settings" && <SettingsPage />}
      </div>
    </StateCtx.Provider>
  );
}

defineIsland({
  name: "full-spa",
  mount(el, props) {
    const posts = Array.isArray(props.data) ? props.data : [];
    createRoot(el).render(<App serverPosts={posts} />);
  },
});
