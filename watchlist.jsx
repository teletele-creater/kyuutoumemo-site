// ────────────────────────────────────────────────────────────
// ウォッチリスト — localStorage 保存 + React フック
// 保存形式: shodou_watchlist_v1 = [{ code, name, ... , added_at }]
// ────────────────────────────────────────────────────────────

const _WL_KEY = "shodou_watchlist_v1";
const _WL_EVENT = "shodou-watchlist-changed";

function _wlRead() {
  try {
    const raw = localStorage.getItem(_WL_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function _wlWrite(list) {
  try { localStorage.setItem(_WL_KEY, JSON.stringify(list)); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent(_WL_EVENT)); } catch (e) {}
}

// 保存するスナップショット（raw_post など重いフィールドは除外）
function _wlSnapshot(stock) {
  return {
    id:           stock.id || null,
    code:         String(stock.code || ""),
    name:         stock.name || stock.code || "",
    market:       stock.market || "東",
    reason:       stock.reason || stock.cat || "",
    cat:          stock.cat || stock.reason || "",
    themes:       (stock.themes || []).slice(0, 4),
    business:     stock.business || "",
    backgrounds:  Array.isArray(stock.backgrounds) ? stock.backgrounds : [],
    related_stocks: stock.related_stocks || "",
    chart_url:    stock.chart_url || null,
    detected_at:  stock.detected_at || null,
    time:         stock.time || "",
    surge_price:  stock.surge_price ?? stock.price ?? null,
    current_price: stock.current_price ?? null,
    pct:          null,
    price:        null,
    added_at:     new Date().toISOString(),
  };
}

function useWatchlist() {
  const [items, setItems] = React.useState(_wlRead);

  React.useEffect(() => {
    const sync = () => setItems(_wlRead());
    window.addEventListener(_WL_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(_WL_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const has = React.useCallback(
    (code) => items.some(x => x.code === String(code)),
    [items]
  );

  const toggle = React.useCallback((stock) => {
    const code = String(stock.code || "");
    if (!code) return;
    const list = _wlRead();
    const idx = list.findIndex(x => x.code === code);
    if (idx >= 0) list.splice(idx, 1);
    else list.unshift(_wlSnapshot(stock));
    _wlWrite(list);
  }, []);

  const remove = React.useCallback((code) => {
    _wlWrite(_wlRead().filter(x => x.code !== String(code)));
  }, []);

  return { items, has, toggle, remove };
}

// ────────────────────────────────────────────────────────────
// useWatchPrices — ウォッチ銘柄の現在株価を stock_prices から取得
// 戻り値: { [code]: { price, updated_at } }
// ────────────────────────────────────────────────────────────
function useWatchPrices(codes) {
  const [map, setMap] = React.useState({});
  const key = (codes || []).slice().sort().join(",");

  React.useEffect(() => {
    if (!key) { setMap({}); return; }
    const cfg = window.SITE_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
        const { data, error } = await sb
          .from("stock_prices")
          .select("stock_code, price, updated_at")
          .in("stock_code", key.split(","));
        if (cancelled || error || !data) return;
        const m = {};
        data.forEach(r => { m[String(r.stock_code)] = { price: r.price, updated_at: r.updated_at }; });
        setMap(m);
      } catch (e) {}
    })();
    return () => { cancelled = true; };
  }, [key]);

  return map;
}

Object.assign(window, { useWatchlist, useWatchPrices });
