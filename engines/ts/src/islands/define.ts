// Island SDK — defineIsland()
// The standard interface for mounting React npm packages into PRESTO representations.
// Island authors import this. The protocol handles the depth.

export interface IslandDefinition {
  name: string;
  mount(el: HTMLElement, props: Record<string, unknown>): void;
  unmount?(el: HTMLElement): void;
}

interface IslandRegistry {
  [name: string]: IslandDefinition;
}

// Client-side: register the island and auto-mount if elements exist
export function defineIsland(definition: IslandDefinition): IslandDefinition {
  const registry = ((globalThis as any).__prestoIslands || {}) as IslandRegistry;
  registry[definition.name] = definition;
  (globalThis as any).__prestoIslands = registry;

  // Auto-mount: check if any mount points exist in the DOM already
  if (typeof document !== "undefined") {
    const mountPoints = document.querySelectorAll(`[data-island="${definition.name}"]`);
    mountPoints.forEach((el) => {
      if ((el as any).__islandMounted) return;
      const props = readProps(definition.name);
      definition.mount(el as HTMLElement, props);
      (el as any).__islandMounted = true;
    });
  }

  return definition;
}

// Read props from the data bridge (template element) and token bridge (hidden input)
function readProps(name: string): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  // Data bridge: <template id="island-data-{name}">JSON</template>
  const dataEl = document.getElementById(`island-data-${name}`) as HTMLTemplateElement | null;
  if (dataEl) {
    try {
      const json = dataEl.content?.textContent || dataEl.textContent || "";
      props.data = JSON.parse(json);
    } catch {
      props.data = null;
    }
  }

  // Token bridge: <input id="island-token-{name}" value="..." />
  const tokenEl = document.getElementById(`island-token-${name}`) as HTMLInputElement | null;
  if (tokenEl && tokenEl.value) {
    props.token = tokenEl.value;
  }

  // Channel bridge: <input id="island-channel-{name}" value="..." />
  const channelEl = document.getElementById(`island-channel-${name}`) as HTMLInputElement | null;
  if (channelEl && channelEl.value) {
    props.channel = channelEl.value;
  }

  return props;
}

// Utility: mount an island by name (called by the bootstrap script in island.htx)
export function mountIsland(name: string, el: HTMLElement): boolean {
  const registry = ((globalThis as any).__prestoIslands || {}) as IslandRegistry;
  const definition = registry[name];
  if (!definition) return false;
  if ((el as any).__islandMounted) return true;

  const props = readProps(name);
  definition.mount(el, props);
  (el as any).__islandMounted = true;
  return true;
}

// Utility: unmount an island (called on navigation/cleanup)
export function unmountIsland(name: string, el: HTMLElement): boolean {
  const registry = ((globalThis as any).__prestoIslands || {}) as IslandRegistry;
  const definition = registry[name];
  if (!definition || !definition.unmount) return false;
  definition.unmount(el);
  (el as any).__islandMounted = false;
  return true;
}
