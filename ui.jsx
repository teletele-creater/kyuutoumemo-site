// Reusable UI primitives for 株価急騰要因メモ

const { useState, useEffect, useRef, useMemo } = React;

// Tiny sparkline
function Sparkline({ points, color = "var(--up)", w = 56, h = 18 }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${(i * stepX).toFixed(2)} ${(h - ((p - min) / range) * h).toFixed(2)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <path d={path} className="spark-path" stroke={color} />
    </svg>
  );
}

// 騰落率（日本式：赤=上昇, 緑=下落）。塗りは付けず、数字の色だけで示す
function PctChip({ pct, size = "md" }) {
  const isUp = pct >= 0;
  const fs = size === "sm" ? 12 : size === "lg" ? 22 : 14.5;
  return (
    <span className="mono" style={{
      color: isUp ? "var(--up)" : "var(--down)",
      fontSize: fs, fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      {isUp ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

// 検知ポスト本文（raw_post）から数値を読む。
// 例: 「株価 673円 / 前日比 +17.45% / 出来高比 10.40倍 / 売買代金 1.09億円」
function _postStats(s) {
  const t = String((s && s.raw_post) || "").replace(/[−–]/g, "-");
  const num = re => { const m = t.match(re); return m ? Number(m[1].replace(/,/g, "")) : null; };
  const turnover = t.match(/売買代金\s*([\d.,]+\s*[億万]?円)/);
  return {
    dayPct:   num(/前日比\s*([+-]?[\d.]+)\s*%/),
    volRatio: num(/出来高比\s*([\d.,]+)\s*倍/),
    price:    num(/株価\s*([\d,]+(?:\.\d+)?)\s*円/),
    turnover: turnover ? turnover[1].replace(/\s+/g, "") : null,
  };
}

// 騰落率を求める。pct → 検知時の前日比（raw_post）→ 急騰時→現在価格 の順に採用（ライブデータは pct を持たない）
function _stockPct(s) {
  if (!s) return { pct: null, sinceSurge: false, label: null };
  if (s.pct !== null && s.pct !== undefined && !isNaN(Number(s.pct))) return { pct: Number(s.pct), sinceSurge: false, label: null };
  const day = _postStats(s).dayPct;
  if (day != null && !isNaN(day)) return { pct: day, sinceSurge: false, label: "前日比" };
  const sp = Number(s.surge_price ?? s.price);
  const cp = s.current_price != null ? Number(s.current_price) : NaN;
  if (sp > 0 && !isNaN(cp)) return { pct: ((cp - sp) / sp) * 100, sinceSurge: true, label: "急騰時から" };
  return { pct: null, sinceSurge: false, label: null };
}

// 表示用の銘柄名。全角英数（ＰＥＧＡＳＵＳ 等）を半角に揃えて字間の間延びを防ぐ（データは変えない）
function _dispName(name) {
  try { return String(name == null ? "" : name).normalize("NFKC"); } catch (e) { return name; }
}

// JST の「11月4日(水)」
function _issueLabel(d = new Date()) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short",
    }).format(d);
  } catch (e) { return ""; }
}
function _jstHM(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tokyo" });
  } catch (e) { return "—"; }
}

// Section header — 太罫1本の下に見出し。kicker は見出しの下に補足として小さく添える
function SectionHeader({ kicker, title, more, onMore }) {
  return (
    <div className="sec-head">
      <div className="sec-head-rule"/>
      <div className="sec-head-row">
        <h2 className="sec-title">{title}</h2>
        {more && (
          <button onClick={onMore} className="sec-more">{more}</button>
        )}
      </div>
      {kicker && <div className="sec-note">{kicker}</div>}
    </div>
  );
}

// Zone break — 旧デザインの区切り。互換のため残し、余白だけを置く
function ZoneBreak() {
  return <div aria-hidden="true" style={{ height: 18 }}/>;
}

// 題字（スマホ）
function TopBar({ onMenu, onHome, onSearch, status = "fallback", lastUpdate = null }) {
  return (
    <div className="mast" style={{ padding: "10px 16px 0" }}>
      <div className="mast-row">
        <button
          onClick={onHome}
          aria-label="ホームへ戻る"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }}
        >
          <span className="mast-title">株価急騰要因メモ</span>
        </button>
        <div style={{ display: "flex", gap: 6, alignItems: "center", color: "var(--ink)" }}>
          <button style={iconBtnStyle} onClick={onSearch} aria-label="検索">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          </button>
          <button style={iconBtnStyle} onClick={onMenu} aria-label="会員プラン">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
        </div>
      </div>
      <div className="mast-issue" style={{ padding: "4px 0 8px" }}>
        <span><b>{_issueLabel()}</b>号</span>
        <ConnectionPill status={status}/>
        {lastUpdate && <span>更新 <span className="mono">{_jstHM(lastUpdate)}</span></span>}
      </div>
      <div className="mast-rule"/>
    </div>
  );
}

// 接続状態
function ConnectionPill({ status }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" };
  if (status === "live") {
    return (
      <span title="リアルタイムで受信中" style={{ ...base, color: "var(--up)" }}>
        <span className="live-dot"/>
        ライブ
      </span>
    );
  }
  if (status === "connecting") return <span style={{ ...base, color: "var(--muted)", fontWeight: 400 }}>接続中…</span>;
  if (status === "error") {
    return <span title="データベースに接続できません。再読み込みしてください" style={{ ...base, color: "#B85C00" }}>オフライン</span>;
  }
  // fallback (未設定・サンプル表示)
  return (
    <span title="site-config.js に Supabase 接続情報を設定してください" style={{ ...base, color: "var(--muted)", fontWeight: 400 }}>サンプル表示</span>
  );
}
const iconBtnStyle = {
  background: "transparent", border: "none", color: "inherit",
  padding: 6, cursor: "pointer", display: "inline-flex",
};

// Live ticker strip — 最新の検知を新しい順に流す
function Ticker({ stocks }) {
  // 同一銘柄は最新の1件のみ、最大12件
  const seen = new Set();
  const latest = [];
  (stocks || []).forEach(s => {
    const k = String(s.code);
    if (seen.has(k) || latest.length >= 12) return;
    seen.add(k);
    latest.push(s);
  });
  if (latest.length === 0) return null;
  // 1周分(base)を画面幅より十分長くしてから、ちょうど2回だけ並べる。
  // アニメーションは -50%（＝base 1周分）なので継ぎ目が完全に一致する。
  const base = [];
  while (base.length < 8) base.push(...latest);
  const items = [...base, ...base];
  return (
    <div style={{
      background: "var(--ink)",
      color: "#fff",
      padding: "8px 0",
      fontSize: 12,
      overflow: "hidden",
      position: "relative",
      flexShrink: 0,
    }}>
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0,
        display: "flex", alignItems: "center", gap: 6, zIndex: 2,
        background: "var(--ink)", paddingLeft: 14, paddingRight: 12,
        fontWeight: 700, fontSize: 11.5,
      }}>
        <span className="live-dot"/>
        速報
      </div>
      <div style={{ paddingLeft: 66 }}>
        <div className="ticker-track" style={{ animationDuration: (base.length * 5) + "s" }}>
          {items.map((s, i) => {
            const { pct } = _stockPct(s);
            const theme = (s.themes && s.themes[0]) || null;
            return (
              <span key={i} style={{ display: "inline-flex", alignItems: "baseline", gap: 7, flex: "0 0 auto", paddingRight: 30 }}>
                <span className="mono" style={{ color: "#9DA3AD", fontSize: 11 }}>{s.code}</span>
                <span style={{ color: "#fff", fontWeight: 700 }}>{s.name}</span>
                {pct !== null ? (
                  <span className="mono" style={{ color: pct >= 0 ? "#ff8a8f" : "#7fd29b", fontWeight: 700 }}>
                    {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                  </span>
                ) : theme ? (
                  <span style={{ color: "#9DA3AD", fontSize: 11 }}>{theme}</span>
                ) : null}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// 一面用の小さなチャート。日足は real-chart.jsx の _rcFetchOhlc（Supabase stock_ohlc → Yahoo）から取る。
// kind="candle"：ローソク足＋出来高（トップ記事）/ kind="line"：終値の線（中・小記事）
// 検知日に縦線を立て、急騰の位置が分かるようにする
function MiniChart({ code, surgeAt, kind = "line", bars: nBars = 40, height = 40 }) {
  const [bars, setBars] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!code || typeof _rcFetchOhlc !== "function") { setFailed(true); return; }
    _rcFetchOhlc(String(code), "D")
      .then(b => { if (alive) setBars(b); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [code]);

  if (failed) return null;
  if (!bars) return <div aria-hidden="true" style={{ height, background: "var(--surface-sub)" }}/>;

  const data = bars.slice(-nBars);
  const n = data.length;
  if (n < 2) return null;
  const W = 100 * n, H = 100;
  const volH = kind === "candle" ? 18 : 0;        // 下18%を出来高に使う
  const priceH = H - volH - 4;
  let lo = Infinity, hi = -Infinity, vmax = 0;
  data.forEach(b => {
    const l = kind === "candle" ? b.l : b.c, h = kind === "candle" ? b.h : b.c;
    if (l < lo) lo = l; if (h > hi) hi = h; if (b.v > vmax) vmax = b.v;
  });
  const span = (hi - lo) || 1;
  const y = p => 2 + priceH * (1 - (p - lo) / span);
  const cx = i => 100 * i + 50;

  // 検知日の足
  let si = -1;
  if (surgeAt) {
    const st = new Date(surgeAt).getTime();
    data.forEach((b, i) => { if (b.t <= st) si = i; });
  }
  const last = data[n - 1], first = data[0];
  const upAll = last.c >= first.c;
  const label = `直近${n}営業日の値動き。終値 ${Math.round(last.c).toLocaleString()}円`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label}
      style={{ display: "block", width: "100%", height }}>
      {si >= 0 && <rect x={100 * si} y="0" width="100" height={H} fill="var(--marker)" opacity="0.55"/>}
      {kind === "candle" ? data.map((b, i) => {
        const up = b.c >= b.o;
        const col = up ? "var(--up)" : "var(--down)";
        const top = y(Math.max(b.o, b.c)), bot = y(Math.min(b.o, b.c));
        return (
          <g key={b.t}>
            <line x1={cx(i)} x2={cx(i)} y1={y(b.h)} y2={y(b.l)} stroke={col} strokeWidth="1" vectorEffect="non-scaling-stroke"/>
            <rect x={cx(i) - 32} width="64" y={top} height={Math.max(0.8, bot - top)} fill={col}/>
            {vmax > 0 && <rect x={cx(i) - 32} width="64" y={H - (b.v / vmax) * volH} height={(b.v / vmax) * volH} fill="var(--hairline-strong)"/>}
          </g>
        );
      }) : (
        <polyline
          points={data.map((b, i) => `${cx(i)},${y(b.c)}`).join(" ")}
          fill="none" stroke={upAll ? "var(--up)" : "var(--down)"} strokeWidth="1.6"
          strokeLinejoin="round" vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}

// 一面の記事 — size: "lead"（トップ記事）/ "mid"（準トップ）/ "small"（小記事）
const _FP_SIZES = {
  lead:  { pct: 104, name: 34, reason: 19 },
  mid:   { pct: 52,  name: 22, reason: 15 },
  small: { pct: 30,  name: 16.5, reason: 13 },
};
function FrontStory({ stock, size = "small", onOpen, onTheme, isNew = false }) {
  const S = _FP_SIZES[size] || _FP_SIZES.small;
  const st = _postStats(stock);
  const { pct, label } = _stockPct(stock);
  const lead = size === "lead";
  const open = () => onOpen?.(stock);
  const stats = [
    st.volRatio != null && { l: "出来高比", v: st.volRatio.toLocaleString(undefined, { maximumFractionDigits: 1 }) + "倍" },
    st.turnover && { l: "売買代金", v: st.turnover },
    (st.price != null || stock.surge_price != null) && { l: "検知時株価", v: "¥" + Math.round(Number(st.price ?? stock.surge_price)).toLocaleString() },
  ].filter(Boolean);
  return (
    <article
      className={"fp-story fp-" + size + (isNew ? " new-card" : "")}
      role="link" tabIndex={0}
      onClick={open}
      onKeyDown={e => { if (e.key === "Enter") open(); }}
    >
      <div className="fp-meta" style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12, color: "var(--muted)" }}>
        <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>{stock.code}</span>
        <span>{stock.market || "東"}</span>
        <span style={{ marginLeft: "auto" }}><span className="mono">{stock.time}</span> 検知</span>
      </div>

      {pct !== null && (
        <div className="fp-pctrow" style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: lead ? 6 : 2 }}>
          <span className="num-cond fp-pct" style={{
            fontSize: S.pct, fontWeight: 800, lineHeight: 0.95,
            color: pct >= 0 ? "var(--up)" : "var(--down)",
          }}>
            {pct >= 0 ? "+" : ""}{pct.toFixed(1)}<span style={{ fontSize: "0.5em", marginLeft: "0.04em" }}>%</span>
          </span>
          {label && <span className="fp-pctlabel" style={{ fontSize: lead ? 13 : 11.5, color: "var(--muted)" }}>{label}</span>}
        </div>
      )}

      <h3 className="fp-name" style={{
        margin: (lead ? 10 : 4) + "px 0 0", fontFamily: "var(--f-head)", fontWeight: 900,
        fontSize: S.name, lineHeight: 1.3, fontFeatureSettings: '"palt"',
      }}>{_dispName(stock.name)}</h3>

      <p className="fp-reason" style={{
        margin: (lead ? 10 : 5) + "px 0 0",
        fontFamily: lead ? "var(--f-head)" : "var(--f-body)", fontWeight: lead ? 700 : 400,
        fontSize: S.reason, lineHeight: 1.7, color: lead ? "var(--ink)" : "var(--ink-soft)",
        maxWidth: "34em",
      }}>
        {lead
          ? <span className="marker marker-draw">{stock.reason || "急騰理由を整理しています"}</span>
          : (stock.reason || "急騰理由を整理しています")}
      </p>

      {lead ? (
        <figure className="fp-chart" style={{ margin: "18px 0 0" }}>
          <MiniChart code={stock.code} surgeAt={stock.detected_at} kind="candle" bars={60} height={150}/>
          <figcaption className="fp-cap" style={{ marginTop: 6, fontSize: 11.5, color: "var(--muted)" }}>日足、直近60営業日。黄色の帯が検知した日です</figcaption>
        </figure>
      ) : (
        <div className="fp-chart" style={{ marginTop: size === "mid" ? 12 : 10 }}>
          <MiniChart code={stock.code} surgeAt={stock.detected_at} kind="line" bars={40} height={size === "mid" ? 46 : 34}/>
        </div>
      )}

      {size !== "small" && stats.length > 0 && (
        <dl className="fp-stats" style={{
          margin: (lead ? 16 : 10) + "px 0 0", display: "flex", flexWrap: "wrap", gap: "4px 18px",
          fontSize: lead ? 13 : 12, color: "var(--muted)",
        }}>
          {stats.map(c => (
            <div key={c.l} style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
              <dt>{c.l}</dt>
              <dd className="mono" style={{ margin: 0, color: "var(--ink)", fontWeight: 600 }}>{c.v}</dd>
            </div>
          ))}
        </dl>
      )}

      {lead && stock.themes && stock.themes.length > 0 && (
        <div className="fp-themes" style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
          {stock.themes.map(t => (
            <ThemeTag key={t} label={t} onClick={onTheme ? (e => { e.stopPropagation(); onTheme(String(t).trim()); }) : undefined}/>
          ))}
        </div>
      )}
    </article>
  );
}

// テーマ札。hit=true でマーカー色に塗る（共通テーマの強調用）
function ThemeTag({ label, hit = false, onClick }) {
  return (
    <span
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{
        fontSize: 11.5, lineHeight: 1.5,
        color: "var(--ink-soft)",
        background: hit ? "var(--marker)" : "transparent",
        border: "1px solid " + (hit ? "var(--marker)" : "var(--hairline-strong)"),
        fontWeight: hit ? 700 : 400,
        padding: "1px 8px",
        cursor: onClick ? "pointer" : undefined,
        whiteSpace: "nowrap",
      }}
    >{label}</span>
  );
}

// 目次の1行 — 左に検知時刻、右に銘柄と理由
function StockCard({ stock, onOpen, idx, isNew = false, highlightThemes = null, onTheme = null }) {
  const { pct, label } = _stockPct(stock);
  const hasSpark = Array.isArray(stock.spark) && stock.spark.length > 0;
  return (
    <div className={"tappable" + (isNew ? " new-card" : "")} onClick={() => onOpen?.(stock)} style={{
      background: "var(--surface)",
      padding: "15px 18px 15px 16px",
      borderBottom: "1px solid var(--hairline)",
      cursor: "pointer", display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: 12,
    }}>
      <div className="num-cond" style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.05, color: "var(--ink)", paddingTop: 1 }}>
        {stock.time || "—"}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{stock.code}</span>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>{stock.market}</span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 6 }}>
            {hasSpark && pct !== null && <Sparkline points={stock.spark} color={pct >= 0 ? "var(--up)" : "var(--down)"}/>}
            {pct !== null ? (
              <>
                {label && <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{label}</span>}
                <PctChip pct={pct}/>
              </>
            ) : (
              <span style={{ fontSize: 11.5, color: "var(--up)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span className="live-dot" style={{ width: 5, height: 5 }}/>急騰検知
              </span>
            )}
          </span>
        </div>
        <div style={{ fontFamily: "var(--f-head)", fontSize: 17, fontWeight: 900, lineHeight: 1.35, marginTop: 2, fontFeatureSettings: '"palt"' }}>
          {_dispName(stock.name)}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.65, marginTop: 4 }}>
          {stock.reason}
        </div>
        {(stock.price != null || stock.vol || stock.chart_url) && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 7, fontSize: 11.5, color: "var(--muted)" }}>
            {stock.price != null && <span className="mono">¥{Number(stock.price).toLocaleString()}</span>}
            {stock.vol && <span>出来高 <span className="mono">{stock.vol}</span></span>}
            {stock.chart_url && (
              <img src={stock.chart_url} alt="" loading="lazy" style={{
                height: 24, width: 64, objectFit: "cover", objectPosition: "left center",
                border: "1px solid var(--hairline)", flexShrink: 0,
              }}/>
            )}
          </div>
        )}
        {stock.themes && stock.themes.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 9 }}>
            {stock.themes.map(t => (
              <ThemeTag key={t} label={t}
                hit={!!(highlightThemes && highlightThemes.has(String(t).trim()))}
                onClick={onTheme ? (e => { e.stopPropagation(); onTheme(String(t).trim()); }) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Bottom tab bar — 選択中はラベルにマーカーを引く
function TabBar({ active, onChange }) {
  const tabs = [
    { k: "home",   label: "ホーム",   icon: (a) => <IconHome active={a}/> },
    { k: "cats",   label: "カテゴリ", icon: (a) => <IconGrid active={a}/> },
    { k: "archive",label: "アーカイブ", icon: (a) => <IconArchive active={a}/> },
    { k: "watch",  label: "ウォッチ", icon: (a) => <IconStar active={a}/> },
    { k: "report", label: "レポート", icon: (a) => <IconChart active={a}/> },
    { k: "plan",   label: "プラン",   icon: (a) => <IconCrown active={a}/> },
  ];
  return (
    <nav aria-label="メインメニュー" style={{
      borderTop: "2px solid var(--ink)",
      background: "var(--bg)",
      paddingBottom: "calc(env(safe-area-inset-bottom, 0) + 4px)",
      display: "flex", flexShrink: 0,
    }}>
      {tabs.map(t => {
        const a = active === t.k;
        return (
          <button key={t.k} onClick={() => onChange(t.k)} aria-current={a ? "page" : undefined} style={{
            flex: 1, background: "transparent", border: "none",
            padding: "8px 0 6px", cursor: "pointer",
            display: "flex", flexDirection: "column",
            alignItems: "center", gap: 3,
            color: a ? "var(--ink)" : "var(--muted)",
          }}>
            <span style={{ position: "relative", display: "inline-flex" }}>
              {t.icon(a)}
              {t.k === "watch" && window.DipBadge && <window.DipBadge/>}
            </span>
            <span className={a ? "marker" : undefined} style={{ fontSize: 10.5, fontWeight: a ? 700 : 400, padding: "0 2px" }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function IconHome({ active }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}><path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11Z"/></svg>;
}
function IconGrid({ active }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>;
}
function IconChart({ active }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}><path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/></svg>;
}
function IconStar({ active }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/></svg>;
}
function IconCrown({ active }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}><path d="m3 18 2-10 5 5 2-8 2 8 5-5 2 10z"/><path d="M3 21h18"/></svg>;
}
function IconArchive({ active }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6}><rect x="3" y="4" width="18" height="4"/><path d="M5 8v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>;
}

Object.assign(window, {
  Sparkline, PctChip, SectionHeader, TopBar, Ticker, FrontStory, MiniChart, StockCard, ThemeTag, TabBar,
  ConnectionPill, ZoneBreak, IconHome, IconGrid, IconArchive, IconStar, IconChart, IconCrown,
  _stockPct, _postStats, _issueLabel, _jstHM, _dispName,
});
