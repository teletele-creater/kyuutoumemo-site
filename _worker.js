// Cloudflare Pages Advanced Worker
//
// /stock/{銘柄コード}[/{日付}] … 銘柄ページ
//   - X(Twitter)のクローラー → チャート画像を og:image にしたカード用HTML（stockCardPage）
//   - それ以外（人・Google など）→ SPA の index.html に、その銘柄のタイトル・説明・本文を
//     差し込んで返す（stockSeoPage）。検索エンジンが JS を実行しなくても中身を読めるようにするため
// /card/{銘柄コード}.png       … Supabase 上のチャートPNGを自ドメイン経由で配信（カード画像）
// /theme/{テーマ名}・/category/{キー} … テーマ別・急騰理由カテゴリ別の銘柄一覧。銘柄ページと同じく本文を差し込む
// /sitemap.xml                 … 銘柄・テーマ・カテゴリのページと主要ページの一覧（検索エンジン向け）
// /archive・/legal などの画面   … 静的ファイルが無いので index.html を返し、SPA 側で表示を切り替える
// それ以外のリクエストはすべて静的アセットにそのまま流す。
//
// 公開範囲：銘柄の「最新の検知メモ」は誰でも読める。過去の検知メモは有料会員限定なので、
// HTML への差し込み・サイトマップには最新の1件だけを載せ、過去分は日付だけを出す。

const SUPABASE_URL = "https://byywhukxggelizpckbba.supabase.co";
// anon キー（site-config.js で公開済みの読み取り専用キーと同じもの）
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5eXdodWt4Z2dlbGl6cGNrYmJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjQ0NTAsImV4cCI6MjA5NDkwMDQ1MH0.Dg-rXPTzV2YrHS9-mCVBkUMTDWLAWKHxARwJ1rMaRw4";
const SUPABASE_TABLE = "surge_events";
const SITE_NAME = "株価急騰要因メモ";

// X(Twitter)のカードに出すタイトル。画像下部の黒い帯はこのタイトルが描画されたもので、
// 帯の幅は文字数に比例するため、短くすれば帯も小さくなる。
//   "short" … 「社名（コード）」だけ（既定。帯が最小限になる）
//   "full"  … サイトと同じ長いタイトル（帯が画像下部いっぱいに広がる。従来の見た目）
//   "none"  … タイトルを出さない。⚠️2026-07-27に実測したところ、X は twitter:title が
//             無いと【カード自体を描画しない】。帯は消えるが画像も出ないので使わないこと。
// ブラウザ・Google・Slack 等には常にフルタイトルを返す（SEOには影響しない）。
const X_TITLE_MODE = "short";
const X_CRAWLER_UA = /Twitterbot/i;

// 画像取得に失敗したときのフォールバック（必ず存在する静的画像）
const FALLBACK_IMAGE = "/og-image.png?v=2";

const CANONICAL_ORIGIN = "https://kyuutoumemo.com";
const PAGES_DEV_HOST = "kyuutoumemo.pages.dev";

// トップと SPA の画面に canonical を付ける（HTML のときだけ）
function withCanonical(res, href) {
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
  return new HTMLRewriter()
    .on("head", { element(el) { el.append(`<link rel="canonical" href="${escapeHtml(href)}" />`, { html: true }); } })
    .transform(res);
}

// SPA の画面（対応する静的ファイルが無い）。app.jsx の HASH_PAGES と揃える
const SPA_PATH = /^\/(cats|archive|watch|report|plan|legal|privacy|scouter|surges)\/?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Pages の既定ドメインは独自ドメインへ寄せる（同じ中身が2つのドメインにあると、検索で重複扱いになる）
    if (url.hostname === PAGES_DEV_HOST) {
      return Response.redirect(`${CANONICAL_ORIGIN}${url.pathname}${url.search}`, 301);
    }

    const card = url.pathname.match(/^\/card\/([0-9A-Za-z]{2,10})\.png$/);
    if (card) {
      return cardImage(card[1], url.origin, env);
    }

    const page = url.pathname.match(/^\/stock\/([0-9A-Za-z]{2,10})(?:\/(\d{6,8}))?\/?$/);
    if (page) {
      const ua = request.headers.get("user-agent") || "";
      if (X_CRAWLER_UA.test(ua)) return stockCardPage(page[1], url.origin, ua);
      return stockSeoPage(page[1], page[2] || null, url.origin, env);
    }

    const list = url.pathname.match(/^\/(theme|category)\/([^/]+)\/?$/);
    if (list) {
      let slug = list[2];
      try { slug = decodeURIComponent(slug); } catch (e) {}
      return listSeoPage({ kind: list[1], slug: slug.trim(), origin: url.origin, env });
    }

    if (url.pathname === "/sitemap.xml") {
      return sitemap(url.origin);
    }

    if (SPA_PATH.test(url.pathname)) {
      // /index.html は Pages が / へ 308 転送するので、/ を直接読む
      const res = await env.ASSETS.fetch(new Request(`${url.origin}/`, { headers: request.headers }));
      return withCanonical(res, `${url.origin}${url.pathname.replace(/\/$/, "")}`);
    }

    if (url.pathname === "/") {
      return withCanonical(await env.ASSETS.fetch(request), `${url.origin}/`);
    }

    return env.ASSETS.fetch(request);
  },
};

// ─────────────────────────────────────────────
// 日付まわり（すべて JST）
function jstParts(iso) {
  const d = new Date(new Date(iso).getTime() + 9 * 3600000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}
function jstYmd(iso) {
  const p = jstParts(iso);
  return `${p.y}${String(p.m).padStart(2, "0")}${String(p.d).padStart(2, "0")}`;
}
function jstLabel(iso, withYear = true) {
  const p = jstParts(iso);
  return `${withYear ? p.y + "年" : ""}${p.m}月${p.d}日`;
}
function jstHM(iso) {
  const p = jstParts(iso);
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}
// 全角英数を半角に（ＰＥＧＡＳＵＳ → PEGASUS）。表示用
function dispName(s) {
  try { return String(s || "").normalize("NFKC"); } catch (e) { return String(s || ""); }
}
function clip(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

async function supabaseGet(query, ttl = 300) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        cf: { cacheTtl: ttl },
      });
      if (res.ok) return await res.json();
    } catch (e) {
      // 1回だけリトライしてから諦める
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// 銘柄ページ：index.html にタイトル・説明・本文を差し込んで返す
async function stockSeoPage(code, ymd, origin, env) {
  const rows = await supabaseGet(
    `${SUPABASE_TABLE}?stock_code=eq.${encodeURIComponent(code)}` +
    `&select=stock_code,stock_name,reason,business,keywords,backgrounds,related_stocks,chart_url,detected_at` +
    `&order=detected_at.desc&limit=50`
  ) || [];
  const shell = await env.ASSETS.fetch(new Request(`${origin}/`));
  const latest = rows[0];

  // 検知が無い銘柄：SPA はそのまま返し、検索には載せない
  if (!latest) {
    return new HTMLRewriter()
      .on("head", { element(el) { el.append('<meta name="robots" content="noindex" />', { html: true }); } })
      .transform(new Response(shell.body, { status: 404, headers: htmlHeaders() }));
  }

  // 日付付きURLで、最新以外の日を指している → 過去の検知メモは会員限定なので本文は出さず、検索にも載せない
  const isPast = !!(ymd && ymd.length === 8 && rows.some(r => jstYmd(r.detected_at) === ymd) && jstYmd(latest.detected_at) !== ymd);

  const name = dispName(latest.stock_name || code);
  const date = jstLabel(latest.detected_at);
  const canonical = `${origin}/stock/${code}`;
  const title = `${name}（${code}）が急騰した理由｜${jstLabel(latest.detected_at, false)}の材料 | ${SITE_NAME}`;
  const desc = clip(
    `${date}、${name}（${code}）の株価が急騰。理由は「${latest.reason || "整理中"}」。` +
    (latest.business ? `事業内容：${latest.business}` : ""),
    120,
  );
  const ver = String(latest.detected_at || "").replace(/\D/g, "").slice(0, 12) || "0";
  const image = latest.chart_url ? `${origin}/card/${code}.png?v=${ver}` : `${origin}${FALLBACK_IMAGE}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${name}（${code}）が急騰した理由`,
    description: desc,
    datePublished: latest.detected_at,
    dateModified: latest.detected_at,
    image: [image],
    mainEntityOfPage: canonical,
    author: { "@type": "Organization", name: SITE_NAME, url: origin },
    publisher: { "@type": "Organization", name: SITE_NAME, url: origin },
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: SITE_NAME, item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: `${name}（${code}）`, item: canonical },
    ],
  };

  const body = renderStockBody({ code, name, latest, rows, isPast });
  const setMeta = (sel, value) => [sel, { element(el) { el.setAttribute("content", value); } }];

  let rw = new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on(...setMeta('meta[name="description"]', desc))
    .on(...setMeta('meta[property="og:type"]', "article"))
    .on(...setMeta('meta[property="og:title"]', title))
    .on(...setMeta('meta[property="og:description"]', desc))
    .on(...setMeta('meta[property="og:url"]', canonical))
    .on(...setMeta('meta[property="og:image"]', image))
    .on(...setMeta('meta[name="twitter:title"]', title))
    .on(...setMeta('meta[name="twitter:description"]', desc))
    .on(...setMeta('meta[name="twitter:image"]', image))
    .on("head", {
      element(el) {
        el.append(`<link rel="canonical" href="${escapeHtml(canonical)}" />`, { html: true });
        if (isPast) el.append('<meta name="robots" content="noindex, follow" />', { html: true });
        el.append(`<script type="application/ld+json">${jsonForScript(jsonLd)}</script>`, { html: true });
        el.append(`<script type="application/ld+json">${jsonForScript(breadcrumb)}</script>`, { html: true });
      },
    })
    .on("#root", { element(el) { el.setInnerContent(body, { html: true }); } });

  return rw.transform(new Response(shell.body, { status: 200, headers: htmlHeaders() }));
}

function htmlHeaders() {
  return {
    "Content-Type": "text/html; charset=utf-8",
    // 新しい検知の反映を優先しつつ、クローラーの連打は吸収する
    "Cache-Control": "public, max-age=300",
  };
}

// </script> を含む文字列で script 要素が閉じないようにする
function jsonForScript(o) {
  return JSON.stringify(o).replace(/</g, "\\u003c");
}

// related_stocks の「(3641: パピレス — 説明文)」形式を読む（pages.jsx の _parseRelatedStocks と同じ規則）
function parseRelated(text) {
  return String(text || "").split(/\n+/).map(line => {
    const s = line.trim().replace(/^\(/, "").replace(/\)$/, "");
    const m = s.match(/^([0-9]{3,4}[A-Za-z]?)\s*[:：]\s*(.+)$/);
    if (!m) return null;
    const parts = m[2].split(/\s*[—–―]\s*/);
    return { code: m[1], name: (parts[0] || "").trim(), desc: parts.slice(1).join(" — ").trim() };
  }).filter(Boolean);
}

// JS が動く前（と検索エンジン）に見える本文。React が起動すると SPA の画面に置き換わる
function renderStockBody({ code, name, latest, rows, isPast }) {
  const e = escapeHtml;
  const h2 = t => `<h2 style="margin:28px 0 0;padding-top:10px;border-top:2px solid #1D2026;font-size:18px">${e(t)}</h2>`;
  const p = t => `<p style="margin:10px 0 0;line-height:1.9">${e(t)}</p>`;
  const bg = Array.isArray(latest.backgrounds) ? latest.backgrounds : [];
  const kw = Array.isArray(latest.keywords) ? latest.keywords : [];
  const related = parseRelated(latest.related_stocks);

  let html = `<main style="max-width:760px;margin:0 auto;padding:20px 18px 40px;font-family:'BIZ UDPGothic',sans-serif;color:#1D2026;font-size:15px">`;
  html += `<nav style="font-size:13px;color:#6B707A"><a href="/" style="color:inherit">${e(SITE_NAME)}</a> › ${e(name)}（${e(code)}）</nav>`;
  html += `<h1 style="margin:14px 0 0;font-size:28px;line-height:1.35">${e(name)}（${e(code)}）が急騰した理由</h1>`;
  if (isPast) {
    html += p("この日の検知メモは有料会員限定です。最新の検知メモは下記のとおりです。");
  }
  html += `<p style="margin:8px 0 0;color:#6B707A">${e(jstLabel(latest.detected_at))} ${e(jstHM(latest.detected_at))} に急騰を検知</p>`;
  html += h2("急騰の理由");
  html += `<p style="margin:10px 0 0;font-size:18px;font-weight:700;line-height:1.75">${e(latest.reason || "整理中")}</p>`;
  if (bg.length) html += `<ul style="margin:10px 0 0;padding-left:20px;line-height:1.9">${bg.map(b => `<li>${e(b)}</li>`).join("")}</ul>`;
  if (latest.business) { html += h2("事業内容"); html += p(latest.business); }
  if (kw.length) {
    html += h2("関連テーマ");
    html += `<p style="margin:10px 0 0">${kw.slice(0, 8).map(k => e(k)).join("、")}</p>`;
  }
  if (related.length) {
    html += h2("連想で動きやすい銘柄");
    html += `<ul style="margin:10px 0 0;padding-left:20px;line-height:1.9">${related.map(r =>
      `<li><a href="/stock/${e(r.code)}">${e(dispName(r.name))}（${e(r.code)}）</a>${r.desc ? "：" + e(r.desc) : ""}</li>`).join("")}</ul>`;
  }
  if (rows.length > 1) {
    html += h2(`${name}の検知履歴`);
    html += p(`これまでに ${rows.length} 回、急騰を検知しています。過去の検知メモは有料会員限定です。`);
    html += `<ul style="margin:10px 0 0;padding-left:20px;line-height:1.9">${rows.map((r, i) =>
      `<li>${e(jstLabel(r.detected_at))}${i === 0 ? "（最新）" : ""}</li>`).join("")}</ul>`;
  }
  html += `<p style="margin:32px 0 0;font-size:12px;color:#6B707A;line-height:1.8">本サイトは、公開情報および過去データをもとにした情報整理・分析を目的としており、特定の金融商品の売買を推奨するものではありません。投資判断はご自身の責任で行ってください。</p>`;
  html += `</main>`;
  return html;
}

// ─────────────────────────────────────────────
// テーマページ・カテゴリページ（検索の入口を増やす）
// 一覧に載せるのは銘柄名・検知日・リンク。理由の文は、その銘柄の「最新の検知」と同じ回のときだけ載せる
// （過去の検知メモは会員限定のため。銘柄ページと同じ決まり）

// pages.jsx の CATEGORIES / _CATEGORY_TOKENS と揃える
const CATEGORY_DEFS = {
  earn:   { label: "好決算",       tokens: ["好決算", "決算"] },
  upward: { label: "上方修正",     tokens: ["上方修正", "上振れ"] },
  div:    { label: "増配",         tokens: ["増配", "配当"] },
  tob:    { label: "TOB・M&A",     tokens: ["TOB", "M&A", "MBO", "公開買付"] },
  ai:     { label: "AI・半導体",   tokens: ["AI", "半導体", "GPU", "生成AI"] },
  bio:    { label: "バイオ",       tokens: ["バイオ", "創薬", "治験"] },
  def:    { label: "防衛",         tokens: ["防衛", "装備"] },
  fx:     { label: "円安メリット", tokens: ["円安"] },
  pol:    { label: "政策テーマ",   tokens: ["政策", "規制", "補助金", "原発", "原子力"] },
  low:    { label: "低位株",       tokens: ["低位"] },
};

// PostgREST の値として安全に埋め込む（" と \ をエスケープ）
function pgQuote(s) {
  return `"${String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const LIST_SELECT = "stock_code,stock_name,reason,keywords,detected_at";

async function themeRows(theme) {
  return await supabaseGet(
    `${SUPABASE_TABLE}?keywords=cs.${encodeURIComponent("{" + pgQuote(theme) + "}")}` +
    `&select=${LIST_SELECT}&order=detected_at.desc&limit=300`
  ) || [];
}
async function categoryRows(key) {
  const def = CATEGORY_DEFS[key];
  if (!def) return [];
  const conds = [
    ...def.tokens.map(t => `reason.ilike.${pgQuote("*" + t + "*")}`),
    `keywords.ov.${"{" + def.tokens.map(pgQuote).join(",") + "}"}`,
  ];
  return await supabaseGet(
    `${SUPABASE_TABLE}?or=${encodeURIComponent("(" + conds.join(",") + ")")}` +
    `&select=${LIST_SELECT}&order=detected_at.desc&limit=300`
  ) || [];
}

// 銘柄ごとに最新の1件へまとめ、その回が銘柄全体でも最新かを調べる
async function latestPerStock(rows) {
  const byCode = new Map();
  for (const r of rows) {
    const c = String(r.stock_code || "");
    if (c && !byCode.has(c)) byCode.set(c, r);
  }
  const codes = [...byCode.keys()];
  const overall = new Map();
  for (let i = 0; i < codes.length; i += 80) {
    const chunk = codes.slice(i, i + 80);
    const latest = await supabaseGet(
      `${SUPABASE_TABLE}?stock_code=in.(${chunk.map(encodeURIComponent).join(",")})` +
      `&select=stock_code,detected_at&order=detected_at.desc&limit=2000`
    ) || [];
    for (const r of latest) {
      const c = String(r.stock_code);
      if (!overall.has(c)) overall.set(c, r.detected_at);
    }
  }
  return codes.map(c => {
    const r = byCode.get(c);
    return { row: r, isLatest: overall.get(c) === r.detected_at };
  });
}

async function listSeoPage({ kind, slug, origin, env }) {
  const isTheme = kind === "theme";
  const label = isTheme ? slug : (CATEGORY_DEFS[slug] && CATEGORY_DEFS[slug].label);
  const rows = label ? (isTheme ? await themeRows(slug) : await categoryRows(slug)) : [];
  const shell = await env.ASSETS.fetch(new Request(`${origin}/`));

  if (!rows.length) {
    return new HTMLRewriter()
      .on("head", { element(el) { el.append('<meta name="robots" content="noindex" />', { html: true }); } })
      .transform(new Response(shell.body, { status: 404, headers: htmlHeaders() }));
  }

  const items = await latestPerStock(rows);
  const path = `/${kind}/${encodeURIComponent(slug)}`;
  const canonical = `${origin}${path}`;
  const heading = isTheme ? `「${label}」関連で急騰した銘柄` : `${label}で急騰した銘柄`;
  const title = `${heading}一覧｜${items.length}銘柄 | ${SITE_NAME}`;
  const names = items.slice(0, 3).map(it => dispName(it.row.stock_name || it.row.stock_code)).join("、");
  const desc = clip(
    `${isTheme ? `「${label}」をテーマに` : `${label}を材料に`}急騰した日本株 ${items.length} 銘柄を、新しい順にまとめています。` +
    `最近は${names}など。最新の検知日は${jstLabel(rows[0].detected_at)}。`,
    120,
  );

  const e = escapeHtml;
  let html = `<main style="max-width:760px;margin:0 auto;padding:20px 18px 40px;font-family:'BIZ UDPGothic',sans-serif;color:#1D2026;font-size:15px">`;
  html += `<nav style="font-size:13px;color:#6B707A"><a href="/" style="color:inherit">${e(SITE_NAME)}</a> › ${e(isTheme ? "テーマ" : "急騰理由カテゴリ")} › ${e(label)}</nav>`;
  html += `<h1 style="margin:14px 0 0;font-size:28px;line-height:1.35">${e(heading)}</h1>`;
  html += `<p style="margin:8px 0 0;color:#6B707A">検知 ${rows.length} 件、${items.length} 銘柄。最新の検知は ${e(jstLabel(rows[0].detected_at))}</p>`;
  html += `<ul style="margin:20px 0 0;padding:0;list-style:none">`;
  for (const it of items) {
    const r = it.row;
    const name = dispName(r.stock_name || r.stock_code);
    html += `<li style="padding:12px 0;border-bottom:1px solid #E4E6E3">` +
      `<a href="/stock/${e(r.stock_code)}" style="font-weight:700;color:#1D2026">${e(name)}（${e(r.stock_code)}）</a>` +
      `<span style="margin-left:8px;font-size:13px;color:#6B707A">${e(jstLabel(r.detected_at))}</span>` +
      (it.isLatest && r.reason ? `<p style="margin:4px 0 0;line-height:1.75">${e(r.reason)}</p>` : "") +
      `</li>`;
  }
  html += `</ul>`;
  html += `<p style="margin:24px 0 0;font-size:13px;color:#6B707A">理由の文は、各銘柄の最新の検知のものだけを載せています。過去の検知メモは有料会員限定です。</p>`;
  html += `<p style="margin:24px 0 0;font-size:12px;color:#6B707A;line-height:1.8">本サイトは、公開情報および過去データをもとにした情報整理・分析を目的としており、特定の金融商品の売買を推奨するものではありません。投資判断はご自身の責任で行ってください。</p>`;
  html += `</main>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: heading,
    description: desc,
    url: canonical,
    dateModified: rows[0].detected_at,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.slice(0, 50).map((it, i) => ({
        "@type": "ListItem", position: i + 1,
        url: `${origin}/stock/${it.row.stock_code}`,
        name: dispName(it.row.stock_name || it.row.stock_code),
      })),
    },
  };
  const setMeta = (sel, value) => [sel, { element(el) { el.setAttribute("content", value); } }];
  return new HTMLRewriter()
    .on("title", { element(el) { el.setInnerContent(title); } })
    .on(...setMeta('meta[name="description"]', desc))
    .on(...setMeta('meta[property="og:title"]', title))
    .on(...setMeta('meta[property="og:description"]', desc))
    .on(...setMeta('meta[property="og:url"]', canonical))
    .on(...setMeta('meta[name="twitter:title"]', title))
    .on(...setMeta('meta[name="twitter:description"]', desc))
    .on("head", {
      element(el) {
        el.append(`<link rel="canonical" href="${escapeHtml(canonical)}" />`, { html: true });
        el.append(`<script type="application/ld+json">${jsonForScript(jsonLd)}</script>`, { html: true });
      },
    })
    .on("#root", { element(el) { el.setInnerContent(html, { html: true }); } })
    .transform(new Response(shell.body, { status: 200, headers: htmlHeaders() }));
}

// ─────────────────────────────────────────────
// サイトマップ：主要ページ + 検知のある銘柄ページ（最新の検知日を lastmod に）
async function sitemap(origin) {
  const rows = await supabaseGet(
    `${SUPABASE_TABLE}?select=stock_code,keywords,detected_at&order=detected_at.desc&limit=5000`, 3600
  ) || [];
  const seen = new Map();
  for (const r of rows) {
    const c = String(r.stock_code || "");
    if (c && !seen.has(c)) seen.set(c, r.detected_at);
  }
  const latestAll = rows[0] ? rows[0].detected_at : null;
  // テーマは検知が2件以上あるものだけ（1件だけの薄いページは載せない）
  const themes = new Map();
  for (const r of rows) {
    for (const k of (Array.isArray(r.keywords) ? r.keywords : [])) {
      const t = String(k || "").trim();
      if (!t || t.includes("/")) continue;
      const cur = themes.get(t) || { n: 0, last: r.detected_at };
      cur.n++;
      themes.set(t, cur);
    }
  }
  const urls = [
    { loc: `${origin}/`, lastmod: latestAll, freq: "hourly", pri: "1.0" },
    { loc: `${origin}/archive`, lastmod: latestAll, freq: "daily", pri: "0.6" },
    { loc: `${origin}/cats`, lastmod: latestAll, freq: "daily", pri: "0.5" },
    { loc: `${origin}/plan`, freq: "monthly", pri: "0.3" },
    { loc: `${origin}/legal`, freq: "yearly", pri: "0.1" },
    { loc: `${origin}/privacy`, freq: "yearly", pri: "0.1" },
    ...[...seen.entries()].map(([c, t]) => ({ loc: `${origin}/stock/${c}`, lastmod: t, freq: "daily", pri: "0.8" })),
    ...Object.keys(CATEGORY_DEFS).map(k => ({ loc: `${origin}/category/${k}`, lastmod: latestAll, freq: "daily", pri: "0.6" })),
    ...[...themes.entries()].filter(([, v]) => v.n >= 2)
      .map(([t, v]) => ({ loc: `${origin}/theme/${encodeURIComponent(t)}`, lastmod: v.last, freq: "daily", pri: "0.6" })),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${escapeHtml(u.loc)}</loc>` +
      (u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : "") +
      `<changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}

// ─────────────────────────────────────────────
// Supabase から最新の急騰イベントを1件取得
async function fetchLatestEvent(code) {
  const q =
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}` +
    `?stock_code=eq.${encodeURIComponent(code)}` +
    `&select=stock_code,stock_name,reason,chart_url,detected_at` +
    `&order=detected_at.desc&limit=1`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(q, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        cf: { cacheTtl: 300 },
      });
      if (res.ok) {
        const rows = await res.json();
        return rows && rows[0] ? rows[0] : null;
      }
    } catch (e) {
      // 1回だけリトライしてから諦める
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// カード画像を自ドメインで配信する。
// Supabase を X のクローラーに直接叩かせると、たまに取得に失敗して
// カードが「画像なしの小さいカード」に格下げされるため、
// Cloudflare のエッジ経由で配信し、失敗時も必ず画像を返す。
async function cardImage(code, origin, env) {
  const row = await fetchLatestEvent(code);
  const src = row && row.chart_url ? row.chart_url : null;

  if (src) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const upstream = await fetch(src, {
          cf: { cacheTtl: 86400, cacheEverything: true },
        });
        if (upstream.ok) {
          return new Response(upstream.body, {
            headers: {
              "Content-Type": "image/png",
              // URL に ?v={detected_at} が付くので長めにキャッシュしてよい
              "Cache-Control": "public, max-age=86400",
            },
          });
        }
      } catch (e) {
        // リトライして、それでもダメならフォールバックへ
      }
    }
  }

  // フォールバック（失敗を長期キャッシュしないよう短命にする）
  const res = await env.ASSETS.fetch(new Request(`${origin}/og-image.png`));
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}

// ─────────────────────────────────────────────
async function stockCardPage(code, origin, userAgent) {
  const row = await fetchLatestEvent(code);

  const name = row && row.stock_name ? row.stock_name : code;
  const reason = row && row.reason ? row.reason : "";
  // 画像は自ドメイン経由。?v= でイベントごとにURLを変え、古い画像のキャッシュを避ける
  const ver = row && row.detected_at
    ? String(row.detected_at).replace(/\D/g, "").slice(0, 12)
    : "0";
  const image = row && row.chart_url
    ? `${origin}/card/${code}.png?v=${ver}`
    : `${origin}${FALLBACK_IMAGE}`;
  const title = `${name}（${code}）の急騰要因 | 株価急騰要因メモ`;
  const desc = reason
    ? `${reason}による急騰。チャート・強材料・関連銘柄の初動メモ。`
    : "急騰した銘柄の「なぜ上がったか」を初動で記録するメモサイト。";
  const target = `/#stock/${code}`;
  const canonical = `${origin}/stock/${code}`;

  // Xのクローラーにだけ、黒い帯を小さくするための短いタイトルを返す
  const isX = X_CRAWLER_UA.test(userAgent);
  const bare = isX && X_TITLE_MODE === "none";  // ⚠️カードが出なくなる（上のコメント参照）
  const cardTitle = isX && X_TITLE_MODE === "short" ? `${name}（${code}）` : title;

  const meta = bare
    ? `<meta property="og:type" content="article" />
<meta property="og:url" content="${canonical}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta name="twitter:image:alt" content="${escapeHtml(name)}の株価チャート" />`
    : `<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="株価急騰要因メモ" />
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
<meta name="twitter:image:alt" content="${escapeHtml(name)}の株価チャート" />`;

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="canonical" href="${canonical}" />
${meta}
<script>location.replace(${JSON.stringify(target)});</script>
<meta http-equiv="refresh" content="0;url=${target}" />
</head>
<body>
<p>移動中… <a href="${target}">開かない場合はこちら</a></p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // 最新イベントの反映を優先しつつクローラーの連打は吸収する
      "Cache-Control": "public, max-age=300",
      // UA でHTMLを出し分けるのでキャッシュを分ける
      Vary: "User-Agent",
    },
  });
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
