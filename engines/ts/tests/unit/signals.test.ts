// Tests for presto-signals.js — reactivity core
// We eval the script to get the globals in a test-friendly way

import { describe, test, expect, beforeAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Load the signals library into the test scope
const signalsCode = readFileSync(join(import.meta.dir, "../../public/js/presto-signals.js"), "utf-8");

// Create a mini-environment
let signal: any, computed: any, effect: any, batch: any, bind: any, bindAttr: any, bindHtml: any;

beforeAll(() => {
  const g: any = {};
  const fn = new Function("globalThis", "window", "global", signalsCode);
  fn(g, g, g);
  signal = g.signal;
  computed = g.computed;
  effect = g.effect;
  batch = g.batch;
  bind = g.bind;
  bindAttr = g.bindAttr;
  bindHtml = g.bindHtml;
});

describe("signal()", () => {
  test("holds initial value", () => {
    const s = signal(42);
    expect(s.value).toBe(42);
  });

  test("updates value", () => {
    const s = signal(0);
    s.value = 10;
    expect(s.value).toBe(10);
  });

  test("peek reads without tracking", () => {
    const s = signal(5);
    let tracked = false;
    effect(() => {
      s.peek(); // should NOT create a dependency
      tracked = true;
    });
    tracked = false;
    s.value = 6;
    // Effect should NOT have re-run since we used peek
    expect(tracked).toBe(false);
  });

  test("does not notify on same value", () => {
    const s = signal(1);
    let runs = 0;
    effect(() => { s.value; runs++; });
    expect(runs).toBe(1);
    s.value = 1; // same value
    expect(runs).toBe(1);
  });
});

describe("computed()", () => {
  test("derives from signal", () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed(() => a.value + b.value);
    expect(sum.value).toBe(5);
  });

  test("updates when dependency changes", () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed(() => a.value + b.value);
    a.value = 10;
    expect(sum.value).toBe(13);
  });

  test("chains computed values", () => {
    const x = signal(2);
    const doubled = computed(() => x.value * 2);
    const quadrupled = computed(() => doubled.value * 2);
    expect(quadrupled.value).toBe(8);
    x.value = 5;
    expect(quadrupled.value).toBe(20);
  });
});

describe("effect()", () => {
  test("runs immediately", () => {
    const s = signal(0);
    let observed = -1;
    effect(() => { observed = s.value; });
    expect(observed).toBe(0);
  });

  test("re-runs on dependency change", () => {
    const s = signal(0);
    let observed = -1;
    effect(() => { observed = s.value; });
    s.value = 42;
    expect(observed).toBe(42);
  });

  test("tracks multiple dependencies", () => {
    const a = signal(1);
    const b = signal(2);
    let sum = 0;
    effect(() => { sum = a.value + b.value; });
    expect(sum).toBe(3);
    a.value = 10;
    expect(sum).toBe(12);
    b.value = 20;
    expect(sum).toBe(30);
  });

  test("dispose stops tracking", () => {
    const s = signal(0);
    let runs = 0;
    const e = effect(() => { s.value; runs++; });
    expect(runs).toBe(1);
    e.dispose();
    s.value = 1;
    expect(runs).toBe(1); // should NOT have re-run
  });

  test("dynamic dependency tracking", () => {
    const toggle = signal(true);
    const a = signal("A");
    const b = signal("B");
    let result = "";
    effect(() => {
      result = toggle.value ? a.value : b.value;
    });
    expect(result).toBe("A");
    // Changing b should NOT trigger (not tracked when toggle=true)
    b.value = "B2";
    expect(result).toBe("A");
    // Switch to b branch
    toggle.value = false;
    expect(result).toBe("B2");
    // Now changing a should NOT trigger
    a.value = "A2";
    expect(result).toBe("B2");
  });
});

describe("batch()", () => {
  test("defers updates until batch completes", () => {
    const a = signal(0);
    const b = signal(0);
    let runs = 0;
    effect(() => { a.value; b.value; runs++; });
    expect(runs).toBe(1);

    batch(() => {
      a.value = 1;
      b.value = 2;
      // Effect should NOT have run yet
      expect(runs).toBe(1);
    });
    // Now it should have run once
    expect(runs).toBe(2);
  });

  test("nested batches defer to outermost", () => {
    const s = signal(0);
    let runs = 0;
    effect(() => { s.value; runs++; });
    expect(runs).toBe(1);

    batch(() => {
      s.value = 1;
      batch(() => {
        s.value = 2;
      });
      // Still batched — should not have run
      expect(runs).toBe(1);
    });
    expect(runs).toBe(2);
  });
});

describe("bind() — DOM textContent binding", () => {
  test("sets textContent from signal", () => {
    const node = { textContent: "" };
    const s = signal("hello");
    bind(node as any, s);
    expect(node.textContent).toBe("hello");
    s.value = "world";
    expect(node.textContent).toBe("world");
  });

  test("handles null node gracefully", () => {
    const s = signal("test");
    bind(null as any, s); // should not throw
  });
});

describe("bindAttr() — DOM attribute binding", () => {
  test("sets attribute via function", () => {
    const node = { setAttribute: (k: string, v: string) => { (node as any)[k] = v; } } as any;
    const width = signal(50);
    bindAttr(node, "data-width", () => String(width.value));
    expect(node["data-width"]).toBe("50");
    width.value = 75;
    expect(node["data-width"]).toBe("75");
  });

  test("handles class attribute via className", () => {
    const node = { className: "" } as any;
    const active = signal(false);
    bindAttr(node, "class", () => active.value ? "active" : "inactive");
    expect(node.className).toBe("inactive");
    active.value = true;
    expect(node.className).toBe("active");
  });

  test("handles style attribute via cssText", () => {
    const node = { style: { cssText: "" } } as any;
    const pct = signal(0);
    bindAttr(node, "style", () => "width:" + pct.value + "%");
    expect(node.style.cssText).toBe("width:0%");
    pct.value = 100;
    expect(node.style.cssText).toBe("width:100%");
  });

  test("handles boolean attributes (disabled, hidden, checked)", () => {
    const node = { disabled: false, hidden: false, checked: false } as any;
    const dis = signal(false);
    bindAttr(node, "disabled", () => dis.value);
    expect(node.disabled).toBe(false);
    dis.value = true;
    expect(node.disabled).toBe(true);
  });
});

describe("bindHtml() — innerHTML binding", () => {
  test("sets innerHTML from signal", () => {
    const node = { innerHTML: "" } as any;
    const s = signal("<b>bold</b>");
    bindHtml(node, s);
    expect(node.innerHTML).toBe("<b>bold</b>");
    s.value = "<i>italic</i>";
    expect(node.innerHTML).toBe("<i>italic</i>");
  });
});

describe("integration — signals + computed + effects", () => {
  test("todo list pattern", () => {
    const items = signal(["buy milk", "write code"]);
    const count = computed(() => items.value.length);

    let displayCount = 0;
    effect(() => { displayCount = count.value; });
    expect(displayCount).toBe(2);

    items.value = [...items.value, "deploy"];
    expect(displayCount).toBe(3);
  });

  test("form validation pattern", () => {
    const email = signal("");
    const isValid = computed(() => email.value.includes("@"));
    const message = computed(() => isValid.value ? "Valid" : "Invalid");

    let displayed = "";
    effect(() => { displayed = message.value; });
    expect(displayed).toBe("Invalid");

    email.value = "user@example.com";
    expect(displayed).toBe("Valid");
  });

  test("filtered list pattern", () => {
    const items = signal([
      { name: "Alice", active: true },
      { name: "Bob", active: false },
      { name: "Carol", active: true },
    ]);
    const filter = signal("active");
    const filtered = computed(() => {
      if (filter.value === "all") return items.value;
      return items.value.filter((i: any) => filter.value === "active" ? i.active : !i.active);
    });

    expect(filtered.value.length).toBe(2);
    filter.value = "all";
    expect(filtered.value.length).toBe(3);
    filter.value = "inactive";
    expect(filtered.value.length).toBe(1);
  });
});
