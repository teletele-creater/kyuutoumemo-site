// ────────────────────────────────────────────────────────────
// 押し目シグナル — ウォッチリスト銘柄の日足からクライアント側で判定
//
// ルール（日足ベース・大引けデータで判定）:
//   前提   急騰検知後、高値が25日線から +8% 以上乖離したら「監視開始」
//   押し目① 日足の安値が 25日線×1.005 以下にタッチ
//   押し目② ①の後、安値が 75日線×1.005 以下にタッチ
//   終了   終値が 75日線×0.95 を割ったら「調整入り」でシナリオ終了
//
// データ源: stock_ohlc(Supabase) → Yahoo Finance フォールバック。
// real-chart.jsx と同じ localStorage キャッシュ(rc-ohlc-v2:)を共有。
// 通知はサイト内のみ: ウォッチタブのバッジ + ウォッチリスト先頭の一覧。
// 既読管理: shodou_dip_seen_v1 (localStorage)
//
// デモ: URL に ?dipdemo を付けると合成データで表示を確認できる
// ────────────────────────────────────────────────────────────

const _DIP_SEEN_KEY   = "shodou_dip_seen_v1";
const _DIP_EVENT      = "shodou-dip-changed";
const _DIP_WL_KEY     = "shodou_watchlist_v1";
const _DIP_CACHE_PREF = "rc-ohlc-v2:";        // real-chart と共有
const _DIP_CACHE_TTL  = 15 * 60 * 1000;
const _DIP_ARM        = 1.08;   // 25日線から+8%乖離で監視開始
const _DIP_TOUCH      = 1.005;  // タッチ判定の遊び +0.5%
const _DIP_BREAK      = 0.95;   // 75日線-5%割れでシナリオ終了
const _DIP_NEAR_PCT   = 3.0;    // 「あと◯%」表示のしきい値
const _DIP_ALERT_DAYS = 14;     // 通知一覧に出す期間
const _DIP_MAX_CODES  = 20;     // 判定対象の上限
const _DIP_DEMO       = /[?&#]dipdemo/.test(location.search + location.hash);

// ---- 小物 ----
const _dipMdFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" });
const _dipYmdFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
function _dipMd(t)  { try { return _dipMdFmt.format(new Date(t)); } catch (e) { return ""; } }
function _dipYmd(t) { try { return _dipYmdFmt.format(new Date(t)); } catch (e) { return ""; } }

function _dipCacheGet(key) {
  try {
    const raw = localStorage.getItem(_DIP_CACHE_PREF + key);
    if (!raw) return null;
    const { t, bars } = JSON.parse(raw);
    if (Date.now() - t > _DIP_CACHE_TTL) return null;
    return bars;
  } catch (e) { return null; }
}
function _dipCacheSet(key, bars) {
  try { localStorage.setItem(_DIP_CACHE_PREF + key, JSON.stringify({ t: Date.now(), bars })); } catch (e) {}
}

function _dipSeenRead() {
  try { const o = JSON.parse(localStorage.getItem(_DIP_SEEN_KEY) || "{}"); return o && typeof o === "object" ? o : {}; }
  catch (e) { return {}; }
}
function _dipSeenWrite(o) { try { localStorage.setItem(_DIP_SEEN_KEY, JSON.stringify(o)); } catch (e) {} }

// ---- 日足取得（Supabase → Yahoo）----
async function _dipFetchBarsBatch(codes) {
  const out = {};
  const missing = [];
  for (const c of codes) {
    const hit = _dipCacheGet(c + ":D");
    if (hit) out[c] = hit; else missing.push(c);
  }
  if (!missing.length) return out;

  // 1) Supabase stock_ohlc をまとめて1リクエスト
  try {
    const cfg = window.SITE_CONFIG || {};
    if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
      const u = `${cfg.SUPABASE_URL}/rest/v1/stock_ohlc` +
        `?code=in.(${missing.map(encodeURIComponent).join(",")})&interval=eq.D&select=code,bars`;
      const res = await fetch(u, {
        headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY },
      });
      if (res.ok) {
        for (const row of await res.json()) {
          const raw = row && row.bars;
          if (Array.isArray(raw) && raw.length >= 5) {
            const bars = raw.map(a => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] || 0 }));
            out[row.code] = bars;
            _dipCacheSet(row.code + ":D", bars);
          }
        }
      }
    }
  } catch (e) {}

  // 2) Yahoo フォールバック（残りのみ・最大6銘柄）
  const still = missing.filter(c => !out[c]).slice(0, 6);
  for (const code of still) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.T?range=1y&interval=1d`;
    const attempts = [url,
      "https://corsproxy.io/?url=" + encodeURIComponent(url),
      "https://api.allorigins.win/raw?url=" + encodeURIComponent(url)];
    for (const u of attempts) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 12000);
        const res = await fetch(u, { signal: ctl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const j = await res.json();
        const r = j && j.chart && j.chart.result && j.chart.result[0];
        const q = r && r.indicators && r.indicators.quote && r.indicators.quote[0];
        if (!r || !q || !r.timestamp) continue;
        const bars = [];
        for (let i = 0; i < r.timestamp.length; i++) {
          const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
          if ([o, h, l, c].some(v => v == null || v !== v)) continue;
          bars.push({ t: r.timestamp[i] * 1000, o, h, l, c, v: (q.volume && q.volume[i]) || 0 });
        }
        if (bars.length >= 25) { out[code] = bars; _dipCacheSet(code + ":D", bars); break; }
      } catch (e) {}
    }
  }
  return out;
}

// ---- 現在株価（stock_prices まとめて1リクエスト）----
async function _dipFetchPrices(codes) {
  try {
    const cfg = window.SITE_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !codes.length) return {};
    const u = `${cfg.SUPABASE_URL}/rest/v1/stock_prices` +
      `?stock_code=in.(${codes.map(encodeURIComponent).join(",")})&select=stock_code,price`;
    const res = await fetch(u, {
      headers: { apikey: cfg.SUPABASE_ANON_KEY, Authorization: "Bearer " + cfg.SUPABASE_ANON_KEY },
    });
    if (!res.ok) return {};
    const m = {};
    for (const r of await res.json()) if (r.price != null) m[String(r.stock_code)] = Number(r.price);
    return m;
  } catch (e) { return {}; }
}

// ---- 判定本体 ----
// bars: [{t,o,h,l,c}] 昇順日足 / detectedAtIso: 急騰検知日時 / currentPrice: 現在値(無ければ最終終値)
function computeDipSignal(bars, detectedAtIso, currentPrice) {
  if (!Array.isArray(bars) || bars.length < 25) return null;

  const closes = bars.map(b => b.c);
  const sum = [0];
  for (let i = 0; i < closes.length; i++) sum.push(sum[i] + closes[i]);
  const ma = (i, n) => (i >= n - 1 ? (sum[i + 1] - sum[i + 1 - n]) / n : null);

  let startIdx = Math.max(0, bars.length - 60);
  if (detectedAtIso) {
    const ts = new Date(detectedAtIso).getTime() - 12 * 3600 * 1000;
    if (ts === ts) {
      const idx = bars.findIndex(b => b.t >= ts);
      if (idx >= 0) startIdx = idx;
    }
  }

  let armed = false, armedAt = null;
  let armedStrong = false, armedStrongAt = null;  // 25日線・75日線の両方から+8%乖離（アーカイブ用の厳しめ判定）
  let stage = 0, dip1At = null, dip2At = null;
  let ended = false, endedAt = null;

  for (let i = startIdx; i < bars.length; i++) {
    const m25 = ma(i, 25), m75 = ma(i, 75);
    if (m25 == null) continue;
    // 25日線・75日線の両方を+8%上抜けた瞬間があれば「本物の上昇局面」とみなす（既存の armed とは独立）
    if (!armedStrong && m75 != null && bars[i].h >= m25 * _DIP_ARM && bars[i].h >= m75 * _DIP_ARM) {
      armedStrong = true; armedStrongAt = bars[i].t;
    }
    if (!armed) {
      if (bars[i].h >= m25 * _DIP_ARM) { armed = true; armedAt = bars[i].t; }
      continue;
    }
    if (stage < 1 && bars[i].l <= m25 * _DIP_TOUCH) { stage = 1; dip1At = bars[i].t; }
    if (stage >= 1 && stage < 2 && m75 != null && bars[i].l <= m75 * _DIP_TOUCH) { stage = 2; dip2At = bars[i].t; }
    if (m75 != null && bars[i].c < m75 * _DIP_BREAK) { ended = true; endedAt = bars[i].t; break; }
  }

  const last = bars.length - 1;
  const ma25 = ma(last, 25), ma75 = ma(last, 75);
  const cur = currentPrice != null ? Number(currentPrice) : closes[last];
  const dist = (m) => (m != null && cur > 0 ? ((cur - m) / m) * 100 : null);

  return {
    armed, armedAt, armedStrong, armedStrongAt, stage, dip1At, dip2At, ended, endedAt,
    ma25: ma25 != null ? Math.round(ma25 * 10) / 10 : null,
    ma75: ma75 != null ? Math.round(ma75 * 10) / 10 : null,
    distMa25: dist(ma25), distMa75: dist(ma75),
    lastBarT: bars[last].t,
  };
}

// ---- シグナル → 通知一覧 ----
function _dipBuildAlerts(items, signals) {
  const cutoff = Date.now() - _DIP_ALERT_DAYS * 86400 * 1000;
  const alerts = [];
  for (const it of items) {
    const s = signals[it.code];
    if (!s) continue;
    if (s.dip1At && s.dip1At >= cutoff)
      alerts.push({ key: `${it.code}:d1:${_dipYmd(s.dip1At)}`, code: it.code, name: it.name, stage: 1, t: s.dip1At, item: it });
    if (s.dip2At && s.dip2At >= cutoff)
      alerts.push({ key: `${it.code}:d2:${_dipYmd(s.dip2At)}`, code: it.code, name: it.name, stage: 2, t: s.dip2At, item: it });
  }
  alerts.sort((a, b) => b.t - a.t);
  return alerts;
}

// ---- デモデータ（?dipdemo）----
function _dipDemoState() {
  const d = (n) => Date.now() - n * 86400 * 1000;
  const items = [
    { code: "6920", name: "レーザーテック", market: "東", reason: "半導体検査装置の受注観測で急騰", detected_at: new Date(d(38)).toISOString(), surge_price: 31200, current_price: 34350, added_at: new Date(d(38)).toISOString(), themes: ["半導体"] },
    { code: "4935", name: "リベルタ", market: "東", reason: "猛暑対策商品の販売好調観測", detected_at: new Date(d(55)).toISOString(), surge_price: 1180, current_price: 1032, added_at: new Date(d(55)).toISOString(), themes: ["猛暑"] },
    { code: "7203", name: "トヨタ自動車", market: "東", reason: "決算上方修正で買い優勢", detected_at: new Date(d(20)).toISOString(), surge_price: 2890, current_price: 3310, added_at: new Date(d(20)).toISOString(), themes: ["決算"] },
  ];
  const signals = {
    "6920": { armed: true, stage: 1, dip1At: d(2), dip2At: null, ended: false, ma25: 34120, ma75: 30840, distMa25: 0.7, distMa75: 11.4, lastBarT: d(0) },
    "4935": { armed: true, stage: 2, dip1At: d(11), dip2At: d(1), ended: false, ma25: 1098, ma75: 1041, distMa25: -6.0, distMa75: -0.9, lastBarT: d(0) },
    "7203": { armed: true, stage: 0, dip1At: null, dip2At: null, ended: false, ma25: 3245, ma75: 3010, distMa25: 2.0, distMa75: 10.0, lastBarT: d(0) },
  };
  return { status: "ready", signals, alerts: _dipBuildAlerts(items, signals), demoItems: items, updatedAt: Date.now() };
}

// ---- エンジン（シングルトン）----
const DipSignals = {
  demo: _DIP_DEMO,
  state: _DIP_DEMO ? _dipDemoState() : { status: "idle", signals: {}, alerts: [], updatedAt: null },
  _demoSeen: {},
  _running: false,

  _emit() { try { window.dispatchEvent(new CustomEvent(_DIP_EVENT)); } catch (e) {} },

  _watchItems() {
    try { const l = JSON.parse(localStorage.getItem(_DIP_WL_KEY) || "[]"); return Array.isArray(l) ? l : []; }
    catch (e) { return []; }
  },

  async refresh(force) {
    if (this.demo) { this._emit(); return; }
    if (this._running) return;
    if (!force && this.state.updatedAt && Date.now() - this.state.updatedAt < 5 * 60 * 1000) return;
    const items = this._watchItems().slice(0, _DIP_MAX_CODES).filter(x => x.code);
    if (!items.length) {
      this.state = { status: "ready", signals: {}, alerts: [], updatedAt: Date.now() };
      this._emit(); return;
    }
    this._running = true;
    this.state = { ...this.state, status: "loading" };
    this._emit();
    try {
      const codes = items.map(x => String(x.code));
      const [barsMap, priceMap] = await Promise.all([_dipFetchBarsBatch(codes), _dipFetchPrices(codes)]);
      const signals = {};
      for (const it of items) {
        const bars = barsMap[it.code];
        if (!bars) continue;
        const sig = computeDipSignal(bars, it.detected_at, priceMap[it.code] ?? it.current_price ?? null);
        if (sig) signals[it.code] = sig;
      }
      this.state = { status: "ready", signals, alerts: _dipBuildAlerts(items, signals), updatedAt: Date.now() };
    } catch (e) {
      this.state = { ...this.state, status: "ready", updatedAt: Date.now() };
    }
    this._running = false;
    this._emit();
  },

  isSeen(key) { return this.demo ? !!this._demoSeen[key] : !!_dipSeenRead()[key]; },
  unseen() { return this.state.alerts.filter(a => !this.isSeen(a.key)); },

  markSeen(keys) {
    if (!keys || !keys.length) return;
    if (this.demo) { keys.forEach(k => { this._demoSeen[k] = 1; }); this._emit(); return; }
    const o = _dipSeenRead();
    const now = Date.now();
    keys.forEach(k => { o[k] = now; });
    // 古い既読キー(60日超)は掃除
    for (const k of Object.keys(o)) if (now - o[k] > 60 * 86400 * 1000) delete o[k];
    _dipSeenWrite(o);
    this._emit();
  },
};

// ---- React フック ----
function useDipSignals() {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    const f = () => force();
    window.addEventListener(_DIP_EVENT, f);
    return () => window.removeEventListener(_DIP_EVENT, f);
  }, []);
  return DipSignals;
}
function useDipUnseen() {
  const dip = useDipSignals();
  return dip.state.status === "ready" || dip.demo ? dip.unseen().length : 0;
}

// ---- UI: タブ用バッジ ----
function DipBadge({ style }) {
  const n = useDipUnseen();
  if (!n) return null;
  return (
    <span style={{
      position: "absolute", top: -4, right: -9,
      minWidth: 14, height: 14, padding: "0 3px",
      borderRadius: 7, background: "var(--gold, #B08D3E)",
      color: "#fff", fontSize: 9, fontWeight: 700, lineHeight: "14px",
      textAlign: "center", fontFamily: "inherit",
      ...style,
    }}>{n > 9 ? "9+" : n}</span>
  );
}

// ---- UI: ウォッチリスト先頭の通知一覧 ----
function DipAlertsSection({ navigate }) {
  const dip = useDipSignals();
  const alerts = dip.state.alerts;
  // このマウント時点の未読を NEW 表示に固定し、表示と同時に既読化
  const [newKeys] = React.useState(() => new Set(dip.unseen().map(a => a.key)));
  React.useEffect(() => { dip.refresh(); }, []);
  React.useEffect(() => {
    const un = dip.unseen().map(a => a.key);
    if (un.length) {
      un.forEach(k => newKeys.add(k));
      dip.markSeen(un);
    }
  }, [dip.state.updatedAt]);

  if (!alerts.length && dip.state.status !== "loading") return null;

  return (
    <div style={{ background: "var(--surface)", borderTop: "1px solid var(--hairline)", borderBottom: "1px solid var(--hairline)", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "10px 14px 6px" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)", letterSpacing: "0.02em" }}>押し目シグナル</span>
        <span className="mono" style={{ fontSize: 9, letterSpacing: "0.08em", color: "var(--muted-2)" }}>直近{_DIP_ALERT_DAYS}日 · 日足判定</span>
        {dip.state.status === "loading" && <span className="mono" style={{ fontSize: 9, color: "var(--muted-2)", marginLeft: "auto" }}>判定中…</span>}
      </div>

      {alerts.map(a => {
        const isNew = newKeys.has(a.key);
        return (
          <div
            key={a.key}
            onClick={() => navigate && navigate("stock", { ...a.item, code: a.code, name: a.name })}
            className="tappable"
            role="button" tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") navigate && navigate("stock", { ...a.item, code: a.code, name: a.name }); }}
            style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "8px 14px", cursor: "pointer",
              borderTop: "1px solid var(--hairline)",
              background: isNew ? "color-mix(in srgb, var(--gold, #B08D3E) 6%, var(--surface))" : "transparent",
            }}
          >
            <span className="mono" style={{
              flexShrink: 0, width: 18, height: 18, borderRadius: 9,
              border: "1px solid var(--gold, #B08D3E)", color: "var(--gold, #B08D3E)",
              fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
            }}>{a.stage === 2 ? "②" : "①"}</span>
            <span className="mono" style={{ flexShrink: 0, fontSize: 10.5, color: "var(--muted)", border: "1px solid var(--hairline-strong)", padding: "0 5px" }}>{a.code}</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{a.name}</span>
            <span style={{ fontSize: 11, color: "var(--ink-soft)", flexShrink: 0 }}>{a.stage === 2 ? "75日線タッチ" : "25日線タッチ"}</span>
            <span className="mono" style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10, color: "var(--muted-2)" }}>{_dipMd(a.t)}</span>
            {isNew && (
              <span className="mono" style={{
                flexShrink: 0, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.08em",
                background: "var(--gold, #B08D3E)", color: "#fff", padding: "1.5px 5px",
              }}>NEW</span>
            )}
          </div>
        );
      })}

      <div style={{ padding: "7px 14px 9px", fontSize: 9.5, lineHeight: 1.6, color: "var(--muted-2)", borderTop: "1px solid var(--hairline)" }}>
        判定: 急騰後に25日線から+8%以上乖離した銘柄が対象。日足の安値が25日線に到達で①、75日線で②（±0.5%の遊び）。大引けデータによる参考情報であり売買推奨ではありません。
      </div>
    </div>
  );
}

// ---- UI: ウォッチ行のシグナルチップ ----
function DipChips({ sig }) {
  if (!sig || (!sig.armed && !sig.stage)) return null;

  const chips = [];
  const base = {
    display: "inline-flex", alignItems: "center", gap: 4,
    fontSize: 9.5, padding: "2px 6px",
    border: "1px solid var(--hairline-strong)", background: "var(--surface-sub)",
    color: "var(--muted)", whiteSpace: "nowrap",
  };
  const gold = { ...base, border: "1px solid var(--gold, #B08D3E)", color: "var(--gold, #B08D3E)", fontWeight: 600 };

  if (sig.ended) {
    chips.push(<span key="end" className="mono" style={base}>調整入り · 75日線割れ {_dipMd(sig.endedAt)}</span>);
  } else {
    if (sig.stage >= 1) chips.push(<span key="d1" className="mono" style={gold}>押し目① 25日線 {_dipMd(sig.dip1At)}</span>);
    if (sig.stage >= 2) chips.push(<span key="d2" className="mono" style={gold}>押し目② 75日線 {_dipMd(sig.dip2At)}</span>);

    // 次のラインへの距離
    const nextLabel = sig.stage === 0 ? "25日線" : sig.stage === 1 ? "75日線" : null;
    const nextDist  = sig.stage === 0 ? sig.distMa25 : sig.stage === 1 ? sig.distMa75 : null;
    if (nextLabel && nextDist != null) {
      if (nextDist <= 0.5) {
        chips.push(<span key="near" className="mono" style={gold}>{nextLabel}タッチ圏</span>);
      } else if (nextDist <= _DIP_NEAR_PCT) {
        chips.push(<span key="near" className="mono" style={gold}>{nextLabel}まで {nextDist.toFixed(1)}%</span>);
      } else {
        chips.push(<span key="far" className="mono" style={base}>{nextLabel}乖離 +{nextDist.toFixed(1)}%</span>);
      }
    }
  }

  if (!chips.length) return null;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>{chips}</div>;
}

// ---- 自己テスト（開発用）: window.__dipSelfTest() ----
function __dipSelfTest() {
  const mk = (n, price) => ({ t: Date.UTC(2026, 0, 1) + n * 86400 * 1000, o: price, h: price * 1.01, l: price * 0.99, c: price, v: 1000 });
  // 90本: 30本横ばい1000 → 急騰1300 → 25MAへ押し → 75MAへ押し
  const bars = [];
  for (let i = 0; i < 80; i++) bars.push(mk(i, 1000));
  for (let i = 80; i < 86; i++) bars.push(mk(i, 1000 + (i - 79) * 60));    // 急騰 → 1360
  for (let i = 86; i < 92; i++) bars.push(mk(i, 1360 - (i - 85) * 45));    // 押し① 25MA付近へ
  for (let i = 92; i < 97; i++) bars.push(mk(i, 1090 - (i - 91) * 15));    // 押し② 75MA付近へ
  const sig = computeDipSignal(bars, new Date(bars[80].t).toISOString(), 1015);
  const armedOnly = computeDipSignal(bars.slice(0, 86), new Date(bars[80].t).toISOString(), 1360);
  return {
    full:  { armed: sig.armed, stage: sig.stage, ended: sig.ended, distMa25: sig.distMa25 && sig.distMa25.toFixed(1), distMa75: sig.distMa75 && sig.distMa75.toFixed(1) },
    armedOnly: { armed: armedOnly.armed, stage: armedOnly.stage },
    pass: sig.armed && sig.stage === 2 && !sig.ended && armedOnly.armed && armedOnly.stage === 0,
  };
}

// ---- 押し目付近フィルタ（アーカイブ絞り込み用）----
// 「急騰検知した“その急騰”の押し目」だけを拾うための判定。既存フィールドのみ使用し、
// ウォッチ一覧/週次レポートの挙動は変えない（アーカイブのフィルタ専用）。
//   ・armedStrong  急騰後に高値が 25日線・75日線の両方から +8% 以上乖離（＝本物の上昇局面を作った）
//                  ※上昇トレンドを作れていない一時的な戻り（25日線だけ上抜け）はここで除外
//   ・!ended       終値で75日線を割る「調整入り」でシナリオ終了していない
//                  （computeDipSignal は最初の調整入りで打ち切るため、
//                    “一度押し目が終わった後にまた来た押し目”はこの時点で除外される）
//   ・押し目ゾーン  現在値が 25日線 or 75日線の±3%以内にある（線をわずかに割った状態も含む）
//                  ＝下に大きく割れた/上に伸びたままの銘柄は対象外
const _DIP_ZONE_PCT = _DIP_NEAR_PCT;     // 25/75日線から±3%以内を「押し目付近」とみなす（上下対称）
function _dipInZone(d) { return d != null && Math.abs(d) <= _DIP_ZONE_PCT; }
function dipZoneMatch(sig) {
  if (!sig || !sig.armedStrong || sig.ended) return false;
  return _dipInZone(sig.distMa25) || _dipInZone(sig.distMa75);
}

// ---- アーカイブ用: 任意銘柄の「押し目付近」スキャン ----
// items: [{code, detected_at, current_price}] を渡すと日足から distMa25/75 を計算し byCode に格納。
// ウォッチリストとは独立して動き、計算済みはメモリに保持して未計算のコードのみ取得する。
const _ADS_EVENT = "shodou-archdip-changed";
const _ADS_MAX   = 400; // スキャン対象のユニーク銘柄上限（アーカイブ全件カバー用）
const _ADS_CHUNK = 60;  // 1回の取得リクエストにまとめる銘柄数
const ArchiveDipScan = {
  byCode: {},        // code -> sig | null（判定不能）
  status: "idle",    // idle | loading | ready
  _running: false,
  _pending: null,    // 走査中に来た再依頼（後から読み込まれたページを取りこぼさない）

  _emit() { try { window.dispatchEvent(new CustomEvent(_ADS_EVENT)); } catch (e) {} },

  async scan(items) {
    const uniq = [], seen = new Set();
    for (const it of (items || [])) {
      const c = it && it.code != null ? String(it.code) : "";
      if (!c || seen.has(c)) continue;
      seen.add(c); uniq.push({ code: c, detected_at: it.detected_at, current_price: it.current_price });
      if (uniq.length >= _ADS_MAX) break;
    }
    const missing = uniq.filter(it => !(it.code in this.byCode));
    if (!missing.length) {
      if (!this._running) { this.status = "ready"; this._emit(); }
      return;
    }
    // 走査中なら最新の依頼を保留し、完了後に再走査（握りつぶさない）
    if (this._running) { this._pending = items; return; }
    this._running = true;
    this.status = "loading"; this._emit();
    try {
      // チャンク単位で取得・判定し、都度反映（件数が多くても順次結果が見える）
      for (let i = 0; i < missing.length; i += _ADS_CHUNK) {
        const part  = missing.slice(i, i + _ADS_CHUNK);
        const codes = part.map(it => it.code);
        const [barsMap, priceMap] = await Promise.all([_dipFetchBarsBatch(codes), _dipFetchPrices(codes)]);
        for (const it of part) {
          const bars = barsMap[it.code];
          const sig = bars ? computeDipSignal(bars, it.detected_at, priceMap[it.code] ?? it.current_price ?? null) : null;
          this.byCode[it.code] = sig || null;
        }
        if (i + _ADS_CHUNK < missing.length) this._emit();
      }
      this.status = "ready";
    } catch (e) {
      this.status = "ready";
    }
    this._running = false;
    this._emit();
    // 走査中に新しい依頼が来ていたら続けて処理
    if (this._pending) { const p = this._pending; this._pending = null; this.scan(p); }
  },
};

function useArchiveDipScan(items, enabled) {
  const [nonce, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => {
    const f = () => force();
    window.addEventListener(_ADS_EVENT, f);
    return () => window.removeEventListener(_ADS_EVENT, f);
  }, []);
  const key = enabled ? (items || []).map(it => it && it.code).filter(Boolean).slice(0, _ADS_MAX).join(",") : "";
  React.useEffect(() => {
    if (enabled && items && items.length) ArchiveDipScan.scan(items);
  }, [key, enabled]);
  return { status: enabled ? ArchiveDipScan.status : "idle", byCode: ArchiveDipScan.byCode, nonce };
}

// ---- 起動 ----
if (!_DIP_DEMO) {
  setTimeout(() => DipSignals.refresh(), 1500);
  window.addEventListener("shodou-watchlist-changed", () => {
    clearTimeout(window.__dipWlTimer);
    window.__dipWlTimer = setTimeout(() => DipSignals.refresh(true), 1200);
  });
}

Object.assign(window, {
  DipSignals, useDipSignals, useDipUnseen,
  DipBadge, DipAlertsSection, DipChips,
  computeDipSignal, __dipSelfTest, __dipDemoState: _dipDemoState,
  ArchiveDipScan, useArchiveDipScan, dipZoneMatch,
});
