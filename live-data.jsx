// ────────────────────────────────────────────────────────────
// Supabase からリアルタイムで急騰イベントを購読するフック
// 未設定の場合は data.jsx のサンプルにフォールバック
// ────────────────────────────────────────────────────────────

const _LiveCtx = React.createContext(null);

const _PRICE_TABLE = "stock_prices";

// JST(Asia/Tokyo)の YYYY-MM-DD を、端末のタイムゾーンに依存せず求める。
// （旧 `getTime() + (9*60 - getTimezoneOffset())*60000` は日本端末で +18h ずれていた）
const _JST_KEY_DTF = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
});
function _jstKey(iso) {
  try { return _JST_KEY_DTF.format(iso instanceof Date ? iso : new Date(iso)); }
  catch (e) { return null; }
}

function _isConfigured() {
  const c = window.SITE_CONFIG || {};
  return !!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY);
}

// stock_prices 行を { price, updated_at } のマップに正規化
async function _fetchPriceMap(sb) {
  try {
    const { data, error } = await sb
      .from(_PRICE_TABLE)
      .select("stock_code, price, updated_at");
    if (error) {
      console.warn("[live-data] stock_prices fetch error", error);
      return {};
    }
    const map = {};
    for (const p of data || []) {
      if (p && p.stock_code != null) {
        map[String(p.stock_code)] = {
          price:      p.price,
          updated_at: p.updated_at,
        };
      }
    }
    return map;
  } catch (e) {
    console.warn("[live-data] stock_prices fetch threw", e);
    return {};
  }
}

// マッピング済みの stock オブジェクトに価格マップから現在株価を差し込む
function _applyPrice(stock, priceMap) {
  const p = priceMap && stock.code != null ? priceMap[String(stock.code)] : null;
  if (!p) return stock;
  return {
    ...stock,
    current_price:            p.price ?? stock.current_price ?? null,
    current_price_updated_at: p.updated_at ?? stock.current_price_updated_at ?? null,
  };
}

// Supabase の surge_events 行を StockCard が扱える形に変換
function _mapRow(row) {
  let timeStr = "";
  try {
    const dt = new Date(row.detected_at);
    timeStr = dt.toLocaleTimeString("ja-JP", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo",
    });
  } catch (e) {}

  return {
    id:             row.id || row.tweet_id,
    code:           row.stock_code,
    name:           row.stock_name || row.stock_code,
    market:         "東",
    pct:            null,           // 上昇率は分析フローから渡されないため未設定
    price:          null,
    vol:            null,
    reason:         row.reason || "",
    cat:            row.reason || "",
    themes:         (row.keywords || []).slice(0, 4),
    keywords_all:   row.keywords || [],   // 検索用：チップ表示は4件までだが検索は全キーワード対象
    spark:          null,
    time:           timeStr,
    chart_url:      row.chart_url || null,
    detected_at:    row.detected_at,
    business:       row.business || "",
    backgrounds:    row.backgrounds || [],
    related_stocks: row.related_stocks || "",
    raw_post:       row.raw_post || "",
    surge_price:              row.surge_price ?? row.price_at_detection ?? null,
    current_price:            row.current_price ?? null,
    current_price_updated_at: row.current_price_updated_at ?? null,
    live:           true,           // ライブデータ印
  };
}

function LiveDataProvider({ children }) {
  const SAMPLE = window.SURGE_STOCKS || [];
  const [state, setState] = React.useState({
    status: _isConfigured() ? "connecting" : "fallback",
    stocks: _isConfigured() ? [] : SAMPLE,
    newIds: new Set(),
    error:  null,
    lastUpdate: null,
  });
  // 現在株価マップを ref で保持（Realtimeイベント受信時に参照するため）
  const priceMapRef = React.useRef({});

  React.useEffect(() => {
    if (!_isConfigured()) return;
    const cfg = window.SITE_CONFIG;
    const sb  = window.supabase && window.supabase.createClient
      ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
      : null;

    if (!sb) {
      console.warn("[live-data] supabase-js が読み込まれていません");
      setState(s => ({ ...s, status: "error", error: "supabase-js missing", stocks: SAMPLE }));
      return;
    }

    const table = cfg.SUPABASE_TABLE || "surge_events";
    let cancelled = false;
    const highlightTimers = [];

    // ── 初期データ取得（surge_events + stock_prices を並行） ──
    (async () => {
      const [eventsRes, priceMap] = await Promise.all([
        sb.from(table)
          .select("*")
          .order("detected_at", { ascending: false })
          .limit(40),
        _fetchPriceMap(sb),
      ]);
      if (cancelled) return;
      if (eventsRes.error) {
        console.error("[live-data] fetch error", eventsRes.error);
        setState(s => ({ ...s, status: "error", error: eventsRes.error.message, stocks: SAMPLE }));
        return;
      }
      priceMapRef.current = priceMap;
      const stocks = (eventsRes.data || [])
        .map(_mapRow)
        .map(s => _applyPrice(s, priceMap));
      setState({
        status: "live",
        stocks,
        newIds: new Set(),
        error: null,
        lastUpdate: new Date().toISOString(),
      });
    })();

    // ── surge_events Realtime購読 ──
    const channel = sb.channel("surge_events:insert")
      .on("postgres_changes",
          { event: "INSERT", schema: "public", table },
          payload => {
            const row = _applyPrice(_mapRow(payload.new), priceMapRef.current);
            setState(s => {
              if (s.stocks.find(x => x.id === row.id || x.code === row.code && x.time === row.time)) {
                return s;
              }
              const newIds = new Set(s.newIds);
              newIds.add(row.id);
              const t = setTimeout(() => {
                setState(prev => {
                  const ids = new Set(prev.newIds);
                  ids.delete(row.id);
                  return { ...prev, newIds: ids };
                });
              }, 6000);
              highlightTimers.push(t);
              return {
                ...s,
                stocks: [row, ...s.stocks].slice(0, 80),
                newIds,
                status: "live",
                lastUpdate: new Date().toISOString(),
              };
            });
          })
      .subscribe();

    // ── stock_prices Realtime購読（INSERT/UPDATE/DELETEをマージ） ──
    const priceChannel = sb.channel("stock_prices:changes")
      .on("postgres_changes",
          { event: "*", schema: "public", table: _PRICE_TABLE },
          payload => {
            const newRow = payload.new || payload.old;
            if (!newRow || newRow.stock_code == null) return;
            const code = String(newRow.stock_code);
            const next = { ...priceMapRef.current };
            if (payload.eventType === "DELETE") {
              delete next[code];
            } else {
              next[code] = { price: newRow.price, updated_at: newRow.updated_at };
            }
            priceMapRef.current = next;
            // 表示中の同じ stock_code の行に反映
            setState(s => ({
              ...s,
              stocks: s.stocks.map(x => x.code === code ? _applyPrice(x, next) : x),
            }));
          })
      .subscribe();

    return () => {
      cancelled = true;
      highlightTimers.forEach(clearTimeout);
      if (channel)      sb.removeChannel(channel);
      if (priceChannel) sb.removeChannel(priceChannel);
    };
  }, []);

  return <_LiveCtx.Provider value={state}>{children}</_LiveCtx.Provider>;
}

function useLiveData() {
  const ctx = React.useContext(_LiveCtx);
  if (!ctx) return {
    status: "fallback",
    stocks: window.SURGE_STOCKS || [],
    newIds: new Set(),
    error: null,
    lastUpdate: null,
  };
  return ctx;
}

// ────────────────────────────────────────────────────────────
// useArchive — 過去ログ全件を取りに行くフック（ページング対応）
// Supabase 未設定なら data.jsx のサンプル SAMPLE_ARCHIVE を返す
// ────────────────────────────────────────────────────────────
function useArchive({ pageSize = 60 } = {}) {
  const SAMPLE = window.SAMPLE_ARCHIVE || [];
  const [state, setState] = React.useState({
    status:  _isConfigured() ? "connecting" : "fallback",
    entries: _isConfigured() ? [] : SAMPLE,
    total:   _isConfigured() ? null : SAMPLE.length,
    hasMore: _isConfigured() ? true : false,
    loading: _isConfigured(),
    error:   null,
  });

  // Supabaseクライアントは1回だけ作る
  const sbRef = React.useRef(null);
  if (!sbRef.current && _isConfigured() && window.supabase && window.supabase.createClient) {
    const cfg = window.SITE_CONFIG;
    sbRef.current = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  // 現在株価マップを ref で保持
  const priceMapRef = React.useRef({});

  const fetchPage = React.useCallback(async (offset) => {
    if (!_isConfigured() || !sbRef.current) return;
    const cfg = window.SITE_CONFIG;
    const table = cfg.SUPABASE_TABLE || "surge_events";
    setState(s => ({ ...s, loading: true }));
    // 初回は surge_events + stock_prices を並行取得、以降はイベントのみ
    const [eventsRes, priceMap] = await Promise.all([
      sbRef.current
        .from(table)
        .select("*", { count: "exact" })
        .order("detected_at", { ascending: false })
        .range(offset, offset + pageSize - 1),
      offset === 0 ? _fetchPriceMap(sbRef.current) : Promise.resolve(priceMapRef.current),
    ]);
    const { data, count, error } = eventsRes;
    if (error) {
      setState(s => ({
        ...s,
        status: "error", error: error.message, loading: false,
        // フォールバックして見せる
        entries: s.entries.length === 0 ? SAMPLE : s.entries,
        total:   s.entries.length === 0 ? SAMPLE.length : s.total,
      }));
      return;
    }
    if (offset === 0) priceMapRef.current = priceMap;
    const effectivePriceMap = priceMapRef.current;
    const mapped = (data || []).map(_mapRow).map(s => _applyPrice(s, effectivePriceMap));
    setState(s => {
      const merged = offset === 0 ? mapped : [...s.entries, ...mapped];
      return {
        ...s,
        status: "live",
        entries: merged,
        total: count ?? merged.length,
        hasMore: (count ?? merged.length) > merged.length,
        loading: false,
        error: null,
      };
    });
  }, [pageSize]);

  // 初回ロード
  React.useEffect(() => {
    if (_isConfigured()) fetchPage(0);
  }, [fetchPage]);

  // Realtime購読 — 新着INSERTがアーカイブ先頭に追加される
  React.useEffect(() => {
    if (!_isConfigured() || !sbRef.current) return;
    const cfg = window.SITE_CONFIG;
    const table = cfg.SUPABASE_TABLE || "surge_events";
    const channel = sbRef.current.channel("archive:insert")
      .on("postgres_changes",
          { event: "INSERT", schema: "public", table },
          payload => {
            const row = _applyPrice(_mapRow(payload.new), priceMapRef.current);
            setState(s => {
              if (s.entries.find(e => e.id === row.id)) return s;
              return {
                ...s,
                entries: [row, ...s.entries],
                total: (s.total != null ? s.total : s.entries.length) + 1,
              };
            });
          })
      .subscribe();

    // stock_prices の変更も購読し、アーカイブ表示中の同一銘柄に反映
    const priceChannel = sbRef.current.channel("archive:prices")
      .on("postgres_changes",
          { event: "*", schema: "public", table: _PRICE_TABLE },
          payload => {
            const newRow = payload.new || payload.old;
            if (!newRow || newRow.stock_code == null) return;
            const code = String(newRow.stock_code);
            const next = { ...priceMapRef.current };
            if (payload.eventType === "DELETE") {
              delete next[code];
            } else {
              next[code] = { price: newRow.price, updated_at: newRow.updated_at };
            }
            priceMapRef.current = next;
            setState(s => ({
              ...s,
              entries: s.entries.map(e => e.code === code ? _applyPrice(e, next) : e),
            }));
          })
      .subscribe();

    return () => {
      if (!sbRef.current) return;
      sbRef.current.removeChannel(channel);
      sbRef.current.removeChannel(priceChannel);
    };
  }, []);

  const loadMore = React.useCallback(() => {
    if (state.loading || !state.hasMore) return;
    fetchPage(state.entries.length);
  }, [fetchPage, state.entries.length, state.hasMore, state.loading]);

  return { ...state, loadMore };
}

// ────────────────────────────────────────────────────────────
// useArchiveByDate — 指定日(JST, YYYY-MM-DD)の急騰イベントだけを取得
// dateKey が null/空 の場合は何もしない
// ────────────────────────────────────────────────────────────
function useArchiveByDate(dateKey) {
  const [state, setState] = React.useState({
    entries: [],
    loading: false,
    error:   null,
    status:  "idle",
  });

  const sbRef = React.useRef(null);
  if (!sbRef.current && _isConfigured() && window.supabase && window.supabase.createClient) {
    const cfg = window.SITE_CONFIG;
    sbRef.current = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  React.useEffect(() => {
    if (!dateKey) {
      setState({ entries: [], loading: false, error: null, status: "idle" });
      return;
    }

    // フォールバック: サンプルデータから当日分を抽出
    if (!_isConfigured() || !sbRef.current) {
      const SAMPLE = window.SAMPLE_ARCHIVE || [];
      const filtered = SAMPLE.filter(e => {
        if (!e.detected_at) return false;
        return _jstKey(e.detected_at) === dateKey;
      });
      setState({ entries: filtered, loading: false, error: null, status: "fallback" });
      return;
    }

    let cancelled = false;
    setState(s => ({ ...s, loading: true, status: "connecting" }));
    (async () => {
      const cfg   = window.SITE_CONFIG;
      const table = cfg.SUPABASE_TABLE || "surge_events";
      const start = `${dateKey}T00:00:00+09:00`;
      const end   = `${dateKey}T23:59:59.999+09:00`;
      const [eventsRes, priceMap] = await Promise.all([
        sbRef.current
          .from(table)
          .select("*")
          .gte("detected_at", start)
          .lte("detected_at", end)
          .order("detected_at", { ascending: false }),
        _fetchPriceMap(sbRef.current),
      ]);
      if (cancelled) return;
      if (eventsRes.error) {
        setState({ entries: [], loading: false, error: eventsRes.error.message, status: "error" });
        return;
      }
      const mapped = (eventsRes.data || [])
        .map(_mapRow)
        .map(s => _applyPrice(s, priceMap));
      setState({ entries: mapped, loading: false, error: null, status: "live" });
    })();
    return () => { cancelled = true; };
  }, [dateKey]);

  return state;
}

// ────────────────────────────────────────────────────────────
// useStockHistory — 同一銘柄コードの検知履歴を古い順に全件取得
// 「◯回目の登場」表示に使う。未設定なら SAMPLE_ARCHIVE から抽出
// ────────────────────────────────────────────────────────────
function useStockHistory(code) {
  const [state, setState] = React.useState({ entries: [], loading: false, error: null, status: "idle" });

  const sbRef = React.useRef(null);
  if (!sbRef.current && _isConfigured() && window.supabase && window.supabase.createClient) {
    const cfg = window.SITE_CONFIG;
    sbRef.current = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  React.useEffect(() => {
    if (!code) {
      setState({ entries: [], loading: false, error: null, status: "idle" });
      return;
    }

    // フォールバック: サンプルデータから同一コードを抽出
    if (!_isConfigured() || !sbRef.current) {
      const SAMPLE = window.SAMPLE_ARCHIVE || [];
      const entries = SAMPLE
        .filter(e => String(e.code) === String(code))
        .slice()
        .sort((a, b) => new Date(a.detected_at) - new Date(b.detected_at));
      setState({ entries, loading: false, error: null, status: "fallback" });
      return;
    }

    let cancelled = false;
    setState(s => ({ ...s, loading: true, status: "connecting" }));
    (async () => {
      const cfg   = window.SITE_CONFIG;
      const table = cfg.SUPABASE_TABLE || "surge_events";
      const { data, error } = await sbRef.current
        .from(table)
        .select("*")
        .eq("stock_code", code)
        .order("detected_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        setState({ entries: [], loading: false, error: error.message, status: "error" });
        return;
      }
      setState({ entries: (data || []).map(_mapRow), loading: false, error: null, status: "live" });
    })();
    return () => { cancelled = true; };
  }, [code]);

  return state;
}

// ────────────────────────────────────────────────────────────
// useThemeEntries — 指定テーマ（keywords）を含む検知を新しい順に取得
// テーマページ用。未設定ならサンプルから抽出
// ────────────────────────────────────────────────────────────
function useThemeEntries(theme) {
  const [state, setState] = React.useState({ entries: [], loading: true, error: null, status: "idle" });

  const sbRef = React.useRef(null);
  if (!sbRef.current && _isConfigured() && window.supabase && window.supabase.createClient) {
    const cfg = window.SITE_CONFIG;
    sbRef.current = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  React.useEffect(() => {
    if (!theme) {
      setState({ entries: [], loading: false, error: null, status: "idle" });
      return;
    }
    const t = String(theme).trim();
    const _norm = x => String(x).trim();

    // フォールバック: サンプル（本日分 + アーカイブ）から抽出
    if (!_isConfigured() || !sbRef.current) {
      const seen = new Set();
      const pool = [];
      const today = (typeof SURGE_STOCKS !== "undefined" ? SURGE_STOCKS : (window.SURGE_STOCKS || []));
      [...today, ...(window.SAMPLE_ARCHIVE || [])].forEach(e => {
        const k = e.id != null ? "i" + e.id : String(e.code) + "|" + (e.detected_at || "");
        if (seen.has(k)) return;
        seen.add(k);
        if ((e.themes || []).map(_norm).includes(t)) pool.push(e);
      });
      pool.sort((a, b) => new Date(b.detected_at || Date.now()) - new Date(a.detected_at || Date.now()));
      setState({ entries: pool, loading: false, error: null, status: "fallback" });
      return;
    }

    let cancelled = false;
    setState({ entries: [], loading: true, error: null, status: "connecting" });
    (async () => {
      const cfg   = window.SITE_CONFIG;
      const table = cfg.SUPABASE_TABLE || "surge_events";
      const [res, priceMap] = await Promise.all([
        sbRef.current.from(table).select("*")
          .contains("keywords", [t])
          .order("detected_at", { ascending: false })
          .limit(300),
        _fetchPriceMap(sbRef.current),
      ]);
      if (cancelled) return;
      let rows = res.data;
      // keywords の型によって contains が使えない場合は直近を取ってクライアント側で絞り込む
      if (res.error) {
        const alt = await sbRef.current.from(table).select("*")
          .order("detected_at", { ascending: false }).limit(400);
        if (cancelled) return;
        if (alt.error) {
          setState({ entries: [], loading: false, error: alt.error.message, status: "error" });
          return;
        }
        rows = (alt.data || []).filter(r => ((r.keywords || [])).map(_norm).includes(t));
      }
      setState({
        entries: (rows || []).map(_mapRow).map(s => _applyPrice(s, priceMap)),
        loading: false, error: null, status: "live",
      });
    })();
    return () => { cancelled = true; };
  }, [theme]);

  return state;
}

// ────────────────────────────────────────────────────────────
// useRecentEntries — 直近 N 日の検知を現在価格付きで取得（ランキング用）
// 未設定ならサンプル（本日分 + アーカイブ）を返す
// ────────────────────────────────────────────────────────────
function useRecentEntries(days = 31) {
  const [state, setState] = React.useState({ entries: [], loading: true, status: "idle" });

  const sbRef = React.useRef(null);
  if (!sbRef.current && _isConfigured() && window.supabase && window.supabase.createClient) {
    const cfg = window.SITE_CONFIG;
    sbRef.current = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  React.useEffect(() => {
    if (!_isConfigured() || !sbRef.current) {
      const seen = new Set();
      const pool = [];
      const today = (typeof SURGE_STOCKS !== "undefined" ? SURGE_STOCKS : (window.SURGE_STOCKS || []));
      [...today, ...(window.SAMPLE_ARCHIVE || [])].forEach(e => {
        const k = e.id != null ? "i" + e.id : String(e.code) + "|" + (e.detected_at || "");
        if (seen.has(k)) return;
        seen.add(k);
        pool.push(e);
      });
      setState({ entries: pool, loading: false, status: "fallback" });
      return;
    }
    let cancelled = false;
    setState(s => ({ ...s, loading: true, status: "connecting" }));
    (async () => {
      const cfg   = window.SITE_CONFIG;
      const table = cfg.SUPABASE_TABLE || "surge_events";
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const [res, priceMap] = await Promise.all([
        sbRef.current.from(table).select("*")
          .gte("detected_at", since)
          .order("detected_at", { ascending: false })
          .limit(500),
        _fetchPriceMap(sbRef.current),
      ]);
      if (cancelled) return;
      if (res.error) {
        setState({ entries: [], loading: false, status: "error" });
        return;
      }
      setState({
        entries: (res.data || []).map(_mapRow).map(s => _applyPrice(s, priceMap)),
        loading: false, status: "live",
      });
    })();
    return () => { cancelled = true; };
  }, [days]);

  return state;
}

// ────────────────────────────────────────────────────────────
// useDateCounts — 指定月(JST)の急騰検知件数を日付ごとに集計
// 戻り値: { "YYYY-MM-DD": number } のマップ
// ────────────────────────────────────────────────────────────
function useDateCounts(year, month /* 0-indexed */) {
  const [counts, setCounts] = React.useState({});

  const sbRef = React.useRef(null);
  if (!sbRef.current && _isConfigured() && window.supabase && window.supabase.createClient) {
    const cfg = window.SITE_CONFIG;
    sbRef.current = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  }

  React.useEffect(() => {
    if (year == null || month == null) { setCounts({}); return; }

    // JST date key を作るヘルパー（端末TZに依存しない）
    const toJstKey = (iso) => _jstKey(iso);

    // フォールバック: SAMPLE_ARCHIVE から月単位で集計
    if (!_isConfigured() || !sbRef.current) {
      const SAMPLE = window.SAMPLE_ARCHIVE || [];
      const map = {};
      SAMPLE.forEach(e => {
        const k = toJstKey(e.detected_at);
        if (!k) return;
        const [ky, km] = k.split("-").map(Number);
        if (ky === year && km - 1 === month) map[k] = (map[k] || 0) + 1;
      });
      setCounts(map);
      return;
    }

    let cancelled = false;
    (async () => {
      const cfg   = window.SITE_CONFIG;
      const table = cfg.SUPABASE_TABLE || "surge_events";
      // JST月初〜翌月初の境界を ISO で構築
      const pad = n => String(n).padStart(2, "0");
      const start = `${year}-${pad(month + 1)}-01T00:00:00+09:00`;
      const ny = month === 11 ? year + 1 : year;
      const nm = month === 11 ? 0 : month + 1;
      const end = `${ny}-${pad(nm + 1)}-01T00:00:00+09:00`;

      const { data, error } = await sbRef.current
        .from(table)
        .select("detected_at")
        .gte("detected_at", start)
        .lt("detected_at", end);
      if (cancelled) return;
      if (error) {
        console.warn("[useDateCounts] error", error);
        setCounts({});
        return;
      }
      const map = {};
      (data || []).forEach(row => {
        const k = toJstKey(row.detected_at);
        if (k) map[k] = (map[k] || 0) + 1;
      });
      setCounts(map);
    })();
    return () => { cancelled = true; };
  }, [year, month]);

  return counts;
}

// ────────────────────────────────────────────────────────────
// fetchStockByCode — 銘柄コードで最新の検知イベントを1件取得
// ディープリンク（/#stock/1234）で live.stocks に無い古い銘柄を開くのに使う
// ────────────────────────────────────────────────────────────
async function fetchStockByCode(code) {
  if (!code) return null;
  if (!_isConfigured() || !window.supabase || !window.supabase.createClient) {
    const SAMPLE = [...(window.SURGE_STOCKS || []), ...(window.SAMPLE_ARCHIVE || [])];
    return SAMPLE.find(s => String(s.code) === String(code)) || null;
  }
  const cfg   = window.SITE_CONFIG;
  const sb    = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const table = cfg.SUPABASE_TABLE || "surge_events";
  const { data, error } = await sb
    .from(table)
    .select("*")
    .eq("stock_code", String(code))
    .order("detected_at", { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return null;
  const priceMap = await _fetchPriceMap(sb);
  return _applyPrice(_mapRow(data[0]), priceMap);
}

Object.assign(window, { LiveDataProvider, useLiveData, useArchive, useArchiveByDate, useDateCounts, useStockHistory, useThemeEntries, useRecentEntries, fetchStockByCode });
