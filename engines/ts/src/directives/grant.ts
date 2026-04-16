// PRESTO-TS v3 — Stage 11: htx:grant materialization
// C3: Materializes scoped, signed, time-limited credentials. Sub MUST include user identity.

import type { DataContext } from "../types";
import { ChannelTokenService, SignedUrlService } from "../security/tokens";

const GRANT_RE = /<htx:grant\s+([^>]*)\/>/g;
const ATTR_RE = /(\w+)\s*=\s*"([^"]*)"/g;

export async function resolveGrants(
  content: string,
  data: DataContext,
  secret: string,
): Promise<string> {
  const matches = [...content.matchAll(GRANT_RE)];
  let result = content;

  for (const match of matches) {
    const attrs = parseAttrs(match[1]);
    const type = attrs.type;
    const asName = attrs.as;
    if (!type || !asName) {
      result = result.replace(match[0], "");
      continue;
    }

    // Determine user identity for sub field
    const auth = data.auth as { user?: { id: string } } | null;
    const userId = auth?.user?.id || "anonymous";

    const channelService = new ChannelTokenService(secret);
    const urlService = new SignedUrlService(secret);

    let token: string;
    switch (type) {
      case "websocket":
        token = await channelService.issue(userId, "websocket");
        break;
      case "channel":
        const module = attrs.module || "default";
        token = await channelService.issue(userId, `channel:${module}`);
        break;
      case "asset":
        const path = attrs.path || "/";
        token = await urlService.sign(path);
        break;
      default:
        token = "";
    }

    data[asName] = token;
    result = result.replace(match[0], "");
  }

  return result;
}

function parseAttrs(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m;
  const re = new RegExp(ATTR_RE.source, "g");
  while ((m = re.exec(str)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}
