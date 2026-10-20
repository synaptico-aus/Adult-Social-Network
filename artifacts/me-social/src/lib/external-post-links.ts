export type PostTextPart = { text: string; href?: string; domain?: string };

/** Plain external links only: no preview requests, downloads or third-party embeds. */
export function externalPostLinks(body: string): PostTextPart[] {
  const parts: PostTextPart[] = [];
  const matches = body.matchAll(/https?:\/\/[^\s<>"']+/giu);
  let cursor = 0;
  let count = 0;
  for (const match of matches) {
    if (++count > 20) break;
    const start = match.index!;
    const text = match[0].replace(/[.,!?;:)\]}]+$/u, "");
    if (start > cursor) parts.push({ text: body.slice(cursor, start) });
    try {
      const url = new URL(text);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Not a plain external URL");
      parts.push({ text, href: url.href, domain: url.hostname });
    } catch {
      parts.push({ text });
    }
    cursor = start + text.length;
  }
  if (cursor < body.length) parts.push({ text: body.slice(cursor) });
  return parts;
}
