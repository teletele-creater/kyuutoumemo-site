// リアルチャート — 自前でOHLCを取得してCanvasに描画する
// 日足: 直近6ヶ月 / 週足: 直近1年半
// データ源: Yahoo Finance chart API（CORSプロキシ経由フォールバック付き）
// 取得結果は localStorage に15分キャッシュ

const { useState: useRCState, useEffect: useRCEffect, useRef: useRCRef } = React;

let _rcIntervalPref = "D"; // 足種の選択を銘柄間で引き継ぐ

const _RC_TTL = 15 * 60 * 1000;

// キャッシュキーの世代。v2: テスト用ダミーデータ混入のため旧キー(rc-ohlc:)を廃止
const _RC_PREFIX = "rc-ohlc-v2:";

function _rcCacheGet(key) {
  try {
    const raw = localStorage.getItem(_RC_PREFIX + key);
    if (!raw) return null;
    const { t, bars } = JSON.parse(raw);
    if (Date.now() - t > _RC_TTL) return null;
    return bars;
  } catch (e) { return null; }
}
function _rcCacheSet(key, bars) {
  try { localStorage.setItem(_RC_PREFIX + key, JSON.stringify({ t: Date.now(), bars })); } catch (e) {}
}

// 旧世代キャッシュ（テストデータ混入の可能性あり）を一掃
(function _rcPurgeOldCache() {
  try {
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("rc-ohlc:") === 0) dead.push(k);
    }
    dead.forEach(k => localStorage.removeItem(k));
  } catch (e) {}
})();

async function _rcFetchOhlc(code, intv) {
  const key = code + ":" + intv;
  const cached = _rcCacheGet(key);
  if (cached) return cached;

  // 1) Supabase の stock_ohlc テーブル（本命。sync_ohlc.py が書き込む）
  try {
    const c = window.SITE_CONFIG || {};
    if (c.SUPABASE_URL && c.SUPABASE_ANON_KEY) {
      const u = `${c.SUPABASE_URL}/rest/v1/stock_ohlc` +
        `?code=eq.${encodeURIComponent(code)}&interval=eq.${intv}&select=bars&limit=1`;
      const res = await fetch(u, {
        headers: { apikey: c.SUPABASE_ANON_KEY, Authorization: "Bearer " + c.SUPABASE_ANON_KEY },
      });
      if (res.ok) {
        const rows = await res.json();
        const raw = rows && rows[0] && rows[0].bars;
        if (Array.isArray(raw) && raw.length >= 5) {
          const bars = raw.map(a => ({ t: a[0], o: a[1], h: a[2], l: a[3], c: a[4], v: a[5] || 0 }));
          _rcCacheSet(key, bars);
          return bars;
        }
      }
    }
  } catch (e) { /* フォールバックへ */ }

  // 2) Yahoo Finance API（CORS制限があるため環境によっては失敗する）
  const conf = intv === "W"
    ? { range: "2y", interval: "1wk", keep: 78 }   // 週足 約1年半
    : { range: "6mo", interval: "1d", keep: 130 }; // 日足 約6ヶ月
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}.T` +
    `?range=${conf.range}&interval=${conf.interval}`;
  const attempts = [
    url,
    "https://corsproxy.io/?url=" + encodeURIComponent(url),
    "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  ];

  for (const u of attempts) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 9000);
      const res = await fetch(u, { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const j = await res.json();
      const r = j && j.chart && j.chart.result && j.chart.result[0];
      if (!r || !r.timestamp) continue;
      const q = r.indicators.quote[0];
      const bars = [];
      for (let i = 0; i < r.timestamp.length; i++) {
        const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
        if (o == null || h == null || l == null || c == null) continue;
        bars.push({ t: r.timestamp[i] * 1000, o, h, l, c, v: (q.volume && q.volume[i]) || 0 });
      }
      if (bars.length >= 5) {
        const trimmed = bars.slice(-conf.keep);
        _rcCacheSet(key, trimmed);
        return trimmed;
      }
    } catch (e) { /* 次のルートを試す */ }
  }
  throw new Error("no-data");
}

// ---- 移動平均 ----
const _RC_MA = {
  D: [{ n: 5, color: "#E8A33D" }, { n: 25, color: "#3D7BE8" }, { n: 75, color: "#9C5BD1" }],
  W: [{ n: 13, color: "#3D7BE8" }, { n: 26, color: "#9C5BD1" }],
};

// 単純移動平均。データ不足の位置は null。
function _rcSma(bars, n) {
  const out = new Array(bars.length).fill(null);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].c;
    if (i >= n) sum -= bars[i - n].c;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// ---- Canvas 描画 ----
// opts.lastClose: 全期間の直近終値（見えている範囲内のときだけ破線を描く）
// opts.mas: [{ n, color, values }] — values は表示スライスに揃えた配列
// opts.surge: { i, price, t } — 急騰検知マーカー（i は表示スライス内の位置）
function _rcDraw(canvas, bars, width, height, opts) {
  opts = opts || {};
  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const cs = getComputedStyle(canvas);
  const UP    = (cs.getPropertyValue("--up") || "#C33").trim();
  const DOWN  = (cs.getPropertyValue("--down") || "#2A7").trim();
  const MUTED = (cs.getPropertyValue("--muted") || "#888").trim();
  const INK   = (cs.getPropertyValue("--ink") || "#111").trim();
  const mono = "10px 'JetBrains Mono', monospace";

  const padL = 6, padR = 52, padT = 10, padB = 22;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  if (plotW < 40 || bars.length === 0) return;

  let min = Infinity, max = -Infinity;
  bars.forEach(b => { if (b.l < min) min = b.l; if (b.h > max) max = b.h; });
  (opts.mas || []).forEach(ma => ma.values.forEach(v => {
    if (v == null) return;
    if (v < min) min = v; if (v > max) max = v;
  }));
  const span = (max - min) || 1;
  min -= span * 0.05; max += span * 0.05;

  const x = i => padL + (plotW * (i + 0.5)) / bars.length;
  const y = p => padT + plotH * (1 - (p - min) / (max - min));

  // 水平グリッド + 価格ラベル
  ctx.font = mono;
  ctx.textBaseline = "middle";
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const p = min + ((max - min) * i) / steps;
    const yy = y(p);
    ctx.strokeStyle = "rgba(20,30,50,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(padL + plotW, yy); ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.textAlign = "left";
    ctx.fillText(Math.round(p).toLocaleString(), padL + plotW + 6, yy);
  }

  // 月ラベル
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  let lastMonth = -1;
  bars.forEach((b, i) => {
    const d = new Date(b.t);
    const m = d.getMonth();
    if (m !== lastMonth) {
      if (lastMonth !== -1) {
        ctx.fillStyle = MUTED;
        ctx.fillText(`${m + 1}月`, x(i), height - 7);
        ctx.strokeStyle = "rgba(20,30,50,0.05)";
        ctx.beginPath(); ctx.moveTo(x(i), padT); ctx.lineTo(x(i), padT + plotH); ctx.stroke();
      }
      lastMonth = m;
    }
  });

  // ローソク足
  const cw = Math.max(1.5, Math.min(9, (plotW / bars.length) * 0.62));
  bars.forEach((b, i) => {
    const up = b.c >= b.o;
    const col = up ? UP : DOWN;
    const xx = x(i);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xx, y(b.h)); ctx.lineTo(xx, y(b.l)); ctx.stroke();
    const yo = y(b.o), yc = y(b.c);
    const top = Math.min(yo, yc), hh = Math.max(1, Math.abs(yo - yc));
    ctx.fillStyle = up ? col : "#fff";
    ctx.strokeStyle = col;
    ctx.fillRect(xx - cw / 2, top, cw, hh);
    ctx.strokeRect(xx - cw / 2, top, cw, hh);
  });

  // 移動平均線
  (opts.mas || []).forEach(ma => {
    ctx.strokeStyle = ma.color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    let started = false;
    ma.values.forEach((v, i) => {
      if (v == null) { started = false; return; }
      if (!started) { ctx.moveTo(x(i), y(v)); started = true; }
      else ctx.lineTo(x(i), y(v));
    });
    ctx.stroke();
  });

  // 移動平均の凡例（左上）
  if (opts.mas && opts.mas.length) {
    ctx.font = mono;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let lx = padL + 4;
    const ly0 = padT + 2;
    opts.mas.forEach(ma => {
      ctx.strokeStyle = ma.color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(lx, ly0); ctx.lineTo(lx + 12, ly0); ctx.stroke();
      lx += 16;
      const label = ma.n + (opts.unit || "日");
      ctx.fillStyle = MUTED;
      ctx.fillText(label, lx, ly0 + 0.5);
      lx += ctx.measureText(label).width + 12;
    });
  }

  // 急騰検知マーカー（縦破線 + 旗 + 価格ドット）
  if (opts.surge && opts.surge.i >= 0 && opts.surge.i < bars.length) {
    const GOLD = ((cs.getPropertyValue("--gold") || "").trim()) || "#B08C3D";
    const sx = x(opts.surge.i);
    const flagH = 14;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(sx, 2 + flagH); ctx.lineTo(sx, padT + plotH); ctx.stroke();
    ctx.setLineDash([]);
    if (opts.surge.price != null && opts.surge.price >= min && opts.surge.price <= max) {
      const sy = y(opts.surge.price);
      ctx.fillStyle = GOLD;
      ctx.beginPath(); ctx.arc(sx, sy, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sx, sy, 3.4, 0, Math.PI * 2); ctx.stroke();
    }
    const sd = new Date(opts.surge.t);
    const lbl = "急騰 " + (sd.getMonth() + 1) + "/" + sd.getDate();
    ctx.font = mono;
    const tw = ctx.measureText(lbl).width + 10;
    let fx = sx - tw / 2;
    fx = Math.max(padL, Math.min(padL + plotW - tw, fx));
    ctx.fillStyle = GOLD;
    ctx.fillRect(fx, 2, tw, flagH);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(lbl, fx + 5, 2 + flagH / 2 + 0.5);
  }

  // 直近終値ライン + ラベル（表示範囲内のときのみ）
  const lastC = opts.lastClose != null ? opts.lastClose : bars[bars.length - 1].c;
  if (lastC >= min && lastC <= max) {
    const ly = y(lastC);
    ctx.strokeStyle = INK;
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, ly); ctx.lineTo(padL + plotW, ly); ctx.stroke();
    ctx.setLineDash([]);
    const label = Math.round(lastC).toLocaleString();
    ctx.font = "600 " + mono;
    const tw = ctx.measureText(label).width + 8;
    ctx.fillStyle = INK;
    ctx.fillRect(padL + plotW + 2, ly - 8, Math.max(tw, padR - 4), 16);
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(label, padL + plotW + 6, ly + 0.5);
  }
}

// ---- コンポーネント ----
// 一度に全期間を詰め込まず、直近 N 本だけの「表示窓」を描画する。
// チャートを左右ドラッグ（ホイールでも可）すると過去へ移動できる。
const _RC_VISIBLE = { D: 60, W: 44 };

function RealChart({ code, surgeAt, surgePrice }) {
  const [intv, setIntv] = useRCState(_rcIntervalPref); // "D" | "W"
  const [state, setState] = useRCState({ status: "loading", bars: null });
  const [off, setOff] = useRCState(0); // 何本分過去にパンしているか（0=最新）
  const boxRef = useRCRef(null);
  const canvasRef = useRCRef(null);
  const offRef = useRCRef(0);
  offRef.current = off;

  const set = v => { _rcIntervalPref = v; setIntv(v); setOff(0); };

  useRCEffect(() => {
    let alive = true;
    setState({ status: "loading", bars: null });
    setOff(0);
    _rcFetchOhlc(code, intv)
      .then(bars => { if (alive) setState({ status: "ok", bars }); })
      .catch(() => { if (alive) setState({ status: "error", bars: null }); });
    return () => { alive = false; };
  }, [code, intv]);

  // 表示窓の計算
  const bars = state.bars;
  const vis = bars ? Math.min(_RC_VISIBLE[intv] || 60, bars.length) : 0;
  const maxOff = bars ? Math.max(0, bars.length - vis) : 0;
  const clampedOff = Math.min(off, maxOff);

  // 描画（データ・パン位置・リサイズ時）
  useRCEffect(() => {
    if (state.status !== "ok" || !canvasRef.current || !boxRef.current) return;
    const draw = () => {
      const w = boxRef.current.clientWidth;
      if (w <= 0) return;
      const end = bars.length - clampedOff;
      const start = Math.max(0, end - vis);
      const slice = bars.slice(start, end);
      // 移動平均は全期間で計算してから表示窓で切り出す（窓の左端も正しい値になる）
      const mas = (_RC_MA[intv] || [])
        .map(m => ({ n: m.n, color: m.color, values: _rcSma(bars, m.n).slice(start, end) }))
        .filter(m => m.values.some(v => v != null));
      // 急騰検知マーカー: 検知時刻以前の最後の足に立てる
      let surge = null;
      if (surgeAt) {
        const st = new Date(surgeAt).getTime();
        if (!isNaN(st)) {
          let idx = -1;
          for (let i = 0; i < bars.length; i++) {
            if (bars[i].t <= st) idx = i; else break;
          }
          const local = idx - start;
          if (idx >= 0 && local >= 0 && local < slice.length) {
            surge = { i: local, price: surgePrice != null ? Number(surgePrice) : null, t: bars[idx].t };
          }
        }
      }
      _rcDraw(canvasRef.current, slice, w, 250, {
        lastClose: bars[bars.length - 1].c,
        mas,
        surge,
        unit: intv === "W" ? "週" : "日",
      });
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, [state, clampedOff, vis, surgeAt, surgePrice]);

  // ドラッグ / ホイールでパン
  useRCEffect(() => {
    if (state.status !== "ok" || !canvasRef.current) return;
    const cv = canvasRef.current;
    const total = bars.length;
    const visN = Math.min(_RC_VISIBLE[intv] || 60, total);
    const maxO = Math.max(0, total - visN);
    const clamp = v => Math.max(0, Math.min(maxO, v));
    let dragging = false, startX = 0, startOff = 0, moved = false;

    const barW = () => Math.max(2, (cv.clientWidth - 58) / visN);

    const down = e => {
      dragging = true; moved = false;
      startX = e.clientX; startOff = offRef.current;
      cv.setPointerCapture && cv.setPointerCapture(e.pointerId);
    };
    const move = e => {
      if (!dragging) return;
      const delta = Math.round((e.clientX - startX) / barW());
      if (delta !== 0) moved = true;
      setOff(clamp(startOff + delta)); // 右へドラッグ=過去へ
    };
    const up = e => { dragging = false; };
    const wheel = e => {
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? -e.deltaX : e.deltaY;
      setOff(clamp(offRef.current + (d > 0 ? 3 : -3)));
    };

    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      cv.removeEventListener("wheel", wheel);
    };
  }, [state, intv]);

  const linkBtn = {
    display: "inline-flex", alignItems: "center", gap: 5,
    fontSize: 11, color: "var(--ink-soft)", textDecoration: "none",
    border: "1px solid var(--hairline-strong)", padding: "6px 10px",
    letterSpacing: "0.04em", background: "var(--surface)",
  };

  const last = state.bars ? state.bars[state.bars.length - 1] : null;
  const prev = state.bars && state.bars.length > 1 ? state.bars[state.bars.length - 2] : null;
  const chg = last && prev ? ((last.c - prev.c) / prev.c) * 100 : null;

  return (
    <div style={{ padding: "0 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ display: "flex", border: "1px solid var(--hairline-strong)" }}>
          {[["D", "日足 · 6ヶ月"], ["W", "週足 · 1年半"]].map(([v, label]) => (
            <button key={v} className="tappable" onClick={() => set(v)} style={{
              padding: "6px 12px", fontSize: 11.5, cursor: "pointer",
              border: "none", fontFamily: "inherit", letterSpacing: "0.04em",
              background: intv === v ? "var(--navy)" : "var(--surface)",
              color: intv === v ? "#fff" : "var(--ink-soft)",
              fontWeight: intv === v ? 600 : 400,
            }}>{label}</button>
          ))}
        </div>
        {chg !== null && (
          <span className="mono" style={{
            marginLeft: "auto", fontSize: 11, fontWeight: 600,
            color: chg >= 0 ? "var(--up)" : "var(--down)",
          }}>
            {chg >= 0 ? "+" : ""}{chg.toFixed(1)}%<span style={{ color: "var(--muted-2)", fontWeight: 400 }}> 前{intv === "D" ? "日" : "週"}比</span>
          </span>
        )}
      </div>

      <div ref={boxRef} style={{ border: "1px solid var(--hairline)", background: "#fff", minHeight: 250, position: "relative" }}>
        {state.status === "ok" && (
          <canvas ref={canvasRef} style={{ display: "block", cursor: "grab", touchAction: "pan-y" }}></canvas>
        )}
        {state.status === "ok" && clampedOff > 0 && (
          <button className="tappable" onClick={() => setOff(0)} style={{
            position: "absolute", top: 8, right: 8,
            background: "var(--navy)", color: "#fff", border: "none",
            padding: "5px 10px", fontSize: 10.5, cursor: "pointer",
            fontFamily: "inherit", letterSpacing: "0.06em",
          }}>最新へ ›</button>
        )}
        {state.status === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--muted)" }}>
            株価データを取得中…
          </div>
        )}
        {state.status === "error" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", gap: 6, alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--muted)", padding: 16, textAlign: "center" }}>
            <span>この銘柄の株価データはまだ同期されていません。</span>
            <span>下のリンクから外部サイトのチャートをご確認ください。</span>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <a className="tappable" style={linkBtn} target="_blank" rel="noopener noreferrer"
           href={`https://kabutan.jp/stock/chart?code=${code}`}>
          株探でチャートを開く <span aria-hidden="true">↗</span>
        </a>
        <a className="tappable" style={linkBtn} target="_blank" rel="noopener noreferrer"
           href={`https://finance.yahoo.co.jp/quote/${code}.T/chart`}>
          Yahoo!ファイナンスで開く <span aria-hidden="true">↗</span>
        </a>
        <span style={{ fontSize: 10, color: "var(--muted-2)", marginLeft: "auto" }}>
          左右ドラッグで過去を表示 · 終値ベース
        </span>
      </div>
    </div>
  );
}

window.RealChart = RealChart;
