// PRESTO-TS v3 — Three-Layer Path Traversal Defense
// C8 Security: (1) pre-filter rejects "..", (2) normalize resolved path, (3) containment check

import { realpathSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";

export class PathGuard {
  constructor(private root: string) {
    // Normalize the root itself
    this.root = realpathSync(this.root);
  }

  // Validate a path input (used for include src, component src, layout src, URL paths)
  validate(requestedPath: string): { valid: boolean; resolved: string; error?: string } {
    // Layer 1: Pre-filter — reject ".." in source strings
    if (requestedPath.includes("..")) {
      return { valid: false, resolved: "", error: "Path traversal rejected: contains .." };
    }

    // Construct candidate path (strip leading / to make root-relative)
    const candidate = resolve(this.root, requestedPath.replace(/^\//, ""));

    // Layer 2: Normalize — resolve symlinks
    let normalized: string;
    if (existsSync(candidate)) {
      try {
        normalized = realpathSync(candidate);
      } catch {
        normalized = candidate;
      }
    } else {
      // File doesn't exist yet — normalize the deepest existing ancestor
      let dir = dirname(candidate);
      while (!existsSync(dir) && dir !== dirname(dir)) {
        dir = dirname(dir);
      }
      try {
        const normalizedDir = realpathSync(dir);
        const remainder = candidate.substring(dir.length);
        normalized = normalizedDir + remainder;
      } catch {
        normalized = candidate;
      }
    }

    // Layer 3: Containment check — normalized path must start with root
    if (!normalized.startsWith(this.root)) {
      return { valid: false, resolved: "", error: "Path traversal rejected: outside template root" };
    }

    return { valid: true, resolved: normalized };
  }

  // Resolve a template path (absolute from root if starts with /, else relative to current file)
  resolveTemplatePath(src: string, currentFile: string): { valid: boolean; resolved: string; error?: string } {
    // Layer 1: Pre-filter
    if (src.includes("..")) {
      return { valid: false, resolved: "", error: "Path traversal rejected: contains .." };
    }

    let candidate: string;
    if (src.startsWith("/")) {
      candidate = resolve(this.root, src.substring(1));
    } else {
      candidate = resolve(dirname(currentFile), src);
    }

    // Layer 2: Normalize
    let normalized: string;
    if (existsSync(candidate)) {
      try {
        normalized = realpathSync(candidate);
      } catch {
        normalized = candidate;
      }
    } else {
      normalized = candidate;
    }

    // Layer 3: Containment check
    if (!normalized.startsWith(this.root)) {
      return { valid: false, resolved: "", error: "Path traversal rejected: outside template root" };
    }

    return { valid: true, resolved: normalized };
  }
}
