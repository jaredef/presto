// Island: Vue 3 Dashboard
// A complete Vue application with reactive state and computed properties,
// mounted as an island inside a PRESTO representation.

import { createApp, ref, computed, type App } from "vue";
import { defineIsland } from "../../src/islands/define";

interface Post { id: number; title: string; status: string; slug: string; }

function createDashboard(posts: Post[]) {
  return {
    setup() {
      const allPosts = ref(posts);
      const filter = ref("all");
      const filtered = computed(() => {
        if (filter.value === "all") return allPosts.value;
        return allPosts.value.filter(p => p.status === filter.value);
      });
      const stats = computed(() => ({
        total: allPosts.value.length,
        published: allPosts.value.filter(p => p.status === "published").length,
        draft: allPosts.value.filter(p => p.status === "draft").length,
      }));
      return { allPosts, filter, filtered, stats };
    },
    template: `
      <div style="font-family:system-ui,sans-serif;padding:1rem">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem">
          <span style="font-size:0.6rem;padding:0.15rem 0.5rem;border-radius:100px;background:#dcfce7;color:#166534;font-weight:600">Vue 3</span>
          <strong style="font-size:1rem">Dashboard</strong>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.5rem;margin-bottom:1rem">
          <div style="padding:0.75rem;border:1px solid #e5e5e5;border-radius:8px;background:#fff;text-align:center">
            <div style="font-size:1.25rem;font-weight:700">{{ stats.total }}</div>
            <div style="font-size:0.7rem;color:#888">Total</div>
          </div>
          <div style="padding:0.75rem;border:1px solid #e5e5e5;border-radius:8px;background:#fff;text-align:center">
            <div style="font-size:1.25rem;font-weight:700;color:#22c55e">{{ stats.published }}</div>
            <div style="font-size:0.7rem;color:#888">Published</div>
          </div>
          <div style="padding:0.75rem;border:1px solid #e5e5e5;border-radius:8px;background:#fff;text-align:center">
            <div style="font-size:1.25rem;font-weight:700;color:#f59e0b">{{ stats.draft }}</div>
            <div style="font-size:0.7rem;color:#888">Draft</div>
          </div>
        </div>
        <div style="display:flex;gap:0.25rem;margin-bottom:0.75rem">
          <button v-for="f in ['all','published','draft']" :key="f" @click="filter=f"
            :style="{padding:'0.3rem 0.6rem',fontSize:'0.75rem',border:'1px solid #e5e5e5',borderRadius:'4px',cursor:'pointer',background:filter===f?'#1a1a1a':'#fff',color:filter===f?'#fff':'#1a1a1a'}">
            {{ f.charAt(0).toUpperCase() + f.slice(1) }}
          </button>
        </div>
        <div v-for="post in filtered" :key="post.id"
          style="padding:0.5rem;border-bottom:1px solid #f0f0f0;font-size:0.85rem;display:flex;justify-content:space-between">
          <span>{{ post.title }}</span>
          <span :style="{fontSize:'0.65rem',padding:'0.1rem 0.4rem',borderRadius:'100px',background:post.status==='published'?'#dcfce7':'#f3f4f6',color:post.status==='published'?'#166534':'#6b7280'}">{{ post.status }}</span>
        </div>
        <div style="font-size:0.65rem;color:#aaa;margin-top:0.75rem">
          Vue {{ $options.__v }} — Reactive dashboard with computed filtering. {{ filtered.length }} posts shown.
        </div>
      </div>
    `,
    __v: "3.5",
  };
}

defineIsland({
  name: "vue-dashboard",
  mount(el, props) {
    const posts = Array.isArray(props.data) ? props.data as Post[] : [];
    const app = createApp(createDashboard(posts));
    app.mount(el);
    (el as any).__vueApp = app;
  },
  unmount(el) {
    if ((el as any).__vueApp) (el as any).__vueApp.unmount();
  },
});
