// mode: "pages"  -> every entry must be a single page URL (has a path)
// mode: "domain" -> exactly one entry, domain / root URL only

function check(raw, mode) {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u;
  try {
    u = new URL(withScheme);
  } catch {
    return { raw, ok: false, error: "Not a valid URL" };
  }
  if (!/\.[a-z]{2,}$/i.test(u.hostname)) {
    return { raw, ok: false, error: "Not a valid URL" };
  }

  const isRoot = (u.pathname === "/" || u.pathname === "") && !u.search && !u.hash;

  if (mode === "pages" && isRoot) {
    return { raw, ok: false, error: "This is a domain, not a page. Use Whole domain" };
  }
  if (mode === "domain" && !isRoot) {
    return { raw, ok: false, error: "This is a page URL. Use Page URLs, or enter only the domain" };
  }

  return {
    raw,
    ok: true,
    host: u.hostname,
    url: isRoot ? u.origin : u.origin + u.pathname + u.search,
  };
}

export function parseEntries(text, mode) {
  const seen = new Set();
  const items = [];
  for (const raw of text.split(/[\s,]+/).filter(Boolean)) {
    const item = check(raw, mode);
    const key = item.url || raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  if (mode === "domain") {
    items.forEach((it, k) => {
      if (k > 0) Object.assign(it, { ok: false, error: "Only one domain at a time" });
    });
  }
  return items;
}
