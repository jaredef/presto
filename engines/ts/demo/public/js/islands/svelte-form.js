function K(q){let x=globalThis.__prestoIslands||{};if(x[q.name]=q,globalThis.__prestoIslands=x,typeof document<"u")document.querySelectorAll(`[data-island="${q.name}"]`).forEach((w)=>{if(w.__islandMounted)return;let B=N(q.name);q.mount(w,B),w.__islandMounted=!0});return q}function N(q){let x={},A=document.getElementById(`island-data-${q}`);if(A)try{let C=A.content?.textContent||A.textContent||"";x.data=JSON.parse(C)}catch{x.data=null}let w=document.getElementById(`island-token-${q}`);if(w&&w.value)x.token=w.value;let B=document.getElementById(`island-channel-${q}`);if(B&&B.value)x.channel=B.value;return x}function G(q){let x=q,A=[];return{get:()=>x,set:(w)=>{x=w,A.forEach((B)=>B(w))},subscribe:(w)=>{A.push(w),w(x)}}}function O(q,x){let A=G(""),w=G(""),B=G(""),C=G(!1),J=G({});function L(){let z={};if(!A.get().trim())z.name="Name is required";if(!w.get().includes("@"))z.email="Valid email required";if(B.get().length<10)z.message="At least 10 characters";return J.set(z),Object.keys(z).length===0}function H(){let z=J.get();if(q.innerHTML=`
      <div style="font-family:system-ui,sans-serif;padding:1rem">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem">
          <span style="font-size:0.6rem;padding:0.15rem 0.5rem;border-radius:100px;background:#ff3e00;color:#fff;font-weight:600">Svelte-style</span>
          <strong style="font-size:1rem">Contact Form</strong>
        </div>
        ${C.get()?`
          <div style="padding:1rem;background:#f0fdf4;border-radius:8px;color:#166534;font-size:0.9rem">
            <strong>Submitted!</strong> Thank you, ${A.get()}.
          </div>
        `:`
          <div style="margin-bottom:0.75rem">
            <label style="display:block;font-size:0.8rem;font-weight:500;margin-bottom:0.25rem">Name</label>
            <input id="sf-name" type="text" value="${A.get()}" placeholder="Your name"
              style="width:100%;padding:0.4rem 0.6rem;border:1px solid ${z.name?"#ef4444":"#e5e5e5"};border-radius:6px;font-size:0.85rem;box-sizing:border-box" />
            ${z.name?`<div style="font-size:0.7rem;color:#ef4444;margin-top:0.2rem">${z.name}</div>`:""}
          </div>
          <div style="margin-bottom:0.75rem">
            <label style="display:block;font-size:0.8rem;font-weight:500;margin-bottom:0.25rem">Email</label>
            <input id="sf-email" type="email" value="${w.get()}" placeholder="you@example.com"
              style="width:100%;padding:0.4rem 0.6rem;border:1px solid ${z.email?"#ef4444":"#e5e5e5"};border-radius:6px;font-size:0.85rem;box-sizing:border-box" />
            ${z.email?`<div style="font-size:0.7rem;color:#ef4444;margin-top:0.2rem">${z.email}</div>`:""}
          </div>
          <div style="margin-bottom:0.75rem">
            <label style="display:block;font-size:0.8rem;font-weight:500;margin-bottom:0.25rem">Message</label>
            <textarea id="sf-message" rows="3" placeholder="At least 10 characters..."
              style="width:100%;padding:0.4rem 0.6rem;border:1px solid ${z.message?"#ef4444":"#e5e5e5"};border-radius:6px;font-size:0.85rem;resize:vertical;box-sizing:border-box">${B.get()}</textarea>
            ${z.message?`<div style="font-size:0.7rem;color:#ef4444;margin-top:0.2rem">${z.message}</div>`:""}
          </div>
          <button id="sf-submit" style="padding:0.4rem 1rem;border:none;border-radius:6px;background:#ff3e00;color:#fff;cursor:pointer;font-size:0.85rem">Send</button>
        `}
        <div style="font-size:0.65rem;color:#aaa;margin-top:0.75rem">
          Svelte-inspired reactive form. Validation on submit. No framework runtime — pure reactive primitives.
        </div>
      </div>
    `,!C.get())q.querySelector("#sf-name")?.addEventListener("input",(D)=>A.set(D.target.value)),q.querySelector("#sf-email")?.addEventListener("input",(D)=>w.set(D.target.value)),q.querySelector("#sf-message")?.addEventListener("input",(D)=>B.set(D.target.value)),q.querySelector("#sf-submit")?.addEventListener("click",()=>{if(L())C.set(!0),H();else H()})}H()}K({name:"svelte-form",mount(q,x){let A=x.token||"";O(q,A)}});
