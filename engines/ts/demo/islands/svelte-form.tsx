// Island: Svelte-style Form
// Since Svelte 5 requires a compiler and can't easily be used with createRoot,
// we build a Svelte-inspired reactive form using Svelte's runtime primitives.
// This demonstrates the encapsulation principle: any mount(el) API works.

import { defineIsland } from "../../src/islands/define";

// Minimal reactive system inspired by Svelte's runes
function reactive<T>(initial: T): { get: () => T; set: (v: T) => void; subscribe: (fn: (v: T) => void) => void } {
  let value = initial;
  const subs: ((v: T) => void)[] = [];
  return {
    get: () => value,
    set: (v: T) => { value = v; subs.forEach(fn => fn(v)); },
    subscribe: (fn: (v: T) => void) => { subs.push(fn); fn(value); },
  };
}

function createForm(el: HTMLElement, token: string) {
  const name = reactive("");
  const email = reactive("");
  const message = reactive("");
  const submitted = reactive(false);
  const errors = reactive<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.get().trim()) e.name = "Name is required";
    if (!email.get().includes("@")) e.email = "Valid email required";
    if (message.get().length < 10) e.message = "At least 10 characters";
    errors.set(e);
    return Object.keys(e).length === 0;
  }

  function render() {
    const errs = errors.get();
    el.innerHTML = `
      <div style="font-family:system-ui,sans-serif;padding:1rem">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem">
          <span style="font-size:0.6rem;padding:0.15rem 0.5rem;border-radius:100px;background:#ff3e00;color:#fff;font-weight:600">Svelte-style</span>
          <strong style="font-size:1rem">Contact Form</strong>
        </div>
        ${submitted.get() ? `
          <div style="padding:1rem;background:#f0fdf4;border-radius:8px;color:#166534;font-size:0.9rem">
            <strong>Submitted!</strong> Thank you, ${name.get()}.
          </div>
        ` : `
          <div style="margin-bottom:0.75rem">
            <label style="display:block;font-size:0.8rem;font-weight:500;margin-bottom:0.25rem">Name</label>
            <input id="sf-name" type="text" value="${name.get()}" placeholder="Your name"
              style="width:100%;padding:0.4rem 0.6rem;border:1px solid ${errs.name ? '#ef4444' : '#e5e5e5'};border-radius:6px;font-size:0.85rem;box-sizing:border-box" />
            ${errs.name ? `<div style="font-size:0.7rem;color:#ef4444;margin-top:0.2rem">${errs.name}</div>` : ""}
          </div>
          <div style="margin-bottom:0.75rem">
            <label style="display:block;font-size:0.8rem;font-weight:500;margin-bottom:0.25rem">Email</label>
            <input id="sf-email" type="email" value="${email.get()}" placeholder="you@example.com"
              style="width:100%;padding:0.4rem 0.6rem;border:1px solid ${errs.email ? '#ef4444' : '#e5e5e5'};border-radius:6px;font-size:0.85rem;box-sizing:border-box" />
            ${errs.email ? `<div style="font-size:0.7rem;color:#ef4444;margin-top:0.2rem">${errs.email}</div>` : ""}
          </div>
          <div style="margin-bottom:0.75rem">
            <label style="display:block;font-size:0.8rem;font-weight:500;margin-bottom:0.25rem">Message</label>
            <textarea id="sf-message" rows="3" placeholder="At least 10 characters..."
              style="width:100%;padding:0.4rem 0.6rem;border:1px solid ${errs.message ? '#ef4444' : '#e5e5e5'};border-radius:6px;font-size:0.85rem;resize:vertical;box-sizing:border-box">${message.get()}</textarea>
            ${errs.message ? `<div style="font-size:0.7rem;color:#ef4444;margin-top:0.2rem">${errs.message}</div>` : ""}
          </div>
          <button id="sf-submit" style="padding:0.4rem 1rem;border:none;border-radius:6px;background:#ff3e00;color:#fff;cursor:pointer;font-size:0.85rem">Send</button>
        `}
        <div style="font-size:0.65rem;color:#aaa;margin-top:0.75rem">
          Svelte-inspired reactive form. Validation on submit. No framework runtime — pure reactive primitives.
        </div>
      </div>
    `;

    if (!submitted.get()) {
      el.querySelector("#sf-name")?.addEventListener("input", (e: any) => name.set(e.target.value));
      el.querySelector("#sf-email")?.addEventListener("input", (e: any) => email.set(e.target.value));
      el.querySelector("#sf-message")?.addEventListener("input", (e: any) => message.set(e.target.value));
      el.querySelector("#sf-submit")?.addEventListener("click", () => {
        if (validate()) { submitted.set(true); render(); }
        else render();
      });
    }
  }

  render();
}

defineIsland({
  name: "svelte-form",
  mount(el, props) {
    const token = (props.token as string) || "";
    createForm(el, token);
  },
});
