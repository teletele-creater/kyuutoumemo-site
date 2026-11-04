var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-YFYUuC/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// .wrangler/tmp/pages-5AVsDs/bundledWorker-0.9338041175405721.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var urls2 = /* @__PURE__ */ new Set();
function checkURL2(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls2.has(url.toString())) {
      urls2.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL2, "checkURL");
__name2(checkURL2, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL2(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});
var SUPABASE_URL = "https://byywhukxggelizpckbba.supabase.co";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5eXdodWt4Z2dlbGl6cGNrYmJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjQ0NTAsImV4cCI6MjA5NDkwMDQ1MH0.Dg-rXPTzV2YrHS9-mCVBkUMTDWLAWKHxARwJ1rMaRw4";
var SUPABASE_TABLE = "surge_events";
var SITE_NAME = "\u682A\u4FA1\u6025\u9A30\u8981\u56E0\u30E1\u30E2";
var X_TITLE_MODE = "short";
var X_CRAWLER_UA = /Twitterbot/i;
var FALLBACK_IMAGE = "/og-image.png?v=2";
var SPA_PATH = /^\/(cats|archive|watch|report|plan|legal|privacy|scouter|surges)\/?$/;
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const card = url.pathname.match(/^\/card\/([0-9A-Za-z]{2,10})\.png$/);
    if (card) {
      return cardImage(card[1], url.origin, env);
    }
    const page = url.pathname.match(/^\/stock\/([0-9A-Za-z]{2,10})(?:\/(\d{6,8}))?\/?$/);
    if (page) {
      const ua = request.headers.get("user-agent") || "";
      if (X_CRAWLER_UA.test(ua))
        return stockCardPage(page[1], url.origin, ua);
      return stockSeoPage(page[1], page[2] || null, url.origin, env);
    }
    if (url.pathname === "/sitemap.xml") {
      return sitemap(url.origin);
    }
    if (SPA_PATH.test(url.pathname)) {
      return env.ASSETS.fetch(new Request(`${url.origin}/`, { headers: request.headers }));
    }
    return env.ASSETS.fetch(request);
  }
};
function jstParts(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 36e5);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}
__name(jstParts, "jstParts");
__name2(jstParts, "jstParts");
function jstYmd(iso) {
  const p = jstParts(iso);
  return `${p.y}${String(p.m).padStart(2, "0")}${String(p.d).padStart(2, "0")}`;
}
__name(jstYmd, "jstYmd");
__name2(jstYmd, "jstYmd");
function jstLabel(iso, withYear = true) {
  const p = jstParts(iso);
  return `${withYear ? p.y + "\u5E74" : ""}${p.m}\u6708${p.d}\u65E5`;
}
__name(jstLabel, "jstLabel");
__name2(jstLabel, "jstLabel");
function jstHM(iso) {
  const p = jstParts(iso);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}
__name(jstHM, "jstHM");
__name2(jstHM, "jstHM");
function dispName(s) {
  try {
    return String(s || "").normalize("NFKC");
  } catch (e) {
    return String(s || "");
  }
}
__name(dispName, "dispName");
__name2(dispName, "dispName");
function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "\u2026" : t;
}
__name(clip, "clip");
__name2(clip, "clip");
async function supabaseGet(query, ttl = 300) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        cf: { cacheTtl: ttl }
      });
      if (res.ok)
        return await res.json();
    } catch (e) {
    }
  }
  return null;
}
__name(supabaseGet, "supabaseGet");
__name2(supabaseGet, "supabaseGet");
async function stockSeoPage(code, ymd, origin, env) {
  const rows = await supabaseGet(
    `${SUPABASE_TABLE}?stock_code=eq.${encodeURIComponent(code)}&select=stock_code,stock_name,reason,business,keywords,backgrounds,related_stocks,chart_url,detected_at&order=detected_at.desc&limit=50`
  ) || [];
  const shell = await env.ASSETS.fetch(new Request(`${origin}/`));
  const latest = rows[0];
  if (!latest) {
    return new HTMLRewriter().on("head", { element(el) {
      el.append('<meta name="robots" content="noindex" />', { html: true });
    } }).transform(new Response(shell.body, { status: 404, headers: htmlHeaders() }));
  }
  const isPast = !!(ymd && ymd.length === 8 && rows.some((r) => jstYmd(r.detected_at) === ymd) && jstYmd(latest.detected_at) !== ymd);
  const name = dispName(latest.stock_name || code);
  const date = jstLabel(latest.detected_at);
  const canonical = `${origin}/stock/${code}`;
  const title = `${name}\uFF08${code}\uFF09\u304C\u6025\u9A30\u3057\u305F\u7406\u7531\uFF5C${jstLabel(latest.detected_at, false)}\u306E\u6750\u6599 | ${SITE_NAME}`;
  const desc = clip(
    `${date}\u3001${name}\uFF08${code}\uFF09\u306E\u682A\u4FA1\u304C\u6025\u9A30\u3002\u7406\u7531\u306F\u300C${latest.reason || "\u6574\u7406\u4E2D"}\u300D\u3002` + (latest.business ? `\u4E8B\u696D\u5185\u5BB9\uFF1A${latest.business}` : ""),
    120
  );
  const ver = String(latest.detected_at || "").replace(/\D/g, "").slice(0, 12) || "0";
  const image = latest.chart_url ? `${origin}/card/${code}.png?v=${ver}` : `${origin}${FALLBACK_IMAGE}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${name}\uFF08${code}\uFF09\u304C\u6025\u9A30\u3057\u305F\u7406\u7531`,
    description: desc,
    datePublished: latest.detected_at,
    dateModified: latest.detected_at,
    image: [image],
    mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: SITE_NAME, url: origin },
    publisher: { "@type": "Organization", name: SITE_NAME, url: origin }
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: `${name}\uFF08${code}\uFF09`, item: canonical }
    ]
  };
  const body = renderStockBody({ code, name, latest, rows, isPast });
  const setMeta = /* @__PURE__ */ __name2((sel, value) => [sel, { element(el) {
    el.setAttribute("content", value);
  } }], "setMeta");
  let rw = new HTMLRewriter().on("title", { element(el) {
    el.setInnerContent(title);
  } }).on(...setMeta('meta[name="description"]', desc)).on(...setMeta('meta[property="og:type"]', "article")).on(...setMeta('meta[property="og:title"]', title)).on(...setMeta('meta[property="og:description"]', desc)).on(...setMeta('meta[property="og:url"]', canonical)).on(...setMeta('meta[property="og:image"]', image)).on(...setMeta('meta[name="twitter:title"]', title)).on(...setMeta('meta[name="twitter:description"]', desc)).on(...setMeta('meta[name="twitter:image"]', image)).on("head", {
    element(el) {
      el.append(`<link rel="canonical" href="${escapeHtml(canonical)}" />`, { html: true });
      if (isPast)
        el.append('<meta name="robots" content="noindex, follow" />', { html: true });
      el.append(`<script type="application/ld+json">${jsonForScript(jsonLd)}<\/script>`, { html: true });
      el.append(`<script type="application/ld+json">${jsonForScript(breadcrumb)}<\/script>`, { html: true });
    }
  }).on("#root", { element(el) {
    el.setInnerContent(body, { html: true });
  } });
  return rw.transform(new Response(shell.body, { status: 200, headers: htmlHeaders() }));
}
__name(stockSeoPage, "stockSeoPage");
__name2(stockSeoPage, "stockSeoPage");
function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    // 新しい検知の反映を優先しつつ、クローラーの連打は吸収する
    "Cache-Control": "public, max-age=300"
  };
}
__name(htmlHeaders, "htmlHeaders");
__name2(htmlHeaders, "htmlHeaders");
function jsonForScript(o) {
  return JSON.stringify(o).replace(/</g, "\\u003c");
}
__name(jsonForScript, "jsonForScript");
__name2(jsonForScript, "jsonForScript");
function parseRelated(text) {
  return String(text || "").split(/\n+/).map((line) => {
    const s = line.trim().replace(/^\(/, "").replace(/\)$/, "");
    const m = s.match(/^([0-9]{3,4}[A-Za-z]?)\s*[:：]\s*(.+)$/);
    if (!m)
      return null;
    const parts = m[2].split(/\s*[—–―]\s*/);
    return { code: m[1], name: (parts[0] || "").trim(), desc: parts.slice(1).join(" \u2014 ").trim() };
  }).filter(Boolean);
}
__name(parseRelated, "parseRelated");
__name2(parseRelated, "parseRelated");
function renderStockBody({ code, name, latest, rows, isPast }) {
  const e = escapeHtml;
  const h2 = /* @__PURE__ */ __name2((t) => `<h2 style="margin:28px 0 0;padding-top:10px;border-top:2px solid #1D2026;font-size:18px">${e(t)}</h2>`, "h2");
  const p = /* @__PURE__ */ __name2((t) => `<p style="margin:10px 0 0;line-height:1.9">${e(t)}</p>`, "p");
  const bg = Array.isArray(latest.backgrounds) ? latest.backgrounds : [];
  const kw = Array.isArray(latest.keywords) ? latest.keywords : [];
  const related = parseRelated(latest.related_stocks);
  let html = `<main style="max-width:760px;margin:0 auto;padding:20px 18px 40px;font-family:'BIZ UDPGothic',sans-serif;color:#1D2026;font-size:15px">`;
  html += `<nav style="font-size:13px;color:#6B707A"><a href="/" style="color:inherit">${e(SITE_NAME)}</a> \u203A ${e(name)}\uFF08${e(code)}\uFF09</nav>`;
  html += `<h1 style="margin:14px 0 0;font-size:28px;line-height:1.35">${e(name)}\uFF08${e(code)}\uFF09\u304C\u6025\u9A30\u3057\u305F\u7406\u7531</h1>`;
  if (isPast) {
    html += p("\u3053\u306E\u65E5\u306E\u691C\u77E5\u30E1\u30E2\u306F\u6709\u6599\u4F1A\u54E1\u9650\u5B9A\u3067\u3059\u3002\u6700\u65B0\u306E\u691C\u77E5\u30E1\u30E2\u306F\u4E0B\u8A18\u306E\u3068\u304A\u308A\u3067\u3059\u3002");
  }
  html += `<p style="margin:8px 0 0;color:#6B707A">${e(jstLabel(latest.detected_at))} ${e(jstHM(latest.detected_at))} \u306B\u6025\u9A30\u3092\u691C\u77E5</p>`;
  html += h2("\u6025\u9A30\u306E\u7406\u7531");
  html += `<p style="margin:10px 0 0;font-size:18px;font-weight:700;line-height:1.75">${e(latest.reason || "\u6574\u7406\u4E2D")}</p>`;
  if (bg.length)
    html += `<ul style="margin:10px 0 0;padding-left:20px;line-height:1.9">${bg.map((b) => `<li>${e(b)}</li>`).join("")}</ul>`;
  if (latest.business) {
    html += h2("\u4E8B\u696D\u5185\u5BB9");
    html += p(latest.business);
  }
  if (kw.length) {
    html += h2("\u95A2\u9023\u30C6\u30FC\u30DE");
    html += `<p style="margin:10px 0 0">${kw.slice(0, 8).map((k) => e(k)).join("\u3001")}</p>`;
  }
  if (related.length) {
    html += h2("\u9023\u60F3\u3067\u52D5\u304D\u3084\u3059\u3044\u9298\u67C4");
    html += `<ul style="margin:10px 0 0;padding-left:20px;line-height:1.9">${related.map((r) => `<li><a href="/stock/${e(r.code)}">${e(dispName(r.name))}\uFF08${e(r.code)}\uFF09</a>${r.desc ? "\uFF1A" + e(r.desc) : ""}</li>`).join("")}</ul>`;
  }
  if (rows.length > 1) {
    html += h2(`${name}\u306E\u691C\u77E5\u5C65\u6B74`);
    html += p(`\u3053\u308C\u307E\u3067\u306B ${rows.length} \u56DE\u3001\u6025\u9A30\u3092\u691C\u77E5\u3057\u3066\u3044\u307E\u3059\u3002\u904E\u53BB\u306E\u691C\u77E5\u30E1\u30E2\u306F\u6709\u6599\u4F1A\u54E1\u9650\u5B9A\u3067\u3059\u3002`);
    html += `<ul style="margin:10px 0 0;padding-left:20px;line-height:1.9">${rows.map((r, i) => `<li>${e(jstLabel(r.detected_at))}${i === 0 ? "\uFF08\u6700\u65B0\uFF09" : ""}</li>`).join("")}</ul>`;
  }
  html += `<p style="margin:32px 0 0;font-size:12px;color:#6B707A;line-height:1.8">\u672C\u30B5\u30A4\u30C8\u306F\u3001\u516C\u958B\u60C5\u5831\u304A\u3088\u3073\u904E\u53BB\u30C7\u30FC\u30BF\u3092\u3082\u3068\u306B\u3057\u305F\u60C5\u5831\u6574\u7406\u30FB\u5206\u6790\u3092\u76EE\u7684\u3068\u3057\u3066\u304A\u308A\u3001\u7279\u5B9A\u306E\u91D1\u878D\u5546\u54C1\u306E\u58F2\u8CB7\u3092\u63A8\u5968\u3059\u308B\u3082\u306E\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u6295\u8CC7\u5224\u65AD\u306F\u3054\u81EA\u8EAB\u306E\u8CAC\u4EFB\u3067\u884C\u3063\u3066\u304F\u3060\u3055\u3044\u3002</p>`;
  html += `</main>`;
  return html;
}
__name(renderStockBody, "renderStockBody");
__name2(renderStockBody, "renderStockBody");
async function sitemap(origin) {
  const rows = await supabaseGet(
    `${SUPABASE_TABLE}?select=stock_code,detected_at&order=detected_at.desc&limit=5000`,
    3600
  ) || [];
  const seen = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const c = String(r.stock_code || "");
    if (c && !seen.has(c))
      seen.set(c, r.detected_at);
  }
  const latestAll = rows[0] ? rows[0].detected_at : null;
  const urls22 = [
    { loc: `${origin}/`, lastmod: latestAll, freq: "hourly", pri: "1.0" },
    { loc: `${origin}/archive`, lastmod: latestAll, freq: "daily", pri: "0.6" },
    { loc: `${origin}/cats`, lastmod: latestAll, freq: "daily", pri: "0.5" },
    { loc: `${origin}/plan`, freq: "monthly", pri: "0.3" },
    { loc: `${origin}/legal`, freq: "yearly", pri: "0.1" },
    { loc: `${origin}/privacy`, freq: "yearly", pri: "0.1" },
    ...[...seen.entries()].map(([c, t]) => ({ loc: `${origin}/stock/${c}`, lastmod: t, freq: "daily", pri: "0.8" }))
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
` + urls22.map((u) => `  <url><loc>${escapeHtml(u.loc)}</loc>` + (u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : "") + `<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join("\n") + `
</urlset>
`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" }
  });
}
__name(sitemap, "sitemap");
__name2(sitemap, "sitemap");
async function fetchLatestEvent(code) {
  const q = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?stock_code=eq.${encodeURIComponent(code)}&select=stock_code,stock_name,reason,chart_url,detected_at&order=detected_at.desc&limit=1`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(q, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`
        },
        cf: { cacheTtl: 300 }
      });
      if (res.ok) {
        const rows = await res.json();
        return rows && rows[0] ? rows[0] : null;
      }
    } catch (e) {
    }
  }
  return null;
}
__name(fetchLatestEvent, "fetchLatestEvent");
__name2(fetchLatestEvent, "fetchLatestEvent");
async function cardImage(code, origin, env) {
  const row = await fetchLatestEvent(code);
  const src = row && row.chart_url ? row.chart_url : null;
  if (src) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const upstream = await fetch(src, {
          cf: { cacheTtl: 86400, cacheEverything: true }
        });
        if (upstream.ok) {
          return new Response(upstream.body, {
            headers: {
              "Content-Type": "image/png",
              // URL に ?v={detected_at} が付くので長めにキャッシュしてよい
              "Cache-Control": "public, max-age=86400"
            }
          });
        }
      } catch (e) {
      }
    }
  }
  const res = await env.ASSETS.fetch(new Request(`${origin}/og-image.png`));
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60"
    }
  });
}
__name(cardImage, "cardImage");
__name2(cardImage, "cardImage");
async function stockCardPage(code, origin, userAgent) {
  const row = await fetchLatestEvent(code);
  const name = row && row.stock_name ? row.stock_name : code;
  const reason = row && row.reason ? row.reason : "";
  const ver = row && row.detected_at ? String(row.detected_at).replace(/\D/g, "").slice(0, 12) : "0";
  const image = row && row.chart_url ? `${origin}/card/${code}.png?v=${ver}` : `${origin}${FALLBACK_IMAGE}`;
  const title = `${name}\uFF08${code}\uFF09\u306E\u6025\u9A30\u8981\u56E0 | \u682A\u4FA1\u6025\u9A30\u8981\u56E0\u30E1\u30E2`;
  const desc = reason ? `${reason}\u306B\u3088\u308B\u6025\u9A30\u3002\u30C1\u30E3\u30FC\u30C8\u30FB\u5F37\u6750\u6599\u30FB\u95A2\u9023\u9298\u67C4\u306E\u521D\u52D5\u30E1\u30E2\u3002` : "\u6025\u9A30\u3057\u305F\u9298\u67C4\u306E\u300C\u306A\u305C\u4E0A\u304C\u3063\u305F\u304B\u300D\u3092\u521D\u52D5\u3067\u8A18\u9332\u3059\u308B\u30E1\u30E2\u30B5\u30A4\u30C8\u3002";
  const target = `/#stock/${code}`;
  const canonical = `${origin}/stock/${code}`;
  const isX = X_CRAWLER_UA.test(userAgent);
  const bare = isX && X_TITLE_MODE === "none";
  const cardTitle = isX && X_TITLE_MODE === "short" ? `${name}\uFF08${code}\uFF09` : title;
  const meta = bare ? `<meta property="og:type" content="article" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta name="twitter:image:alt" content="${escapeHtml(name)}\u306E\u682A\u4FA1\u30C1\u30E3\u30FC\u30C8" />` : `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="\u682A\u4FA1\u6025\u9A30\u8981\u56E0\u30E1\u30E2" />
<meta property="og:title" content="${escapeHtml(cardTitle)}" />
<meta property="og:description" content="${escapeHtml(desc)}" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(cardTitle)}" />
<meta name="twitter:description" content="${escapeHtml(desc)}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta name="twitter:image:alt" content="${escapeHtml(name)}\u306E\u682A\u4FA1\u30C1\u30E3\u30FC\u30C8" />`;
  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="canonical" href="${canonical}" />
${meta}
<script>location.replace(${JSON.stringify(target)});<\/script>
<meta http-equiv="refresh" content="0;url=${target}" />
</head>
<body>
<p>\u79FB\u52D5\u4E2D\u2026 <a href="${target}">\u958B\u304B\u306A\u3044\u5834\u5408\u306F\u3053\u3061\u3089</a></p>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 最新イベントの反映を優先しつつクローラーの連打は吸収する
      "Cache-Control": "public, max-age=300",
      // UA でHTMLを出し分けるのでキャッシュを分ける
      Vary: "User-Agent"
    }
  });
}
__name(stockCardPage, "stockCardPage");
__name2(stockCardPage, "stockCardPage");
function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
__name(escapeHtml, "escapeHtml");
__name2(escapeHtml, "escapeHtml");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = /* @__PURE__ */ __name(class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
}, "__Facade_ScheduledController__");
__name2(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
__name2(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../AppData/Local/npm-cache/_npx/d12df5bd68f8c335/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../AppData/Local/npm-cache/_npx/d12df5bd68f8c335/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-YFYUuC/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../AppData/Local/npm-cache/_npx/d12df5bd68f8c335/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-YFYUuC/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__2, "__Facade_ScheduledController__");
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=bundledWorker-0.9338041175405721.js.map
