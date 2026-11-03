// Cloudflare Pages Advanced Worker
//
// /stock/{銘柄コード}       … その銘柄のチャート画像を og:image にしたカード用HTML
// /stock/{銘柄コード}/{日付} … 同上（Xのカードキャッシュ避けの日付付きURL）
// /card/{銘柄コード}.png     … Supabase 上のチャートPNGを自ドメイン経由で配信（カード画像）
//
// X(Twitter)のクローラーは上記HTMLを読んで「画像全体がリンクになるカード
// （summary_large_image）」を生成し、人間のブラウザは即座に SPA の銘柄詳細
// /#stock/{code} へリダイレクトされる。
// それ以外のリクエストはすべて静的アセット（従来のサイト）にそのまま流す。

const SUPABASE_URL = "https://byywhukxggelizpckbba.supabase.co";
// anon キー（site-config.js で公開済みの読み取り専用キーと同じもの）
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5eXdodWt4Z2dlbGl6cGNrYmJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjQ0NTAsImV4cCI6MjA5NDkwMDQ1MH0.Dg-rXPTzV2YrHS9-mCVBkUMTDWLAWKHxARwJ1rMaRw4";
const SUPABASE_TABLE = "surge_events";

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const card = url.pathname.match(/^\/card\/([0-9A-Za-z]{2,10})\.png$/);
    if (card) {
      return cardImage(card[1], url.origin, env);
    }

    const page = url.pathname.match(/^\/stock\/([0-9A-Za-z]{2,10})(?:\/(\d{6,8}))?\/?$/);
    if (page) {
      const ua = request.headers.get("user-agent") || "";
      return stockCardPage(page[1], url.origin, ua);
    }

    return env.ASSETS.fetch(request);
  },
};

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
