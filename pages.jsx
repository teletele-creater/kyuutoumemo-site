// Pages for 株価急騰要因メモ

const { useState: usePState, useMemo: useMPMemo } = React;

// ArchivePage のフィルタ状態を、別ページへ遷移して戻ってきても保持するための簡易ストア。
// （scroll コンテナが key={page} で再マウントされ通常の useState はリセットされるため）
const _archiveUIStore = {};
function useArchiveState(key, initial) {
  const [v, setV] = usePState(() => (key in _archiveUIStore ? _archiveUIStore[key] : initial));
  const set = React.useCallback((next) => {
    setV(prev => {
      const resolved = typeof next === "function" ? next(prev) : next;
      _archiveUIStore[key] = resolved;
      return resolved;
    });
  }, [key]);
  return [v, set];
}

// ── アーカイブ検索 ──
// 正規化: 全角→半角(NFKC)・小文字化・ひらがな→カタカナ。
// 「ＰＣＢ」「pcb」「PCB」を同一視するため。
function _searchNorm(s) {
  return String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

// 投資家がよく使う略語・言い換え。入力がグループ内のいずれかに一致したら、
// グループ内のどの語で書かれていてもヒットさせる。
const SEARCH_SYNONYMS = [
  ["PCB", "プリント基板", "プリント配線板", "銅張積層板", "基板"],
  ["MLCC", "積層セラミックコンデンサ", "セラミックコンデンサ", "コンデンサ"],
  ["半導体製造装置", "SPE", "前工程", "後工程", "製造装置"],
  ["HBM", "広帯域メモリ", "メモリ"],
  ["AI", "人工知能", "生成AI"],
  ["データセンター", "DC", "サーバー"],
  ["EV", "電気自動車", "車載電池"],
  ["再エネ", "再生可能エネルギー", "太陽光", "風力", "ペロブスカイト"],
  ["原子力", "原発", "再稼働", "SMR"],
  ["防衛", "安全保障", "軍事", "装備品"],
  ["宇宙", "衛星", "ロケット"],
  ["インバウンド", "訪日", "観光"],
  ["TOB", "MBO", "公開買付", "買収"],
  ["上方修正", "上振れ"],
  ["増配", "配当", "株主還元", "自社株買い"],
  ["バイオ", "創薬", "治験", "パイプライン"],
  ["量子", "量子コンピュータ", "quantum"],
  ["サイバーセキュリティ", "セキュリティ"],
  ["円安", "為替"],
];
const _SYN_GROUPS = SEARCH_SYNONYMS.map(g => g.map(_searchNorm));

// エントリの全テキストフィールドを検索対象に束ねる
function _entryHaystack(e) {
  return _searchNorm([
    e.code, e.name, e.reason, e.cat, e.business, e.related_stocks, e.raw_post,
    ...(e.themes || []),
    ...(e.keywords_all || []),
    ...(Array.isArray(e.backgrounds) ? e.backgrounds : []),
  ].filter(Boolean).join(" "));
}

// スペース区切りは AND 検索。各語は本文一致 or 類義語グループ経由で判定
function _entryMatchesQuery(e, rawQuery) {
  const terms = _searchNorm(rawQuery).split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = _entryHaystack(e);
  return terms.every(term => {
    if (hay.includes(term)) return true;
    for (const group of _SYN_GROUPS) {
      if (group.includes(term) && group.some(w => hay.includes(w))) return true;
    }
    return false;
  });
}

// JSTの「今日」かどうかを判定。detected_atが無いサンプル銘柄は本日扱い。
function _isTodayJST(stock) {
  if (!stock) return false;
  if (!stock.detected_at) return true; // sample fallback
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
    });
    const today = fmt.format(new Date());
    const target = fmt.format(new Date(stock.detected_at));
    return today === target;
  } catch (e) {
    return false;
  }
}
function _todayStocks(stocks) {
  return (stocks || []).filter(_isTodayJST);
}

// カテゴリ判定用のキーワード（CATEGORIES の key に対応）
const _CATEGORY_TOKENS = {
  earn:   ["好決算", "決算"],
  upward: ["上方修正", "業績.*上方", "上振れ"],
  div:    ["増配", "配当"],
  tob:    ["TOB", "M&A", "MBO", "公開買付"],
  ai:     ["AI", "半導体", "GPU", "生成AI"],
  bio:    ["バイオ", "創薬", "治験"],
  def:    ["防衛", "装備"],
  fx:     ["円安"],
  pol:    ["政策", "規制", "補助金", "原発", "原子力"],
  low:    ["低位"],
};
function _matchCategory(entry, cat) {
  if (!entry || !cat) return false;
  const reason = String(entry.reason || entry.cat || "");
  const themes = entry.themes || [];
  const tokens = _CATEGORY_TOKENS[cat.key] || [cat.label];
  return tokens.some(t => {
    if (reason.includes(t)) return true;
    return themes.some(th => String(th).includes(t));
  });
}
// アーカイブ全件を CATEGORIES に集計
function useCategoryCounts() {
  const archive = window.useArchive ? window.useArchive({ pageSize: 200 }) : { entries: window.SAMPLE_ARCHIVE || [] };
  return useMPMemo(() => {
    const entries = archive.entries || [];
    if (entries.length === 0) {
      return { cats: CATEGORIES, total: 0, ready: false };
    }
    const newest = [...entries].sort((a, b) => String(b.detected_at || "").localeCompare(String(a.detected_at || "")));
    const cats = CATEGORIES.map(c => {
      const hits = newest.filter(e => _matchCategory(e, c));
      // 最近の該当銘柄（同一銘柄は1回、3件まで）
      const seen = new Set(), recent = [];
      for (const e of hits) {
        const k = String(e.code);
        if (seen.has(k)) continue;
        seen.add(k); recent.push(e);
        if (recent.length >= 3) break;
      }
      return { ...c, count: hits.length, recent };
    });
    return { cats, total: entries.length, ready: true };
  }, [archive.entries]);
}

// 検知実績ランキング — 期間切替（1ヶ月/3ヶ月/半年/1年）。上げ幅（メイン）と上昇ペースをトグルで切替
function SlopeRankingSection({ navigate }) {
  // 集計期間（日数）
  const [rankDays, setRankDays] = React.useState(() => {
    try {
      const v = Number(localStorage.getItem("shodo_rank_days"));
      return [31, 92, 183, 365].includes(v) ? v : 31;
    } catch (e) { return 31; }
  });
  const switchDays = d => { setRankDays(d); try { localStorage.setItem("shodo_rank_days", String(d)); } catch (e) {} };
  const rec = window.useRecentEntries ? window.useRecentEntries(rankDays) : { entries: [] };
  // 表示モード: gain=上げ幅（メイン） / slope=上昇ペース
  const [rankMode, setRankMode] = React.useState(() => {
    try { return localStorage.getItem("shodo_rank_mode") === "slope" ? "slope" : "gain"; } catch (e) { return "gain"; }
  });
  const switchMode = m => { setRankMode(m); try { localStorage.setItem("shodo_rank_mode", m); } catch (e) {} };
  const ranked = useMPMemo(() => {
    const now = Date.now();
    const best = new Map(); // code → 最良エントリ
    (rec.entries || []).forEach(e => {
      const sp = Number(e.surge_price ?? e.price);
      const cp = e.current_price != null ? Number(e.current_price) : NaN;
      if (!sp || sp <= 0 || isNaN(cp)) return;
      const t = e.detected_at ? new Date(e.detected_at).getTime() : NaN;
      if (isNaN(t) || now - t > rankDays * 86400000 || t > now + 60000) return;
      const totalPct = ((cp - sp) / sp) * 100;
      if (totalPct <= 0) return;
      const days = Math.max(1, (now - t) / 86400000);
      const slope = totalPct / days;
      const score = rankMode === "slope" ? slope : totalPct;
      const cur = best.get(String(e.code));
      if (!cur || score > cur.score) best.set(String(e.code), { e, slope, totalPct, days, score });
    });
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, 5);
  }, [rec.entries, rankMode, rankDays]);

  const periodLbl = ({ 31: "1ヶ月", 92: "3ヶ月", 183: "半年", 365: "1年" })[rankDays] || "1ヶ月";

  const segBtn = on => ({
    fontSize: 12, padding: "5px 10px", cursor: "pointer",
    fontFamily: "inherit", border: "none",
    background: on ? "var(--ink)" : "transparent",
    color: on ? "#fff" : "var(--ink-soft)",
    fontWeight: on ? 700 : 400,
  });

  return (
    <>
      <SectionHeader kicker={`直近${periodLbl}に検知した銘柄の、急騰時からの値動き`} title={rankMode === "slope" ? "初動後、伸びが速い銘柄" : "初動後、大きく伸びた銘柄"}/>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 18px 10px" }}>
        <div role="group" aria-label="集計期間" style={{ display: "inline-flex", border: "1px solid var(--ink)" }}>
          {[[31, "1ヶ月"], [92, "3ヶ月"], [183, "半年"], [365, "1年"]].map(([d, lbl]) => (
            <button key={d} onClick={() => switchDays(d)} aria-pressed={rankDays === d} style={segBtn(rankDays === d)}>{lbl}</button>
          ))}
        </div>
        <div role="group" aria-label="並び順" style={{ display: "inline-flex", border: "1px solid var(--ink)" }}>
          {[["gain", "上げ幅"], ["slope", "上昇ペース"]].map(([m, lbl]) => (
            <button key={m} onClick={() => switchMode(m)} aria-pressed={rankMode === m} style={segBtn(rankMode === m)}>{lbl}</button>
          ))}
        </div>
      </div>
      <div style={{ borderTop: "1px solid var(--ink)" }}>
        {ranked.length === 0 && (
          <div style={{ padding: "22px 18px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.8 }}>
            {rec.loading ? "読み込み中…" : "この期間に対象となる検知はありません。期間を広げてみてください。"}
          </div>
        )}
        {ranked.map((r, i) => {
          let dateLbl = "";
          try {
            const d = new Date(r.e.detected_at);
            dateLbl = `${d.getMonth() + 1}/${d.getDate()}`;
          } catch (err) {}
          const dispDays = Math.max(1, Math.round(r.days));
          const top = i === 0;
          // 1位だけ大きく、2位以下は静かに
          const nameFs = [20, 15.5, 15, 14, 14][i] || 14;
          const pctFs  = [34, 20, 19, 17, 17][i] || 17;
          const rankFs = [52, 30, 30, 24, 24][i] || 24;
          // スコアに比例した下地バー（1位比）
          const barPct = ranked[0].score > 0 ? Math.max(6, (r.score / ranked[0].score) * 100) : 0;
          const pctMain = rankMode === "slope" ? `+${r.slope.toFixed(1)}` : `+${r.totalPct.toFixed(1)}`;
          const pctUnit = rankMode === "slope" ? "%/日" : "%";
          return (
            <button key={r.e.id || r.e.code} className="tappable" onClick={() => navigate("stock", r.e)} style={{
              width: "100%", display: "grid", gridTemplateColumns: "54px 1fr auto",
              gap: 10, alignItems: "center",
              padding: top ? "16px 18px 14px" : "11px 18px", cursor: "pointer", textAlign: "left",
              background: `linear-gradient(90deg, var(--up-soft) 0%, var(--up-soft) ${barPct}%, var(--surface) ${barPct}%)`,
              border: "none", borderBottom: "1px solid var(--hairline)",
              fontFamily: "inherit",
            }}>
              <div className="num-cond" style={{ fontSize: rankFs, fontWeight: 800, lineHeight: 0.9, color: top ? "var(--ink)" : "var(--muted)" }}>{i + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{r.e.code}</span>
                  <span style={{
                    fontFamily: "var(--f-head)", fontSize: nameFs, fontWeight: 900, color: "var(--ink)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                  }}>{_dispName(r.e.name)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                  {rankMode === "slope"
                    ? <><span className="mono">{dateLbl}</span> 検知、<span className="mono">{dispDays}</span>日で <span className="mono">+{r.totalPct.toFixed(1)}%</span></>
                    : <><span className="mono">{dateLbl}</span> 検知から<span className="mono">{dispDays}</span>日、1日あたり <span className="mono">+{r.slope.toFixed(1)}%</span></>}
                </div>
              </div>
              <div className="num-cond" style={{ fontSize: pctFs, fontWeight: 800, whiteSpace: "nowrap", color: "var(--up)", lineHeight: 1 }}>
                {pctMain}<span style={{ fontSize: top ? 14 : 12, fontWeight: 600, marginLeft: 1 }}>{pctUnit}</span>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ padding: "8px 18px 0", fontSize: 11, color: "var(--muted)", lineHeight: 1.7 }}>
        {rankMode === "slope"
          ? "上昇ペース =（現在値 − 急騰時値）÷ 急騰時値 ÷ 検知からの経過日数。同一銘柄は最良の回を採用。"
          : `上げ幅 =（現在値 − 急騰時値）÷ 急騰時値。検知から${periodLbl}以内の上昇分。同一銘柄は最良の回を採用。`}
      </div>
    </>
  );
}

// 今週のテーマ勢力図 — 直近7日の検知をテーマ別に集計してツリーマップ表示
// 面積＝件数。squarified treemapで矩形分割する
function _tmWorst(row, sum, side) {
  const t = sum / side;
  let m = 0;
  for (const v of row) { const l = v / t; m = Math.max(m, l / t, t / l); }
  return m;
}
function _tmSquarify(values, x, y, w, h) {
  const rects = [];
  const total = values.reduce((a, b) => a + b, 0);
  const vals = values.map(v => (v * w * h) / total);
  let i = 0;
  while (i < vals.length) {
    const horiz = w >= h;            // 短辺に沿って列を作る
    const side = horiz ? h : w;
    let row = [vals[i]], sum = vals[i];
    let worst = _tmWorst(row, sum, side);
    let j = i + 1;
    while (j < vals.length) {
      const r2 = row.concat(vals[j]);
      const w2 = _tmWorst(r2, sum + vals[j], side);
      if (w2 > worst) break;
      row = r2; sum += vals[j]; worst = w2; j++;
    }
    const thick = sum / side;
    let off = 0;
    for (const v of row) {
      const len = v / thick;
      rects.push(horiz
        ? { x, y: y + off, w: thick, h: len }
        : { x: x + off, y, w: len, h: thick });
      off += len;
    }
    if (horiz) { x += thick; w -= thick; } else { y += thick; h -= thick; }
    i = j;
  }
  return rects;
}

// テーマ名→アイコン（キーワードマッチ、先勝ち）
const _TM_GLYPH_RULES = [
  [/株主還元|配当|自社株|還元/i, "yen"],
  [/リユース|リサイクル|循環|環境|脱炭素|SDG/i, "recycle"],
  [/半導体|チップ|SoC|ファブレス|製造装置/i, "chip"],
  [/生成AI|AI|LLM|人工知能/i, "sparkle"],
  [/SaaS|クラウド|データセンター/i, "cloud"],
  [/DX|デジタル|システム|ソフト|IT/i, "monitor"],
  [/コスト|効率|改善|リストラ/i, "scissors"],
  [/防衛|安全保障|軍需/i, "shield"],
  [/IoT|通信|5G|6G|衛星|ネットワーク/i, "wifi"],
  [/医療|創薬|バイオ|ヘルス|介護|医薬/i, "pulse"],
  [/エネルギー|電力|再エネ|原発|水素|電池|EV/i, "bolt"],
  [/猛暑|天候|気候|夏/i, "sun"],
  [/決算|業績|上方修正|増益|好調/i, "trend"],
  [/インバウンド|観光|旅行|ホテル|ブライダル|訪日/i, "globe"],
  [/不動産|建設|住宅|再開発|REIT/i, "building"],
  [/金融|銀行|金利|保険|証券/i, "percent"],
  [/政策|国策|補助金|規制|選挙|防災/i, "flag"],
];
const _TM_GLYPH_PATHS = {
  yen:      <><path d="M8 6l4 5.2L16 6"/><path d="M12 11.2V18"/><path d="M8.8 13h6.4"/><path d="M8.8 15.6h6.4"/></>,
  recycle:  <><path d="M21 12a9 9 0 1 1-2.6-6.4"/><polyline points="21 4 21 10 15 10"/></>,
  chip:     <><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></>,
  sparkle:  <><path d="M12 3l1.9 5.7 5.9 1.8-5.9 1.8L12 18l-1.9-5.7-5.9-1.8 5.9-1.8z"/><circle cx="19" cy="4.5" r="0.6" fill="currentColor"/></>,
  cloud:    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>,
  monitor:  <><rect x="2" y="4" width="20" height="12" rx="1"/><path d="M8 20h8M12 16v4"/></>,
  scissors: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1L12 12M20 4L8.1 15.9M14.8 14.8L20 20"/></>,
  shield:   <path d="M12 2l8 4v5c0 5-3.5 8.5-8 11-4.5-2.5-8-6-8-11V6z"/>,
  wifi:     <><path d="M5 13a10 10 0 0 1 14 0"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></>,
  pulse:    <polyline points="3 12 7 12 10 6 14 18 17 12 21 12"/>,
  bolt:     <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z"/>,
  sun:      <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  trend:    <><polyline points="3 17 9 11 13 15 21 7"/><polyline points="15 7 21 7 21 13"/></>,
  globe:    <><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></>,
  building: <><rect x="5" y="3" width="14" height="18"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/></>,
  percent:  <><path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></>,
  flag:     <><path d="M4 21V4"/><path d="M4 4h11l-2 3 2 3H4"/></>,
  tag:      <><path d="M3 3h7l11 11-7 7L3 10z"/><circle cx="7.5" cy="7.5" r="1"/></>,
};
function _tmKind(theme) {
  const s = String(theme || "");
  for (const [re, k] of _TM_GLYPH_RULES) { if (re.test(s)) return k; }
  return "tag";
}
// カテゴリ別の塗り色（同じトーンのくすみカラーで統一）
const _TM_KIND_COLORS = {
  yen:      "oklch(0.62 0.13 85)",   // 還元・配当 — ゴールド
  recycle:  "oklch(0.60 0.13 155)",  // 環境・循環 — グリーン
  chip:     "oklch(0.55 0.13 265)",  // 半導体 — インディゴ
  sparkle:  "oklch(0.55 0.15 300)",  // AI — バイオレット
  cloud:    "oklch(0.60 0.12 230)",  // SaaS・クラウド — スカイ
  monitor:  "oklch(0.55 0.10 250)",  // DX — ブルースレート
  scissors: "oklch(0.58 0.13 340)",  // コスト改善 — プラム
  shield:   "oklch(0.52 0.06 250)",  // 防衛 — スチール
  wifi:     "oklch(0.60 0.12 200)",  // 通信・IoT — シアン
  pulse:    "oklch(0.58 0.15 20)",   // 医療 — クリムゾン
  bolt:     "oklch(0.63 0.13 60)",   // エネルギー — ラスト
  sun:      "oklch(0.64 0.13 75)",   // 猛暑・天候 — アンバー
  trend:    "oklch(0.60 0.11 130)",  // 決算・業績 — オリーブ
  globe:    "oklch(0.60 0.11 185)",  // インバウンド — ティール
  building: "oklch(0.55 0.07 50)",   // 不動産・建設 — トープ
  percent:  "oklch(0.55 0.08 100)",  // 金融 — ダークオリーブ
  flag:     "oklch(0.55 0.11 25)",   // 政策 — ブリック
  tag:      "oklch(0.45 0.06 260)",  // その他 — ネイビー
};
function ThemeGlyph({ theme, size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ display: "block" }}>
      {_TM_GLYPH_PATHS[_tmKind(theme)]}
    </svg>
  );
}

// テーマ枠内の銘柄プレート群。枠の実寸を測り、全プレートが縦にも横にも
// 収まる共通フォントサイズを算出する（長い銘柄名は文字を縮めて省略なしで表示）。
function TmPlates({ stocks, seed }) {
  const colRef = React.useRef(null);
  const indentFor = (pi) => (pi % 3) * 4; // %
  React.useLayoutEffect(() => {
    const col = colRef.current;
    if (!col) return;
    const fit = () => {
      const els = Array.from(col.children);
      const n = els.length;
      if (!n) return;
      const colH = col.clientHeight, colW = col.clientWidth;
      if (!colH || !colW) return;
      // 縦: 1行あたりの高さから上限フォントを決める（padding+line-heightで約1.95em）
      let fs = Math.min(14, Math.max(7, (colH / n) / 1.95));
      els.forEach(el => { el.style.fontSize = fs + "px"; });
      // 横: 最も溢れているプレートに合わせて全体を縮める
      let worst = 1;
      els.forEach((el, pi) => {
        const avail = colW * (1 - indentFor(pi) / 100) - 1;
        const nat = el.scrollWidth;
        if (nat > avail && avail > 0) worst = Math.max(worst, nat / avail);
      });
      if (worst > 1.001) {
        fs = Math.max(6, fs / worst);
        els.forEach(el => { el.style.fontSize = fs + "px"; });
      }
    };
    fit();
    let ro;
    if (typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(fit); ro.observe(col); }
    return () => { if (ro) ro.disconnect(); };
  }, [stocks]);
  return (
    <span ref={colRef} style={{
      display: "flex", flexDirection: "column",
      flex: 1, alignSelf: "stretch", minHeight: 0, minWidth: 0,
      justifyContent: "space-around", alignItems: "flex-start",
      overflow: "hidden", paddingTop: 1,
    }}>
      {stocks.map((p, pi) => (
        <span key={p.code} className="tm-plate" style={{
          animationDelay: `-${((seed * 0.73 + pi * 1.13) % 3).toFixed(2)}s`,
          marginLeft: `${indentFor(pi)}%`,
        }}>
          <span className="mono" style={{ color: "var(--muted)", fontSize: "0.82em", letterSpacing: "0.03em", flexShrink: 0 }}>{p.code}</span>
          <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{p.name}</span>
        </span>
      ))}
    </span>
  );
}

function ThemeHeatSection({ navigate }) {
  const rec = window.useRecentEntries ? window.useRecentEntries(7) : { entries: [] };
  const tally = useMPMemo(() => {
    const now = Date.now();
    const m = new Map();
    (rec.entries || []).forEach(e => {
      const t = e.detected_at ? new Date(e.detected_at).getTime() : now;
      if (isNaN(t) || now - t > 7 * 86400000) return;
      (e.themes || []).forEach(th => {
        const k = String(th).trim();
        if (!k) return;
        const cur = m.get(k) || { n: 0, stocks: [], seen: {} };
        cur.n++;
        const c = String(e.code || "");
        if (c && !cur.seen[c] && cur.stocks.length < 12) {
          cur.seen[c] = 1;
          cur.stocks.push({ code: c, name: e.name || c });
        }
        m.set(k, cur);
      });
    });
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  }, [rec.entries]);

  if (tally.length === 0) return null;
  const W = 100, H = 62;
  const rects = _tmSquarify(tally.map(([, d]) => d.n), 0, 0, W, H);

  return (
    <>
      <SectionHeader kicker="直近7日の検知をテーマ別に集計。面積が件数です" title="今週のテーマ勢力図"/>
      <style>{`
        @keyframes tmFloatA {
          0%, 100% { transform: translate(0, 1.5px) rotate(-0.6deg); }
          50%      { transform: translate(1.2px, -2.6px) rotate(0.7deg); }
        }
        @keyframes tmFloatB {
          0%, 100% { transform: translate(1px, -2px) rotate(0.5deg); }
          50%      { transform: translate(-1.2px, 2.2px) rotate(-0.7deg); }
        }
        .tm-plate {
          display: inline-flex; align-items: center; gap: 0.45em;
          box-sizing: border-box; flex-shrink: 0;
          background: rgba(255,255,255,0.93); color: var(--ink);
          padding: 0.24em 0.6em; border-radius: 0;
          line-height: 1.35; max-width: 100%;
          box-shadow: none;
        }
      `}</style>
      <div style={{ padding: "0 18px" }}>
        <div style={{ position: "relative", width: "100%", aspectRatio: "100 / 62", borderTop: "1px solid var(--ink)", boxSizing: "border-box", background: "var(--surface)" }}>
          {tally.map(([t, d], i) => {
            const r = rects[i];
            const n = d.n;
            const big  = r.w >= 30 && r.h >= 22;
            const tiny = r.w < 16 || r.h < 13;
            const plates = tiny ? [] : d.stocks;
            return (
              <button
                key={t}
                className="tappable"
                onClick={() => navigate("theme", t)}
                title={`${t}：${n}件`}
                style={{
                  position: "absolute",
                  left: `${(r.x / W) * 100}%`, top: `${(r.y / H) * 100}%`,
                  width: `${(r.w / W) * 100}%`, height: `${(r.h / H) * 100}%`,
                  boxSizing: "border-box", border: "1px solid var(--surface)",
                  background: _TM_KIND_COLORS[_tmKind(t)] || "var(--navy)",
                  cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                  padding: big ? "8px 10px" : tiny ? "3px 5px" : "5px 7px",
                  display: "flex", flexDirection: "column",
                  alignItems: "flex-start", justifyContent: "flex-start", gap: 3,
                  overflow: "hidden", minWidth: 0,
                  containerType: "size",
                }}
              >
                {big ? (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, maxWidth: "100%", minWidth: 0 }}>
                    <span style={{
                      width: 24, height: 24, borderRadius: 12, flexShrink: 0,
                      border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.14)",
                      display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
                    }}>
                      <ThemeGlyph theme={t} size={13}/>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.25, maxWidth: "100%",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>{t}</span>
                      <span className="mono" style={{ fontSize: 9.5, color: "rgba(255,255,255,0.8)", lineHeight: 1.1 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{n}</span> 件
                      </span>
                    </span>
                  </span>
                ) : (
                  <>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, maxWidth: "100%", minWidth: 0, color: "#fff" }}>
                      {!tiny && <span style={{ flexShrink: 0, opacity: 0.9 }}><ThemeGlyph theme={t} size={11}/></span>}
                      <span style={{
                        fontSize: tiny ? 9 : 10.5, fontWeight: 600, color: "#fff", lineHeight: 1.3,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0,
                      }}>{t}</span>
                      {!tiny && (
                        <span className="mono" style={{ fontSize: 8.5, color: "rgba(255,255,255,0.8)", flexShrink: 0 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{n}</span>件
                        </span>
                      )}
                    </span>
                  </>
                )}
                {plates.length > 0 && <TmPlates stocks={plates} seed={i}/>}
              </button>
            );
          })}
        </div>
        <div style={{ padding: "7px 0 3px", fontSize: 9.5, color: "var(--muted-2)" }}>
          テーマを押すと、そのテーマで動いた銘柄を一覧できます
        </div>
      </div>
    </>
  );
}

// 常連銘柄 — 直近1ヶ月で検知回数の多い銘柄
function RegularsSection({ navigate }) {
  const rec = window.useRecentEntries ? window.useRecentEntries(31) : { entries: [] };
  const regs = useMPMemo(() => {
    const now = Date.now();
    const m = new Map();
    (rec.entries || []).forEach(e => {
      const t = e.detected_at ? new Date(e.detected_at).getTime() : now;
      if (isNaN(t) || now - t > 31 * 86400000) return;
      const c = String(e.code);
      const cur = m.get(c);
      if (!cur) m.set(c, { count: 1, latest: e, t });
      else {
        cur.count++;
        if (t > cur.t) { cur.latest = e; cur.t = t; }
      }
    });
    return [...m.values()].filter(r => r.count >= 2)
      .sort((a, b) => b.count - a.count || b.t - a.t).slice(0, 5);
  }, [rec.entries]);

  if (regs.length === 0) return null;

  return (
    <>
      <SectionHeader kicker="直近1ヶ月で2回以上検知された銘柄" title="常連銘柄"/>
      <div style={{ borderTop: "1px solid var(--ink)" }}>
        {regs.map((r, i) => {
          let dateLbl = "";
          try {
            const d = new Date(r.t);
            if (!isNaN(d)) dateLbl = `${d.getMonth() + 1}/${d.getDate()}`;
          } catch (e) {}
          return (
            <button key={r.latest.code} className="tappable" onClick={() => navigate("stock", r.latest)} style={{
              width: "100%", display: "grid", gridTemplateColumns: "54px 1fr auto", gap: 10, alignItems: "center",
              padding: "11px 18px", textAlign: "left", cursor: "pointer",
              border: "none", background: "var(--surface)", fontFamily: "inherit",
              borderBottom: "1px solid var(--hairline)",
            }}>
              <div style={{ whiteSpace: "nowrap" }}>
                <span className="num-cond" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{r.count}</span>
                <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 2 }}>回</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{r.latest.code}</span>
                  <span style={{ fontFamily: "var(--f-head)", fontSize: 15, fontWeight: 900, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{_dispName(r.latest.name)}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>最後の検知 <span className="mono">{dateLbl}</span></div>
              </div>
              <span aria-hidden="true" style={{ fontSize: 15, color: "var(--muted)" }}>›</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function HomePage({ navigate }) {
  const live = window.useLiveData ? window.useLiveData() : { stocks: SURGE_STOCKS, newIds: new Set(), status: "fallback", lastUpdate: null };
  const stocks = useMPMemo(() => _todayStocks(live.stocks), [live.stocks]);
  const catData = useCategoryCounts();
  // 一面 = その日の急騰を前日比の大きい順に。トップ1・準トップ2・小記事4を大中小で組む。
  // 本日の検知がまだ無い（寄り付き前・休場日）ときは、直近の営業日の号を見せる
  const isToday = stocks.length > 0;
  const ordered = useMPMemo(() => {
    let pool = stocks;
    if (!pool.length) {
      const dated = (live.stocks || []).filter(s => s.detected_at);
      if (!dated.length) return [];
      const keys = dated.map(s => _toJstKey(s.detected_at)).filter(Boolean).sort();
      const lastKey = keys[keys.length - 1];
      pool = dated.filter(s => _toJstKey(s.detected_at) === lastKey);
    }
    const pctOf = s => { const p = _stockPct(s).pct; return p == null ? -Infinity : p; };
    return [...pool].sort((a, b) => pctOf(b) - pctOf(a)
      || String(b.detected_at || b.time || "").localeCompare(String(a.detected_at || a.time || "")));
  }, [stocks, live.stocks]);
  const issueLbl = (() => {
    if (isToday || !ordered[0]) return "本日";
    try {
      const { m, d } = _jstParts(ordered[0].detected_at);
      return `${m}月${d}日`;
    } catch (e) { return "直近"; }
  })();
  const lead = ordered[0] || null;
  const mids = ordered.slice(1, 3);
  const smalls = ordered.slice(3, 7);
  const isNew = s => !!(live.newIds && live.newIds.has(s.id));
  const goTheme = t => navigate("theme", t);
  const openStock = s => navigate("stock", s);
  const idxCats = catData.cats.filter(c => c.count > 0);

  return (
    <div className="page-enter">
      {/* 一面：その日の急騰 */}
      <section className="fp" aria-labelledby="fp-title">
        <div className="fp-head">
          <h1 id="fp-title" className="fp-title">
            {issueLbl}の急騰
            {ordered.length > 0 && <span className="fp-count"><span className="num-cond">{ordered.length}</span>銘柄</span>}
          </h1>
          <p className="fp-lede">
            急騰した銘柄の「なぜ上がったか」を、検知した時点で記録しています。
            {ordered.length > 0 && (isToday
              ? "前日比の大きい順に並べています。"
              : `本日の検知はまだないため、${issueLbl}の検知を前日比の大きい順に並べています。`)}
          </p>
        </div>

        {lead ? (
          <>
            <div className="fp-grid">
              <div className="fp-col-lead">
                <FrontStory stock={lead} size="lead" isNew={isNew(lead)} onOpen={openStock} onTheme={goTheme}/>
              </div>
              {mids.length > 0 && (
                <div className="fp-col-mid">
                  {mids.map((s, i) => (
                    <FrontStory key={s.id || s.code + i} stock={s} size="mid" isNew={isNew(s)} onOpen={openStock} onTheme={goTheme}/>
                  ))}
                </div>
              )}
            </div>
            {smalls.length > 0 && (
              <div className="fp-smalls">
                {smalls.map((s, i) => (
                  <FrontStory key={s.id || s.code + i} stock={s} size="small" isNew={isNew(s)} onOpen={openStock} onTheme={goTheme}/>
                ))}
              </div>
            )}
          </>
        ) : (
          <EmptySurges status={live.status}/>
        )}

        <div className="fp-actions">
          {isToday ? (
            <button className="btn btn-primary" onClick={() => navigate("surges")}>
              {`今日の急騰 ${ordered.length} 銘柄を一覧で見る`}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => navigate("archive")}>
              {issueLbl}の検知をアーカイブで見る
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => { _archiveUIStore.condOpen = true; navigate("archive"); }}>
            条件で絞り込む
          </button>
        </div>
      </section>

      {/* 特集：検知データの蓄積から */}
      <div className="hm-spread hm-spread--rev">
        <section className="hm-cell"><SlopeRankingSection navigate={navigate}/></section>
        <section className="hm-cell"><ThemeHeatSection navigate={navigate}/></section>
      </div>

      <div className="hm-spread hm-spread--even">
        <section className="hm-cell"><RegularsSection navigate={navigate}/></section>

        {/* 索引：急騰理由カテゴリ */}
        <section className="hm-cell">
          <SectionHeader title="急騰理由の索引" kicker="材料・テーマ別に、これまでの検知を引けます" more="カテゴリ一覧" onMore={() => navigate("cats")}/>
          <div style={{ padding: "0 18px", display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 22 }}>
            {idxCats.map(c => (
              <button key={c.key} onClick={() => navigate("category", c)} className="idx-row">
                <span style={{ fontWeight: 700 }}>{c.label}</span>
                <span className="idx-leader" aria-hidden="true"/>
                <span className="mono" style={{ fontWeight: 600 }}>{c.count}</span>
              </button>
            ))}
            {idxCats.length === 0 && (
              <div style={{ gridColumn: "1 / -1", fontSize: 12.5, color: "var(--muted)", padding: "6px 0" }}>集計しています…</div>
            )}
          </div>
        </section>
      </div>

      {/* 読み物：無料記事 */}
      <SectionHeader title="無料で読める急騰理由メモ"/>
      <div className="hm-articles">
        {FREE_ARTICLES.map((a, i) => (
          <article key={i} className="tappable" onClick={() => navigate("article", a)} style={{
            padding: "4px 18px 18px", cursor: "pointer",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 11.5, color: "var(--muted)" }}>
              <span className="mono">{a.date}</span>
              <span>無料</span>
              <span style={{ marginLeft: "auto" }}>{a.read}で読める</span>
            </div>
            <h3 style={{ margin: "6px 0 0", fontFamily: "var(--f-head)", fontWeight: 900, fontSize: 18, lineHeight: 1.45, fontFeatureSettings: '"palt"' }}>
              {a.name}　{a.reason}
            </h3>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{a.code}</div>
            <p style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.8 }}>{a.summary}</p>
            <div style={{ marginTop: 10, fontSize: 12.5, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 4 }}>
              続きを読む
            </div>
          </article>
        ))}
      </div>

      {/* 広告枠（PR）— ads-config.js でON/OFF */}
      {window.HomeScouterAd && <window.HomeScouterAd navigate={navigate}/>}

      {/* 定期購読のご案内 */}
      <SectionHeader title="定期購読のご案内" kicker="毎日の急騰理由メモは無料。資金の流れを続けて追う方向けの有料プランです"/>
      <PaidPromo navigate={navigate} />
      <PricingSection navigate={navigate} showHeader={false}/>

      {/* 広告帯（PR）— ads-config.js でON/OFF */}
      {window.FooterAdStrip && <window.FooterAdStrip navigate={navigate}/>}

      {/* Disclaimer + Footer */}
      <Disclaimer />
      <Footer navigate={navigate} />
    </div>
  );
}

// 有料会員向けレポートの案内 — 墨の面に白抜き
function PaidPromo({ navigate }) {
  return (
    <div style={{ padding: "4px 18px 0" }}>
      <div style={{ background: "var(--ink)", color: "#fff", padding: "24px 20px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--marker)" }}>有料会員限定</div>
        <h3 style={{ margin: "6px 0 0", fontFamily: "var(--f-head)", fontWeight: 900, fontSize: 26, lineHeight: 1.3 }}>
          資金流入レポート
        </h3>
        <p style={{ margin: "10px 0 16px", fontSize: 13, lineHeight: 1.85, color: "#C9CDD3", maxWidth: "36em" }}>
          日々の急騰背景を分類し、どのテーマに資金が流れているのかを、
          過去の急騰パターンと比べながら週ごとにまとめます。
        </p>
        <ul style={{
          listStyle: "none", padding: 0, margin: "0 0 20px",
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "8px 18px",
          fontSize: 13, color: "#E8EAED",
        }}>
          {[
            "今週の資金流入テーマ",
            "急騰理由ランキング",
            "過去データに基づくバックテスト分析",
            "注目されやすい材料テーマ",
            "急騰初動の特徴",
            "週次レポート",
            "過熱感のあるテーマの注意点",
          ].map(t => (
            <li key={t} style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
              <span aria-hidden="true" style={{ width: 7, height: 7, background: "var(--marker)", flexShrink: 0, transform: "translateY(-1px)" }}/>
              {t}
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-gold" onClick={() => navigate("report")} style={{ flex: "1 1 150px" }}>
            有料レポートを見る
          </button>
          <button className="btn" onClick={() => window.goPremiumCheckout ? window.goPremiumCheckout(navigate) : navigate("plan")} style={{
            flex: "1 1 150px", background: "transparent", color: "#fff",
            borderColor: "rgba(255,255,255,0.55)",
          }}>
            30日間無料で試す
          </button>
        </div>
      </div>
    </div>
  );
}

// Pricing
function PricingSection({ navigate, showHeader = true }) {
  return (
    <>
      {showHeader && <SectionHeader title="料金" kicker="プレミアムは初月無料。いつでも解約できます"/>}
      <div className="plan-grid" style={{ padding: "16px 18px 0", display: "grid", gap: 12 }}>
        <PlanCard
          name="無料プラン"
          price="¥0"
          per="ずっと無料"
          features={["今日の急騰理由メモ", "急騰理由カテゴリ", "アーカイブ（直近2営業日）"]}
          cta="このまま利用する"
        />
        <PlanCard
          highlight
          name="プレミアム"
          price="¥500"
          per="初月無料、以降は月額（税込）。いつでも解約可"
          features={[
            "資金流入レポート（週次）",
            "過去事例・継続率の分析",
            "急騰理由ランキング",
            "バックテスト分析",
            "過去データベース（全期間）",
          ]}
          cta="30日間無料で試す"
          onCta={() => window.goPremiumCheckout ? window.goPremiumCheckout(navigate) : navigate("plan")}
        />
      </div>
    </>
  );
}

function PlanCard({ name, price, per, features, cta, onCta, highlight }) {
  return (
    <div style={{
      background: "var(--surface)",
      border: highlight ? "2px solid var(--ink)" : "1px solid var(--hairline-strong)",
      padding: highlight ? "17px" : "18px",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ fontFamily: "var(--f-head)", fontWeight: 900, fontSize: 16 }}>{name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <span className="num-cond" style={{ fontSize: 46, fontWeight: 800, lineHeight: 1 }}>{price}</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{per}</span>
      </div>
      <ul style={{
        listStyle: "none", padding: 0, margin: "14px 0 16px",
        display: "grid", gap: 7, fontSize: 13, flex: 1, alignContent: "start",
      }}>
        {features.map(f => (
          <li key={f} style={{ display: "flex", alignItems: "baseline", gap: 9, color: "var(--ink-soft)" }}>
            <span aria-hidden="true" style={{ width: 7, height: 7, background: highlight ? "var(--marker)" : "var(--hairline-strong)", flexShrink: 0, transform: "translateY(-1px)" }}/>
            {f}
          </li>
        ))}
      </ul>
      <button onClick={onCta} className={`btn ${highlight ? "btn-primary" : "btn-secondary"}`} style={{ width: "100%" }}>
        {cta}
      </button>
    </div>
  );
}

function Disclaimer() {
  return (
    <div style={{
      margin: "36px 18px 0",
      paddingTop: 12,
      borderTop: "1px solid var(--hairline-strong)",
      fontSize: 11.5, lineHeight: 1.8, color: "var(--muted)",
      maxWidth: "52em",
    }}>
      <b style={{ color: "var(--ink-soft)", marginRight: 8 }}>免責事項</b>
      本サイトは、公開情報および過去データをもとにした情報整理・分析を目的としており、特定の金融商品の売買を推奨するものではありません。投資判断はご自身の責任で行ってください。
    </div>
  );
}

// 奥付
function Footer({ navigate }) {
  const links = [
    { label: "運営者情報" },
    { label: "特定商取引法に基づく表記", page: "legal" },
    { label: "プライバシーポリシー", page: "privacy" },
    { label: "免責事項" },
    { label: "お問い合わせ" },
  ];
  return (
    <footer style={{ margin: "28px 18px 0", padding: "16px 0 30px", borderTop: "3px solid var(--ink)", fontSize: 12, lineHeight: 1.9, color: "var(--ink-soft)" }}>
      <div style={{ fontFamily: "var(--f-head)", fontWeight: 900, fontSize: 20, color: "var(--ink)" }}>株価急騰要因メモ</div>
      <div style={{ margin: "8px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2H21l-6.55 7.485L22 22h-6.804l-5.323-6.965L3.74 22H1l7.01-8.013L1.5 2h6.93l4.814 6.367L18.244 2Zm-1.193 18.4h1.55L7.044 3.5H5.39L17.05 20.4Z"/></svg>
          @reasonshodou
      </div>
      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0", display: "flex", flexWrap: "wrap", gap: "2px 18px" }}>
        {links.map(l => (
          <li key={l.label}>
            <a
              href={l.page ? "/" + l.page : "#"}
              onClick={e => { e.preventDefault(); if (l.page && navigate) navigate(l.page); }}
              style={{ color: "inherit", textDecoration: l.page ? "underline" : "none", textUnderlineOffset: 3, cursor: l.page ? "pointer" : "default" }}
            >{l.label}</a>
          </li>
        ))}
      </ul>
      <div style={{ marginTop: 14, fontSize: 11, color: "var(--muted)" }}>
        © 2026 株価急騰要因メモ. All rights reserved.
      </div>
    </footer>
  );
}


// ===== SURGES (all today) =====
function SurgesPage({ navigate }) {
  const [sortBy, setSortBy] = usePState("time");
  const live = window.useLiveData ? window.useLiveData() : { stocks: SURGE_STOCKS, newIds: new Set(), status: "fallback" };
  const sorted = useMPMemo(() => {
    const arr = _todayStocks(live.stocks);
    if (sortBy === "pct")  arr.sort((a, b) => (b.pct ?? -Infinity) - (a.pct ?? -Infinity));
    if (sortBy === "time") arr.sort((a, b) => (b.detected_at || b.time || "").localeCompare(a.detected_at || a.time || ""));
    if (sortBy === "vol")  arr.sort((a, b) => {
      const f = v => v ? parseInt(String(v).replace(/[,万]/g, "")) : 0;
      return f(b.vol) - f(a.vol);
    });
    return arr;
  }, [sortBy, live.stocks]);

  const dateLabel = (() => {
    const d = new Date();
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  })();

  return (
    <div className="page-enter">
      <PageHeader
        title="今日の急騰銘柄"
        subtitle={`${dateLabel}、全 ${sorted.length} 件${live.status === "live" ? "（ライブ受信中）" : live.status === "fallback" ? "（サンプル表示）" : ""}`}
        onBack={() => navigate("home")}
      />

      {/* Sort */}
      <div style={{
        display: "flex", gap: 6, padding: "10px 14px",
        background: "var(--bg)", borderBottom: "1px solid var(--hairline)",
        position: "sticky", top: 0, zIndex: 5,
      }}>
        {[
          { k: "time", l: "時刻順" },
          { k: "pct", l: "上昇率順" },
          { k: "vol", l: "出来高順" },
        ].map(o => (
          <button key={o.k} onClick={() => setSortBy(o.k)} aria-pressed={sortBy === o.k} style={{
            padding: "6px 12px", fontSize: 12.5, fontWeight: sortBy === o.k ? 700 : 400,
            border: "1px solid " + (sortBy === o.k ? "var(--ink)" : "var(--hairline-strong)"),
            background: sortBy === o.k ? "var(--ink)" : "transparent",
            color: sortBy === o.k ? "var(--bg)" : "var(--ink)",
            cursor: "pointer",
          }}>{o.l}</button>
        ))}
      </div>

      <div style={{ background: "var(--surface)" }}>
        {sorted.length === 0 ? (
          <EmptySurges status={live.status}/>
        ) : sorted.map((s, i) => (
          <StockCard
            key={s.id || s.code + (s.time || i)}
            stock={s}
            idx={i}
            isNew={live.newIds && live.newIds.has(s.id)}
            onOpen={() => navigate("stock", s)}
          />
        ))}
      </div>
      <Disclaimer/>
    </div>
  );
}

// Empty state for when no live data has arrived yet
function EmptySurges({ status }) {
  // JSTで土日なら休場日表示に
  let isWeekend = false;
  try {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", weekday: "short" }).format(new Date());
    isWeekend = wd === "Sat" || wd === "Sun";
  } catch (e) {}
  return (
    <div style={{
      padding: "40px 24px", textAlign: "center",
      background: "var(--surface)",
    }}>
      <div style={{
        width: 48, height: 48, margin: "0 auto 14px",
        border: "1px solid var(--hairline-strong)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "var(--muted-2)",
      }}>
        {status === "live"
          ? <span className="live-dot" style={{ width: 8, height: 8 }}/>
          : <span className="mono" style={{ fontSize: 18 }}>·</span>}
      </div>
      <div style={{ fontFamily: "var(--f-head)", fontSize: 20, fontWeight: 900, marginBottom: 6, color: "var(--ink)" }}>
        {status === "live" ? (isWeekend ? "本日は休場日" : "新しい急騰検知を待機中") : "データ未到着"}
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
        {status === "live"
          ? (isWeekend
            ? "東証の取引は平日のみ。次の営業日の検知をお待ちください。"
            : "銘柄が検知されると、ここに表示されます。")
          : "site-config.js に Supabase の接続情報を設定してください。"}
      </div>
    </div>
  );
}


// related_stocks テキストをパース
// 例: "(3641: パピレス — 説明文)" の行が改行区切りで並ぶ
 // AI が書き直しの途中経過（「（除外）」「正しくは下記へ差し替え」など）を残すことがあるので、その行は出さない
const _RELATED_JUNK = /除外|削除|差し替え|誤記載|比較対象外|該当なし/;

function _parseRelatedStocks(text) {
  if (!text) return [];
  const seen = new Set();
  return String(text)
    .split(/\n+/)
    .map(line => {
      let s = line.trim();
      if (!s) return null;
      s = s.replace(/^\(/, "").replace(/\)$/, "");
      const m = s.match(/^([0-9]{3,4}[A-Za-z]?)\s*[:：]\s*(.+)$/);
      if (!m) return null;
      const parts = m[2].split(/\s*[—–―]\s*/);
      const item = {
        code: m[1],
        name: (parts[0] || "").trim(),
        desc: parts.slice(1).join(" — ").trim(),
      };
      // 同じ銘柄の2回目以降と、書き直しの跡が残った行は落とす
      if (seen.has(item.code) || _RELATED_JUNK.test(item.name + item.desc)) return null;
      seen.add(item.code);
      return item;
    })
    .filter(Boolean);
}

// ===== STOCK DETAIL =====

function StockDetailPage({ stock, navigate, goBack }) {
  const live = window.useLiveData ? window.useLiveData() : { stocks: SURGE_STOCKS };
  const wl = window.useWatchlist ? window.useWatchlist() : { has: () => false, toggle: () => {} };
  if (!stock) stock = live.stocks[0] || SURGE_STOCKS[0];
  const watched = wl.has(stock.code);
  const hasPrice  = stock.pct !== null && stock.pct !== undefined;
  const hasChart  = !!stock.chart_url;
  const hasSpark  = Array.isArray(stock.spark) && stock.spark.length > 0;
  const businessText    = stock.business || `${stock.reason}を受けた買い。出来高は前日比で大きく増加し、寄り付き直後から売り買い拮抗の場面なく一方向の値動きに。関連テーマ（${(stock.themes || []).join(" / ")}）への連想買いも観測。`;
  const backgrounds = Array.isArray(stock.backgrounds) ? stock.backgrounds : [];
  const relatedStocks = _parseRelatedStocks(stock.related_stocks);
  // 同一銘柄の過去検知履歴（古い順）
  const hist = window.useStockHistory ? window.useStockHistory(stock.code) : { entries: [] };
  const histEntries = hist.entries || [];
  // 今回のエントリが何番目か（id → detected_at の順で照合、なければ最新扱い）
  let histCurIdx = stock.id != null ? histEntries.findIndex(e => e.id === stock.id) : -1;
  if (histCurIdx < 0 && stock.detected_at) histCurIdx = histEntries.findIndex(e => e.detected_at === stock.detected_at);
  if (histCurIdx < 0) histCurIdx = histEntries.length - 1;
  const histMultiYear = new Set(histEntries.map(e => String(e.detected_at || "").slice(0, 4))).size > 1;
  // 過去回へのリンクは有料会員限定（非会員はプラン頁へ誘導）
  const histAuth = window.useAuth ? window.useAuth() : { enabled: false, paid: true };
  const histGated = !!(histAuth.enabled && !histAuth.paid);

  // 同じテーマを持つ他銘柄（実際にテーマが重なるものだけ、重なりの多い順）
  const _normTheme = t => String(t).trim();
  const myThemes = new Set((stock.themes || []).map(_normTheme));
  const _themeSeen = new Set([String(stock.code)]);
  const _themePool = [];
  [
    ...(live.stocks || []),
    ...(live.status === "live" ? [] : (window.SAMPLE_ARCHIVE || [])),
  ].forEach(s => {
    const c = String(s.code);
    if (_themeSeen.has(c)) return;
    _themeSeen.add(c);
    _themePool.push(s);
  });
  const themeMatches = _themePool
    .map(s => ({ s, common: (s.themes || []).map(_normTheme).filter(t => myThemes.has(t)) }))
    .filter(m => m.common.length > 0)
    .sort((a, b) => b.common.length - a.common.length)
    .slice(0, 3);

  const _sdSurge = stock.surge_price ?? stock.price ?? null;
  const _sdCur   = stock.current_price ?? null;
  const _sdPct = (_sdSurge != null && _sdCur != null && Number(_sdSurge) > 0)
    ? ((Number(_sdCur) - Number(_sdSurge)) / Number(_sdSurge)) * 100 : null;
  const _sdPctColor = _sdPct == null ? "var(--muted-2)"
    : _sdPct > 0 ? "var(--up)" : _sdPct < 0 ? "var(--down)" : "var(--muted)";

  return (
    <div className="page-enter">
      <PageHeader title="銘柄詳細" onBack={goBack || (() => navigate("home"))}/>
      <header style={{ padding: "20px 18px 16px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 12, color: "var(--muted)" }}>
          <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>{stock.code}</span>
          <span>{stock.market || "東"}証</span>
          {stock.time && (
            <span style={{ marginLeft: "auto" }}>
              {(() => {
                try {
                  if (!stock.detected_at) return stock.time + " JST";
                  const p = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric" }).format(new Date(stock.detected_at));
                  return p + " " + stock.time + " JST 検知";
                } catch (e) { return stock.time + " JST"; }
              })()}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginTop: 8 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--f-head)", fontSize: 30, fontWeight: 900, lineHeight: 1.25, fontFeatureSettings: '"palt"', flex: 1, minWidth: 0 }}>
            {_dispName(stock.name)}
          </h1>
          <button
            onClick={() => wl.toggle(stock)}
            aria-pressed={watched}
            aria-label={watched ? "ウォッチリストから外す" : "ウォッチリストに追加"}
            style={{
              flexShrink: 0, marginTop: 4,
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "7px 11px", cursor: "pointer",
              background: watched ? "var(--marker)" : "transparent",
              color: "var(--ink)",
              border: "1px solid " + (watched ? "var(--marker)" : "var(--ink)"),
              fontSize: 12, fontWeight: 700, fontFamily: "inherit",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24"
              fill={watched ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/>
            </svg>
            {watched ? "ウォッチ中" : "ウォッチ"}
          </button>
        </div>

        {/* リード：急騰理由 */}
        {(stock.reason || stock.cat) && (
          <p style={{ margin: "12px 0 0", fontFamily: "var(--f-head)", fontWeight: 700, fontSize: 18, lineHeight: 1.75, maxWidth: "34em" }}>
            <span className="marker">{stock.reason || stock.cat}</span>
          </p>
        )}

        {hasPrice ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 14 }}>
            <span className="num-cond" style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>¥{stock.price.toLocaleString()}</span>
            <PctChip pct={stock.pct} size="lg"/>
          </div>
        ) : (_sdSurge == null || _sdCur == null) && (
          <div style={{ marginTop: 14, fontSize: 12.5, fontWeight: 700, color: "var(--up)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className="live-dot"/>
            急騰検知
          </div>
        )}

        {/* 急騰時 → 現在の値動き */}
        {_sdSurge != null && _sdCur != null && (
          <dl style={{
            margin: "16px 0 0", display: "grid", gridTemplateColumns: _sdPct != null ? "1fr 1fr 1fr" : "1fr 1fr",
            borderTop: "1px solid var(--ink)", borderBottom: "1px solid var(--hairline)",
          }}>
            <div style={{ padding: "9px 0 10px" }}>
              <dt style={{ fontSize: 11, color: "var(--muted)" }}>急騰時</dt>
              <dd className="mono" style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700 }}>¥{_fmtPrice(_sdSurge)}</dd>
            </div>
            <div style={{ padding: "9px 0 10px 12px", borderLeft: "1px solid var(--hairline)" }}>
              <dt style={{ fontSize: 11, color: "var(--muted)" }}>現在</dt>
              <dd className="mono" style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700 }}>¥{_fmtPrice(_sdCur)}</dd>
            </div>
            {_sdPct != null && (
              <div style={{ padding: "9px 0 10px 12px", borderLeft: "1px solid var(--hairline)" }}>
                <dt style={{ fontSize: 11, color: "var(--muted)" }}>急騰時から</dt>
                <dd className="mono" style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 700, color: _sdPctColor }}>
                  {_sdPct > 0 ? "+" : ""}{_sdPct.toFixed(1)}%
                </dd>
              </div>
            )}
          </dl>
        )}

        {/* Chart — ライブ画像、もしくはサンプルのスパークライン */}
        <div style={{ marginTop: 16 }}>
          {hasChart ? (
            <img src={stock.chart_url} alt={`${stock.name} の急騰チャート`} loading="lazy" style={{
              width: "100%", display: "block", height: "auto",
              border: "1px solid var(--hairline)", background: "#fff",
            }}/>
          ) : hasSpark ? (
            <div style={{ background: "var(--surface)", border: "1px solid var(--hairline)", padding: "8px 6px" }}>
              <Sparkline points={stock.spark} color={stock.pct >= 0 ? "var(--up)" : "var(--down)"} w={325} h={70}/>
            </div>
          ) : (
            <div style={{
              padding: "20px 12px", background: "var(--surface-sub)",
              fontSize: 12, color: "var(--muted)", textAlign: "center",
            }}>
              チャート画像を読み込み中…
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "var(--muted)", flexWrap: "wrap" }}>
          {stock.vol && <span>出来高 <span className="mono" style={{ color: "var(--ink)" }}>{stock.vol}</span></span>}
          {stock.time && <span>更新 <span className="mono" style={{ color: "var(--ink)" }}>{stock.time}</span></span>}
          {(stock.cat || stock.reason) && <span>カテゴリ <span style={{ color: "var(--ink)" }}>{stock.cat || stock.reason}</span></span>}
        </div>
      </header>

      {stock.business && (
        <>
          <SectionHeader kicker="会社概要" title="事業内容"/>
          <div style={{ padding: "0 18px" }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.9, color: "var(--ink-soft)", maxWidth: "38em" }}>
              {stock.business}
            </p>
          </div>
        </>
      )}

      <SectionHeader kicker="本日の整理" title="なぜ上がったのか"/>
      <div style={{ padding: "0 18px", maxWidth: "40em" }}>
        {!stock.business && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.9, color: "var(--ink-soft)" }}>
            {businessText}
          </p>
        )}
        {backgrounds.length > 0 && (
          <ul style={{ margin: !stock.business ? "10px 0 0" : 0, padding: "0 0 0 18px", fontSize: 14, lineHeight: 1.9, color: "var(--ink-soft)" }}>
            {backgrounds.map((b, i) => <li key={i} style={{ marginBottom: 2 }}>{b}</li>)}
          </ul>
        )}
        {stock.themes && stock.themes.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {stock.themes.map(t => (
              <button key={t} className="tappable" onClick={() => navigate("theme", String(t).trim())} style={{
                fontSize: 12, color: "var(--ink-soft)",
                border: "1px solid var(--hairline-strong)",
                padding: "3px 9px", background: "transparent",
                fontFamily: "inherit", cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 4,
              }}>
                {t}<span aria-hidden="true" style={{ color: "var(--muted-2)", fontSize: 10 }}>›</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 広告枠（PR）— 理由を読み終えたところに置く。ads-config.js でON/OFF */}
      {window.ScouterPromoCard && <window.ScouterPromoCard navigate={navigate} stock={stock}/>}

      {histEntries.length >= 2 && (
        <>
          <SectionHeader kicker="同一銘柄の検知履歴" title={`${histCurIdx + 1}回目の登場`}/>
          <div style={{ margin: "0 18px", borderTop: "1px solid var(--ink)", background: "var(--surface)" }}>
            {histEntries.map((e, i) => {
              const isCur = i === histCurIdx;
              const locked = histGated && !isCur;
              const go = () => locked ? navigate("plan") : navigate("stock", e);
              let dateStr = "";
              try {
                dateStr = new Intl.DateTimeFormat("ja-JP", {
                  timeZone: "Asia/Tokyo",
                  ...(histMultiYear ? { year: "numeric" } : {}),
                  month: "long", day: "numeric",
                }).format(new Date(e.detected_at));
              } catch (err) {}
              return (
                <div key={e.id || i}
                  className={isCur ? undefined : "tappable"}
                  role={isCur ? undefined : "button"}
                  tabIndex={isCur ? undefined : 0}
                  onClick={isCur ? undefined : go}
                  onKeyDown={isCur ? undefined : (ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(); } })}
                  style={{
                  padding: "10px 14px 11px 12px",
                  borderTop: i > 0 ? "1px solid var(--hairline)" : "none",
                  background: isCur ? "var(--marker-soft)" : "transparent",
                  borderLeft: "3px solid " + (isCur ? "var(--marker)" : "transparent"),
                  cursor: isCur ? "default" : "pointer",
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: isCur ? "var(--navy)" : "var(--muted)" }}>
                      {i + 1}回目
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{dateStr}</span>
                    {isCur && (
                      <span style={{
                        fontSize: 10.5, color: "var(--ink)", fontWeight: 700,
                      }}>今回</span>
                    )}
                    {!isCur && locked && (
                      <span style={{
                        fontSize: 9.5, color: "var(--gold)", border: "1px solid var(--gold)",
                        padding: "0 5px", letterSpacing: "0.1em", whiteSpace: "nowrap",
                      }}>会員限定</span>
                    )}
                    <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontSize: 9.5, color: "var(--muted-2)", letterSpacing: "0.06em" }}>急騰時</span>
                      <span className="mono" style={{ fontSize: 12.5, fontWeight: 600 }}>
                        {e.surge_price != null ? "¥" + Math.round(e.surge_price).toLocaleString() : "—"}
                      </span>
                      {!isCur && <span aria-hidden="true" style={{ fontSize: 12, color: "var(--muted-2)", alignSelf: "center" }}>›</span>}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.7, color: "var(--ink-soft)", marginTop: 3 }}>
                    {locked ? "過去の検知メモは有料会員限定です。押すと会員プランを開きます" : e.reason}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <SectionHeader kicker="リアルチャート" title="現在の値動き"/>
      {stock.code && window.RealChart && (
        <window.RealChart
          code={stock.code}
          surgeAt={stock.detected_at || null}
          surgePrice={stock.surge_price ?? stock.price ?? null}
        />
      )}


      {/* 関連銘柄（分析フローが抽出した連想銘柄） */}
      {relatedStocks.length > 0 && (
        <>
          <SectionHeader kicker="関連銘柄" title="連想で動きやすい銘柄"/>
          <div style={{
            background: "var(--surface)",
            borderTop: "1px solid var(--hairline)",
            borderBottom: "1px solid var(--hairline)",
          }}>
            {relatedStocks.map((r, i) => (
              <div key={r.code + i} style={{
                padding: "11px 14px",
                borderBottom: i < relatedStocks.length - 1 ? "1px solid var(--hairline)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: r.desc ? 4 : 0 }}>
                  <span className="mono" style={{
                    fontSize: 10.5, color: "var(--muted)",
                    border: "1px solid var(--hairline-strong)",
                    padding: "0 5px", letterSpacing: "0.04em", flexShrink: 0,
                  }}>{r.code}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{r.name}</span>
                </div>
                {r.desc && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.65 }}>
                    {r.desc}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {themeMatches.length > 0 && (
        <>
          <SectionHeader kicker="関連テーマ" title="同じテーマで動いた銘柄"/>
          <div style={{ padding: "0 18px 10px", fontSize: 12, color: "var(--muted)" }}>
            黄色の札が、この銘柄と共通するテーマです
          </div>
          <div style={{ background: "var(--surface)", borderTop: "1px solid var(--hairline)", borderBottom: "1px solid var(--hairline)" }}>
            {themeMatches.map((m, i) => (
              <StockCard
                key={m.s.id || m.s.code}
                stock={m.s}
                idx={i}
                highlightThemes={new Set(m.common)}
                onOpen={() => navigate("stock", m.s)}
                onTheme={t => navigate("theme", t)}
              />
            ))}
          </div>
        </>
      )}

      {/* Paid teaser */}
      <div style={{ padding: "28px 18px 0" }}>
        <div style={{
          background: "var(--ink)", color: "#fff",
          padding: "18px 18px",
        }}>
          <div className="eyebrow" style={{ color: "var(--marker)", marginBottom: 8 }}>有料会員限定</div>
          <div style={{ fontSize: 14, lineHeight: 1.75, color: "#C9CDD3" }}>
            この急騰パターンの過去事例（n=214）と、テーマ別の継続率を見る
          </div>
          <button className="btn btn-gold tappable" style={{ width: "100%", marginTop: 12 }} onClick={() => navigate("report")}>
            資金流入レポートで見る
          </button>
        </div>
      </div>

      <Disclaimer/>
    </div>
  );
}


// ===== CATEGORIES =====
function CategoriesPage({ navigate }) {
  const catData = useCategoryCounts();
  const subtitle = catData.ready
    ? `アーカイブ全 ${catData.total} 件から材料・テーマを分類`
    : "材料・テーマで読み解く";
  return (
    <div className="page-enter">
      <PageHeader title="急騰理由カテゴリ" subtitle={subtitle}/>
      <div className="cats-grid" style={{ padding: "8px 18px 0" }}>
        {catData.cats.map(c => {
          const max = Math.max(1, ...catData.cats.map(x => x.count || 0));
          const share = catData.total > 0 ? Math.round((c.count / catData.total) * 100) : 0;
          return (
            <button key={c.key} onClick={() => navigate("category", c)} className="cat-row">
              <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: "var(--f-head)", fontSize: 18, fontWeight: 900 }}>{c.label}</span>
                <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 4 }}>
                  <span className="num-cond" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{c.count}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>件</span>
                </span>
              </span>
              <span aria-hidden="true" style={{ display: "block", height: 6, background: "var(--hairline)", marginTop: 8 }}>
                <span style={{ display: "block", height: "100%", width: `${(c.count / max) * 100}%`, background: "var(--ink)" }}/>
              </span>
              <span style={{ display: "block", marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
                {catData.ready ? `検知全体の ${share}%` : "集計しています…"}
              </span>
              {c.recent && c.recent.length > 0 && (
                <span style={{ display: "block", marginTop: 8, fontSize: 13, lineHeight: 1.7, color: "var(--ink-soft)" }}>
                  <span style={{ color: "var(--muted)", marginRight: 8 }}>最近</span>
                  {c.recent.map((e, i) => (
                    <span key={e.code}>{i > 0 && "、"}{_dispName(e.name)}</span>
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Disclaimer/>
    </div>
  );
}


// ===== REPORT helpers =====
// 急騰理由テキストを定型カテゴリに分類
function _classifyReason(reason) {
  const r = String(reason || "");
  if (!r) return "その他";
  if (/TOB|M&A|MBO|公開買付/i.test(r)) return "TOB・M&A";
  if (/上方修正|業績予想.*上方|上振れ/.test(r)) return "上方修正";
  if (/増配|配当.*増|連続増配/.test(r)) return "増配";
  if (/好決算|決算/.test(r)) return "好決算";
  if (/受注|出荷|納入/.test(r)) return "受注・出荷好調";
  if (/防衛|原発|原子力|政策|補助金|規制/.test(r)) return "政策テーマ";
  if (/月次|売上.*好調|過去最高|入園|販売.*過去|回復/.test(r)) return "月次・販売好調";
  if (/発表|契約|公開|報道|ライセンス|提携|資本/.test(r)) return "材料発表";
  if (/価格.*上昇|値上げ|市況/.test(r)) return "市況・価格上昇";
  return "その他";
}

// ── JST 日付ユーティリティ ────────────────────────────────
// 重要: 以前は `d.getTime() + (9*60 - d.getTimezoneOffset())*60000` で
// JST 換算していたが、getTimezoneOffset() は「ブラウザの」オフセットを返すため、
// 日本(JST)端末では +18時間ずれて 15時以降が翌日扱いになっていた。
// timeZone を明示できる Intl で求め直す（端末のタイムゾーンに依存しない）。
const _JST_DTF = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
});
// iso(またはDate) → { y, m, d }（すべて数値, m は 1-12）
function _jstParts(iso) {
  const parts = _JST_DTF.formatToParts(iso instanceof Date ? iso : new Date(iso));
  const o = {};
  for (const p of parts) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year, m: o.month, d: o.day };
}

// JST の YYYY-MM-DD を返す
function _toJstKey(iso) {
  try {
    const { y, m, d } = _jstParts(iso);
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  } catch (e) { return null; }
}

// MM.DD で表示
function _fmtMD(iso) {
  try {
    const { m, d } = _jstParts(iso);
    return `${m}.${d}`;
  } catch (e) { return ""; }
}

// ISO 週番号
function _isoWeek(iso) {
  try {
    const { y, m, d } = _jstParts(iso);
    // ISO week: Thursday-based
    const t = new Date(Date.UTC(y, m - 1, d));
    const dayNum = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dayNum + 3);
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return week;
  } catch (e) { return null; }
}

// アーカイブから集計：
//   - テーマ : 今週分（最新エントリから過去7日分）
//   - 急騰理由: アーカイブ全件
function _useThisWeekStats(entries) {
  return useMPMemo(() => {
    const list = (entries || []).filter(e => e && e.detected_at);
    if (list.length === 0) return null;
    // 最新日 = anchor
    const sorted = [...list].sort((a, b) => new Date(b.detected_at) - new Date(a.detected_at));
    const anchorIso = sorted[0].detected_at;
    const anchor = new Date(anchorIso);
    const start = new Date(anchor.getTime() - 7 * 86400000);

    const week = sorted.filter(e => {
      const d = new Date(e.detected_at);
      return d > start && d <= anchor;
    });
    // テーマ用プール（今週分、足りなければ直近20件で代用）
    const themePool = week.length >= 3 ? week : sorted.slice(0, Math.min(20, sorted.length));
    const total = themePool.length;

    // テーマ集計
    const themeMap = {};
    themePool.forEach(e => {
      (e.themes || []).forEach(t => {
        const k = String(t).trim();
        if (!k) return;
        themeMap[k] = (themeMap[k] || 0) + 1;
      });
    });
    const themes = Object.entries(themeMap)
      .map(([name, count]) => ({ name, count, pct: total > 0 ? (count / total) * 100 : 0 }))
      .sort((a, b) => b.count - a.count || b.pct - a.pct)
      .slice(0, 7)
      .map((t, i) => ({ ...t, rank: i + 1, hot: i === 0 }));

    // 急騰理由集計（今週分）
    const reasonMap = {};
    themePool.forEach(e => {
      const k = _classifyReason(e.reason || e.cat);
      reasonMap[k] = (reasonMap[k] || 0) + 1;
    });
    const reasonTotal = Object.values(reasonMap).reduce((a, b) => a + b, 0) || 1;
    const reasons = Object.entries(reasonMap)
      .map(([name, count]) => ({ name, count, pct: (count / reasonTotal) * 100 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      total,
      weekTotal: week.length,
      reasonTotal: sorted.length,
      anchorIso,
      startIso: start.toISOString(),
      themes,
      reasons,
      isFallback: week.length < 3,
    };
  }, [entries]);
}

// ===== REPORT (paid dashboard) =====
function ReportPage(props) {
  const Gate = window.PayGate;
  const Body = window.WeeklyReportBody || ReportPageInner;
  if (!Gate) return <Body {...props}/>;
  return (
    <Gate dark label="週次レポート" navigate={props.navigate}>
      <Body {...props}/>
    </Gate>
  );
}

function ReportPageInner({ navigate }) {
  const archive = window.useArchive ? window.useArchive({ pageSize: 80 }) : { entries: window.SAMPLE_ARCHIVE || [] };
  const stats = _useThisWeekStats(archive.entries);

  // 表示用ヘッダー値
  const weekNo  = stats ? _isoWeek(stats.anchorIso) : null;
  const dateRng = stats ? `${_fmtMD(stats.startIso)} — ${_fmtMD(stats.anchorIso)}` : "";

  const flowThemes = stats ? stats.themes : (window.FLOW_THEMES || []).map((t, i) => ({
    ...t, pct: t.change, rank: t.rank, hot: t.hot,
  }));
  const reasonRank = stats ? stats.reasons : (window.REASON_RANK || []).map(r => ({
    ...r, pct: 0,
  }));

  return (
    <div className="page-enter" style={{ background: "#17191E", color: "#E8EAED", minHeight: "100%" }}>
      <div style={{
        padding: "14px 16px 6px",
        background: "var(--navy-deep)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky", top: 0, zIndex: 5,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => navigate("home")} className="tappable" style={{
            background: "transparent", border: "none", color: "#A3A7AE",
            cursor: "pointer", padding: 4,
          }}>‹ ホーム</button>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <span className="live-dot"/>
            <span className="mono" style={{ fontSize: 10, color: "#A3A7AE", letterSpacing: "0.1em" }}>JST 14:42 更新</span>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="eyebrow" style={{ color: "var(--marker)", letterSpacing: "0.22em" }}>
            有料会員限定 · WEEKLY
          </div>
          <h1 className="mincho" style={{
            margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "#fff",
            letterSpacing: "0.02em",
          }}>資金流入レポート</h1>
          <div style={{ fontSize: 11.5, color: "#A3A7AE", marginTop: 4 }}>
            {stats
              ? <>第 {weekNo} 週 · {dateRng} · 集計対象 <span className="mono">{stats.total}</span> 件{stats.isFallback && <span style={{ color: "#7D828B" }}> · 直近データで代用</span>}</>
              : "集計データを読み込み中..."}
          </div>
        </div>
      </div>

      {/* TOP: Theme flow rank */}
      <DashSection title="今週の資金流入テーマ" kicker="WEEKLY · THEME SHARE">
        <div style={{ fontSize: 10.5, color: "#7D828B", marginBottom: 8, letterSpacing: "0.04em" }}>
          今週検知された急騰銘柄のテーマタグ出現率 ／ 件数
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {flowThemes.length === 0 && (
            <div style={{ fontSize: 11.5, color: "#7D828B", padding: "12px 0" }}>
              今週は集計対象がありません。
            </div>
          )}
          {flowThemes.map(t => {
            const max = Math.max(...flowThemes.map(x => x.pct), 1);
            const w = (t.pct / max) * 100;
            return (
              <div key={t.rank + "-" + t.name} style={{
                display: "grid", gridTemplateColumns: "26px 1fr 92px",
                alignItems: "center", gap: 10,
                padding: "8px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <span className="mono" style={{
                  fontSize: 11, color: t.rank <= 3 ? "var(--marker)" : "#7D828B",
                  fontWeight: 600, letterSpacing: "0.06em",
                }}>{String(t.rank).padStart(2,"0")}</span>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{t.name}</span>
                    {t.hot && <span style={{
                      fontSize: 9, padding: "1px 4px",
                      background: "var(--up)", color: "#fff", letterSpacing: "0.08em",
                    }}>HOT</span>}
                  </div>
                  <div style={{
                    marginTop: 6, height: 3, background: "rgba(255,255,255,0.06)",
                    position: "relative",
                  }}>
                    <div style={{
                      position: "absolute", left: 0, top: 0, bottom: 0,
                      width: w + "%",
                      background: t.rank <= 3 ? "var(--marker)" : "#4A4E56",
                    }}/>
                  </div>
                </div>
                <div style={{ textAlign: "right", lineHeight: 1.25 }}>
                  <div className="mono" style={{ fontSize: 13, color: "#ff8a8f", fontWeight: 600 }}>
                    {t.pct.toFixed(1)}%
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "#7D828B" }}>
                    {t.count}件
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DashSection>

      {/* Reason ranking + heatmap-ish bar */}
      <DashSection title="急騰理由ランキング" kicker="REASON · DISTRIBUTION">
        <div style={{ fontSize: 10.5, color: "#7D828B", marginBottom: 8, letterSpacing: "0.04em" }}>
          検知された急騰理由をカテゴリ分類した分布 ／ 件数
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {reasonRank.length === 0 && (
            <div style={{ fontSize: 11.5, color: "#7D828B", padding: "12px 0" }}>
              今週は集計対象がありません。
            </div>
          )}
          {reasonRank.map(r => {
            const max = Math.max(...reasonRank.map(x => x.count), 1);
            const w = (r.count / max) * 100;
            return (
              <div key={r.name} style={{ display: "grid", gridTemplateColumns: "1fr 76px", gap: 8, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12.5, marginBottom: 4 }}>{r.name}</div>
                  <div style={{ height: 6, background: "rgba(255,255,255,0.06)", position: "relative" }}>
                    <div style={{
                      position: "absolute", inset: 0, width: w + "%",
                      background: "linear-gradient(90deg, var(--marker), #FFE14D)",
                    }}/>
                  </div>
                </div>
                <div style={{ textAlign: "right", lineHeight: 1.25 }}>
                  <div className="mono" style={{ fontSize: 12.5, color: "#fff", fontWeight: 600 }}>
                    {r.pct.toFixed(1)}%
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: "#7D828B" }}>
                    {r.count}件
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </DashSection>

      {/* Backtest */}
      <DashSection title="バックテスト分析" kicker="BACKTEST · n>40">
        <div style={{ display: "grid", gap: 10 }}>
          {BACKTEST_CARDS.map((b, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "12px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span className="mincho" style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{b.title}</span>
                <span className="mono" style={{
                  fontSize: 9.5, color: "var(--marker)", marginLeft: "auto",
                  border: "1px solid rgba(255,225,77,0.4)", padding: "1px 5px",
                  letterSpacing: "0.08em",
                }}>{b.period}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, lineHeight: 1.7, color: "#C9CDD3" }}>
                {b.note}
              </p>
              <div className="mono" style={{ fontSize: 10, color: "#7D828B", marginTop: 8 }}>
                {b.detail}
              </div>
            </div>
          ))}
        </div>
      </DashSection>

      {/* Watch themes */}
      <DashSection title="来週注目されやすいテーマ候補" kicker="WATCHLIST">
        <div style={{ fontSize: 10.5, color: "#A3A7AE", marginBottom: 10, lineHeight: 1.7 }}>
          ※ 売買推奨ではなく、ウォッチ対象として整理しています。
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {WATCH_THEMES.map(t => (
            <div key={t.name} style={{
              padding: "10px 12px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderLeft: `2px solid ${t.level === "注意" ? "var(--up)" : "var(--marker)"}`,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.name}</div>
                <div style={{ fontSize: 11, color: "#A3A7AE" }}>{t.note}</div>
              </div>
              <span className="mono" style={{
                fontSize: 9.5, padding: "2px 6px", letterSpacing: "0.1em",
                color: t.level === "注意" ? "var(--up)" : "var(--marker)",
                border: `1px solid ${t.level === "注意" ? "rgba(215,51,42,0.5)" : "rgba(255,225,77,0.5)"}`,
              }}>{t.level}</span>
            </div>
          ))}
        </div>
      </DashSection>

      {/* Overheat */}
      <DashSection title="過熱感のあるテーマ" kicker="OVERHEAT NOTICE">
        <div style={{
          padding: "12px 14px",
          background: "rgba(215,51,42,0.08)",
          border: "1px solid rgba(215,51,42,0.25)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 9.5, padding: "1px 5px", letterSpacing: "0.1em",
              background: "var(--up)", color: "#fff",
            }}>NOTE</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>AI関連の一部に短期過熱</span>
          </div>
          <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7, color: "#C9CDD3" }}>
            出来高が直近20日平均の3倍を超え、信用買い残比率も上昇。短期反落の事例が過去比率で増加傾向。情報整理のための注意点であり、判断は読み手に委ねます。
          </p>
        </div>
      </DashSection>

      {/* Footer disclaimer in dark variant */}
      <div style={{
        margin: "20px 16px 24px",
        padding: "12px 14px",
        background: "rgba(255,255,255,0.03)",
        borderLeft: "2px solid #4A4E56",
        fontSize: 10.5, lineHeight: 1.8, color: "#A3A7AE",
      }}>
        <div style={{ fontSize: 9.5, color: "#C9CDD3", letterSpacing: "0.16em", fontWeight: 600, marginBottom: 4 }}>
          DISCLAIMER
        </div>
        本レポートは、公開情報および過去データをもとにした情報整理・分析を目的としており、特定の金融商品の売買を推奨するものではありません。投資判断はご自身の責任で行ってください。
      </div>
    </div>
  );
}

function DashSection({ title, kicker, children }) {
  return (
    <section style={{ padding: "18px 16px 6px" }}>
      <div className="eyebrow" style={{ color: "#7D828B", marginBottom: 4 }}>{kicker}</div>
      <h2 className="mincho" style={{
        margin: "0 0 12px", fontSize: 17, fontWeight: 600,
        color: "#fff", letterSpacing: "0.02em",
      }}>{title}</h2>
      {children}
    </section>
  );
}


// ===== LEGAL: 特定商取引法に基づく表記（枠のみ・記載内容は公開時に記入） =====
// 決済導入の審査で求められる標準項目を網羅した骨組み。
// 値は TOKUSHOHO_ITEMS の value を書き換えるだけで反映される。
const _TBD = null; // 未記入マーカー
const TOKUSHOHO_ITEMS = [
  { label: "販売事業者",       value: "森谷心" },
  { label: "運営統括責任者",   value: "森谷心" },
  { label: "所在地",           value: "請求があった場合、遅滞なく開示します。" },
  { label: "電話番号",         value: "請求があった場合、遅滞なく開示します。お問い合わせはメールにて承ります。" },
  { label: "メールアドレス",   value: "senguxin@gmail.com" },
  { label: "販売URL",          value: "https://kyuutoumemo.com" },
  { label: "販売価格",         value: "プレミアム会員 月額500円（税込）" },
  { label: "商品代金以外の必要料金", value: "インターネット接続にかかる通信費はお客様のご負担となります。" },
  { label: "お支払い方法",     value: "クレジットカード決済（Stripe）" },
  { label: "お支払い時期",     value: "初回申込時に課金され、1ヶ月ごとに自動更新されます。" },
  { label: "サービス提供時期", value: "決済完了後、直ちにご利用いただけます。" },
  { label: "解約について",     value: "会員プランページの「お支払い・解約の管理」からいつでも解約できます。解約後も次回更新日の前日までご利用いただけます。" },
  { label: "返品・返金について", value: "デジタルコンテンツの性質上、提供開始後の返金には対応しておりません。" },
  { label: "動作環境",         value: "最新版の主要ブラウザ（Chrome / Safari / Edge 等）" },
];

function LegalPage({ navigate, goBack }) {
  return (
    <div className="page-enter">
      <PageHeader title="特定商取引法に基づく表記" onBack={goBack || (() => navigate("home"))}/>
      <div style={{ padding: "16px 14px 6px" }}>
        <p style={{ margin: 0, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.8 }}>
          特定商取引法第11条（通信販売についての広告）に基づき、以下のとおり表示します。
        </p>
      </div>
      <div style={{
        margin: "12px 14px 0",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
      }}>
        {TOKUSHOHO_ITEMS.map((item, i) => (
          <div key={item.label} style={{
            display: "grid", gridTemplateColumns: "108px 1fr",
            borderTop: i > 0 ? "1px solid var(--hairline)" : "none",
          }}>
            <div style={{
              padding: "11px 12px",
              background: "var(--surface-sub)",
              borderRight: "1px solid var(--hairline)",
              fontSize: 11, fontWeight: 600, color: "var(--ink-soft)",
              lineHeight: 1.6, letterSpacing: "0.02em",
            }}>{item.label}</div>
            <div style={{ padding: "11px 12px", minWidth: 0 }}>
              {item.value ? (
                <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.7 }}>{item.value}</div>
              ) : (
                <div style={{
                  fontSize: 11.5, color: "var(--muted-2)",
                  border: "1px dashed var(--hairline-strong)",
                  padding: "5px 8px", lineHeight: 1.6,
                }}>—</div>
              )}
              {item.note && (
                <div style={{ fontSize: 10, color: "var(--muted-2)", lineHeight: 1.6, marginTop: 5 }}>
                  {item.note}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 14px 0", fontSize: 10, color: "var(--muted-2)", lineHeight: 1.7 }}>
        ※ 当サイトは情報の記録・整理を目的としたサービスであり、投資助言・売買推奨を行うものではありません。
      </div>
      <Disclaimer/>
      <Footer navigate={navigate}/>
    </div>
  );
}


// ===== PRIVACY: プライバシーポリシー =====
// 広告配信（Google AdSense 等）の審査で必要な項目を含む。
// 実装と食い違わないよう、サイトが実際に扱う情報だけを記載している。
const PRIVACY_UPDATED = "2026年11月4日";  // アクセス解析の項を同日追加
const PRIVACY_SECTIONS = [
  {
    h: "取得する情報と利用目的",
    p: [
      "当サイトは、会員登録・ログインの際にメールアドレスを取得します。ログインコードの送信、会員状態の確認、お問い合わせへの回答のために利用し、それ以外の目的には利用しません。",
      "有料プランのお支払いは決済代行サービス Stripe を通じて行われます。クレジットカード番号などの決済情報は Stripe が管理し、当サイトが受け取ったり保存したりすることはありません。",
    ],
  },
  {
    h: "ブラウザへの保存",
    p: [
      "ウォッチリスト、ランキングの表示期間などの設定、チャートデータの一時保存のために、お使いのブラウザのローカルストレージを利用します。これらの情報はお使いの端末内にのみ保存され、当サイトのサーバーには送信されません。ブラウザの設定から削除できます。",
    ],
  },
  {
    h: "アクセス解析について",
    p: [
      "当サイトは、利用状況を把握してサイトを改善するために、Google アナリティクスを利用しています。Google アナリティクスは Cookie を使用して、閲覧したページや滞在時間などの情報を収集します。この情報は匿名で収集され、個人を特定するものではありません。",
      "収集を望まない場合は、ブラウザの Cookie を無効にするか、Google アナリティクス オプトアウト アドオン（https://tools.google.com/dlpage/gaoptout）を利用してください。データの扱いについては「Google のサービスを使用するサイトやアプリから収集した情報の Google による使用」（https://policies.google.com/technologies/partner-sites）をご確認ください。",
    ],
  },
  {
    h: "広告の配信について",
    p: [
      "当サイトは、第三者配信の広告サービス（Google AdSense 等）を利用することがあります。広告配信事業者は、ユーザーの興味に応じた広告を表示するために Cookie を使用することがあります。Cookie により当サイトや他サイトへのアクセス情報が利用されることがありますが、氏名・住所・メールアドレスなど個人を特定する情報は含まれません。",
      "Google による Cookie の利用は、Google の広告設定（https://adssettings.google.com）でパーソナライズ広告を無効にできます。また、www.aboutads.info にアクセスすれば、第三者配信事業者の Cookie を無効にできます。Google による情報の扱いについては「Google のポリシーと規約」（https://policies.google.com/technologies/ads）をご確認ください。",
    ],
  },
  {
    h: "アフィリエイトについて",
    p: [
      "当サイトは、アフィリエイトプログラム（マネックス証券 等）に参加しており、「PR」と表示したリンクを経由して商品・サービスの申込みがあった場合に報酬を受け取ることがあります。リンク先での取引条件は、各提供元の表示をご確認ください。",
    ],
  },
  {
    h: "第三者への提供",
    p: [
      "取得した個人情報は、法令に基づく場合を除き、ご本人の同意なく第三者に提供しません。",
    ],
  },
  {
    h: "免責事項",
    p: [
      "当サイトの情報は、公開情報および過去データをもとに整理したものであり、正確性・完全性を保証するものではありません。特定の金融商品の売買を推奨するものではなく、投資判断はご自身の責任で行ってください。当サイトの情報を利用したことによる損害について、当サイトは責任を負いません。",
      "当サイトからリンクしている外部サイトの内容について、当サイトは責任を負いません。",
    ],
  },
  {
    h: "お問い合わせ",
    p: [
      "本ポリシーおよび個人情報の取り扱いに関するお問い合わせは、下記までご連絡ください。",
      "運営者：森谷心　メール：senguxin@gmail.com",
    ],
  },
  {
    h: "改定",
    p: [
      "本ポリシーの内容は、必要に応じて予告なく変更することがあります。変更後の内容は、このページに掲載した時点から効力を生じます。",
    ],
  },
];

function PrivacyPage({ navigate, goBack }) {
  return (
    <div className="page-enter">
      <PageHeader title="プライバシーポリシー" subtitle={`${PRIVACY_UPDATED} 制定`} onBack={goBack || (() => navigate("home"))}/>
      <div style={{ padding: "6px 18px 0", maxWidth: "42em" }}>
        <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.9, color: "var(--ink-soft)" }}>
          株価急騰要因メモ（以下「当サイト」）は、利用者の情報を以下のとおり取り扱います。
        </p>
        {PRIVACY_SECTIONS.map(sec => (
          <section key={sec.h} style={{ marginTop: 28 }}>
            <h2 style={{
              margin: 0, paddingTop: 10, borderTop: "2px solid var(--ink)",
              fontFamily: "var(--f-head)", fontWeight: 900, fontSize: 18, lineHeight: 1.4,
            }}>{sec.h}</h2>
            {sec.p.map((t, i) => (
              <p key={i} style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.9, color: "var(--ink-soft)" }}>{t}</p>
            ))}
          </section>
        ))}
      </div>
      <Footer navigate={navigate}/>
    </div>
  );
}

// ===== PLAN PAGE =====
function PlanPage({ navigate, goBack }) {
  const auth = window.useAuth ? window.useAuth() : { enabled: false, paid: false };
  const isPaid = !!(auth.enabled && auth.paid);
  return (
    <div className="page-enter">
      <PageHeader title="会員プラン" onBack={goBack || (() => navigate("home"))}/>
      {window.PaywallAccount && <window.PaywallAccount navigate={navigate}/>}
      {isPaid ? (
        <div style={{ padding: "16px 14px 6px" }}>
          <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
            プレミアム会員としてすべてのコンテンツをご利用いただけます。<br/>
            お支払い方法の変更・解約は上の「お支払い・解約の管理」から行えます。
          </p>
        </div>
      ) : (
        <>
          <div style={{ padding: "16px 14px 6px" }}>
            <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
              毎日の急騰理由メモは無料でご覧いただけます。<br/>
              資金の流れを継続的に追いかけたい方向けに、有料プランをご用意しています。
            </p>
          </div>
          <PricingSection navigate={navigate}/>
        </>
      )}
      <Disclaimer/>
      <Footer navigate={navigate}/>
    </div>
  );
}


// ===== ARTICLE =====
function ArticlePage({ article, navigate, goBack }) {
  if (!article) article = FREE_ARTICLES[0];
  return (
    <div className="page-enter">
      <PageHeader title="無料記事" onBack={goBack || (() => navigate("home"))}/>
      <div style={{ padding: "18px 18px 8px", background: "var(--surface)", borderBottom: "1px solid var(--hairline)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, color: "var(--muted)", fontSize: 11 }}>
          <span className="mono">{article.date}</span>
          <span style={{ border: "1px solid var(--hairline-strong)", padding: "0 4px", fontSize: 9.5, letterSpacing: "0.08em" }}>無料</span>
          <span className="mono" style={{ marginLeft: "auto" }}>{article.read}で読める</span>
        </div>
        <h1 className="mincho" style={{ margin: 0, fontSize: 22, lineHeight: 1.5, fontWeight: 700, letterSpacing: "0.02em" }}>
          {article.name} ・ {article.reason}
        </h1>
        <div className="mono" style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
          銘柄コード {article.code}
        </div>
      </div>
      <div style={{ padding: "18px 18px 4px" }}>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.95, color: "var(--ink-soft)" }}>
          {article.summary}
        </p>
        <p style={{ margin: "14px 0 0", fontSize: 13.5, lineHeight: 1.95, color: "var(--ink-soft)" }}>
          過去の類似事例では、初動から3営業日以内に出来高がピークアウトする傾向。継続性は個別の材料に依存します。詳細な分類とパターン比較は資金流入レポートで整理しています。
        </p>
      </div>
      <div style={{ padding: "20px 14px 0" }}>
        <button className="btn btn-primary tappable" onClick={() => navigate("report")} style={{ width: "100%" }}>
          資金流入レポートで深掘りする
        </button>
      </div>
      <Disclaimer/>
    </div>
  );
}


// ===== CATEGORY DETAIL =====
function CategoryPage({ cat, navigate, goBack }) {
  if (!cat) cat = CATEGORIES[0];
  const live = window.useLiveData ? window.useLiveData() : { stocks: SURGE_STOCKS };
  // Filter live stocks loosely by category label match
  const filtered = (live.stocks || []).filter(s =>
    !cat.label ||
    (s.reason && s.reason.includes(cat.label)) ||
    (s.themes && s.themes.some(t => t.includes(cat.label) || cat.label.includes(t)))
  );
  const showStocks = filtered.length > 0 ? filtered : (live.stocks || []).slice(0, 6);

  return (
    <div className="page-enter">
      <PageHeader title={cat.label} subtitle={`${showStocks.length} 件 表示中`} onBack={goBack || (() => navigate("cats"))}/>
      <div style={{ padding: "12px 14px 4px" }}>
        <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
          「{cat.label}」を背景に動いた銘柄を整理しています。
          過去事例との比較・継続率の分析は <span style={{ color: "var(--navy)", fontWeight: 600 }}>資金流入レポート</span>（有料）でご覧いただけます。
        </p>
      </div>
      <div style={{ background: "var(--surface)", marginTop: 8, borderTop: "1px solid var(--hairline)", borderBottom: "1px solid var(--hairline)" }}>
        {showStocks.map((s, i) => (
          <StockCard key={s.id || s.code} stock={s} idx={i} onOpen={() => navigate("stock", s)}/>
        ))}
      </div>
      <Disclaimer/>
    </div>
  );
}


// PageHeader
function PageHeader({ title, subtitle, onBack }) {
  return (
    <div style={{ padding: "12px 18px 14px", background: "var(--bg)", borderBottom: "1px solid var(--ink)" }}>
      {onBack && (
        <button onClick={onBack} style={{
          background: "transparent", border: "none",
          color: "var(--ink-soft)", cursor: "pointer", padding: "4px 0",
          fontSize: 13, fontWeight: 700,
        }}>‹ 戻る</button>
      )}
      <h1 style={{
        margin: onBack ? "4px 0 0" : "6px 0 0",
        fontFamily: "var(--f-head)", fontSize: 24, fontWeight: 900, lineHeight: 1.3,
        fontFeatureSettings: '"palt"',
      }}>{title}</h1>
      {subtitle && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{subtitle}</div>
      )}
    </div>
  );
}

Object.assign(window, {
  HomePage, SurgesPage, StockDetailPage, CategoriesPage,
  ReportPage, PlanPage, ArticlePage, CategoryPage,
  ArchivePage, WatchlistPage, LegalPage, PrivacyPage,
  Disclaimer, Footer, PageHeader, EmptySurges,
});


// ============================================================
// ARCHIVE — Notion / Supabase に蓄積された全履歴を日付別に整理
// ============================================================
const _WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

function _formatDateKey(iso) {
  if (!iso) return "—";
  // JST 換算してから YYYY-MM-DD を返す（端末TZに依存しない）
  return _toJstKey(iso) || ((iso || "").slice(0, 10) || "—");
}

function _parseDateKey(key) {
  // key = "YYYY-MM-DD" を Date オブジェクトに（JST正午で固定）
  if (!key || key === "—") return null;
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1, 3, 0, 0)); // JST正午相当
}

function _todayKey() {
  const d = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}

function _formatDateLabel(key) {
  // "2026-05-20" → "5月20日（水）"
  const d = _parseDateKey(key);
  if (!d) return key || "—";
  const w = ["日", "月", "火", "水", "木", "金", "土"][d.getUTCDay()];
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${w}）`;
}

// "YYYY-MM-DD" を days 日ずらした "YYYY-MM-DD" を返す
function _shiftDate(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// 急騰時→現在の変化率（%）。データ不足は null
 function _entryPctChange(e) {
  const sp = e.surge_price ?? e.price ?? null;
  const cp = e.current_price ?? null;
  if (sp == null || cp == null || Number(sp) <= 0) return null;
  return ((Number(cp) - Number(sp)) / Number(sp)) * 100;
}

// 選択日が今日（JST）以降なら true（「翌日」ボタンの無効化用）
function _isTodayOrLater(key) {
  const now = new Date(Date.now() + 9 * 3600000);
  const todayKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  return key >= todayKey;
}

// ── ミニカレンダー（アーカイブの日付選択用） ──
function MiniCalendar({ value, onChange, onClose }) {
  const initial = (() => {
    const d = value ? _parseDateKey(value) : new Date();
    return new Date(d.getUTCFullYear ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 3) : Date.UTC(d.getFullYear(), d.getMonth(), 1, 3));
  })();
  const [view, setView] = usePState(initial);
  const year  = view.getUTCFullYear();
  const month = view.getUTCMonth();

  const firstDow    = new Date(Date.UTC(year, month, 1, 3)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 3)).getUTCDate();
  const todayKey    = _todayKey();
  const pad = n => String(n).padStart(2, "0");
  const mkKey = d => `${year}-${pad(month + 1)}-${pad(d)}`;

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const goPrev = () => setView(new Date(Date.UTC(year, month - 1, 1, 3)));
  const goNext = () => setView(new Date(Date.UTC(year, month + 1, 1, 3)));
  const ymLabel = `${year}年${month + 1}月`;

  // 当月の日付ごとの急騰件数
  const dateCounts = window.useDateCounts ? window.useDateCounts(year, month) : {};

  // PC では絞り込みページが縦に長く、position:absolute inset:0 だと
  // ページ全体の中央＝画面外に出てしまう。PCは fixed（ビューポート基準）、
  // スマホ(iPhone枠内)は従来どおり absolute にする。
  const _desktop = typeof window !== "undefined"
    && window.matchMedia && window.matchMedia("(min-width: 1000px)").matches;

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: _desktop ? "fixed" : "absolute", inset: 0, zIndex: 9999,
        background: "rgba(8, 12, 22, 0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, animation: "fadeUp .18s ease-out both",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 340,
          background: "var(--bg)",
          border: "1px solid var(--hairline-strong)",
          padding: "14px 12px 12px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 10,
        }}>
          <button onClick={goPrev} className="tappable" aria-label="前の月" style={{
            border: "1px solid var(--hairline-strong)", background: "var(--surface)",
            cursor: "pointer", padding: "4px 12px", fontSize: 13, lineHeight: 1,
            color: "var(--ink)",
          }}>‹</button>
          <div className="mincho" style={{
            fontSize: 14, fontWeight: 600, color: "var(--ink)", letterSpacing: "0.04em",
          }}>{ymLabel}</div>
          <button onClick={goNext} className="tappable" aria-label="次の月" style={{
            border: "1px solid var(--hairline-strong)", background: "var(--surface)",
            cursor: "pointer", padding: "4px 12px", fontSize: 13, lineHeight: 1,
            color: "var(--ink)",
          }}>›</button>
        </div>

        {/* Weekday row */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
          marginBottom: 4,
        }}>
          {["日", "月", "火", "水", "木", "金", "土"].map((w, i) => (
            <div key={w} style={{
              textAlign: "center", fontSize: 9.5, letterSpacing: "0.08em",
              padding: "4px 0",
              color: i === 0 ? "var(--up)" : i === 6 ? "var(--navy)" : "var(--muted-2)",
            }}>{w}</div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2,
        }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={i} style={{ aspectRatio: "1" }}/>;
            const k          = mkKey(d);
            const isToday    = k === todayKey;
            const isSelected = k === value;
            const isFuture   = k > todayKey;
            const dow        = (firstDow + d - 1) % 7;
            const dowColor   = dow === 0 ? "var(--up)" : dow === 6 ? "var(--navy)" : "var(--ink)";
            const cnt        = dateCounts[k] || 0;
            return (
              <button
                key={i}
                disabled={isFuture}
                onClick={() => { onChange(k); onClose(); }}
                className="tappable"
                style={{
                  position: "relative",
                  aspectRatio: "1",
                  border: "1px solid " + (isSelected ? "var(--navy)" : isToday ? "var(--ink)" : "var(--hairline)"),
                  background: isSelected ? "var(--navy)" : "var(--surface)",
                  color: isSelected ? "#fff" : isFuture ? "var(--muted-2)" : dowColor,
                  fontSize: 12.5,
                  fontWeight: isToday || isSelected ? 700 : 400,
                  cursor: isFuture ? "default" : "pointer",
                  opacity: isFuture ? 0.35 : 1,
                  fontVariantNumeric: "tabular-nums",
                  padding: 0,
                  display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 1,
                }}
              >
                <span style={{ lineHeight: 1 }}>{d}</span>
                {cnt > 0 && !isFuture && (
                  <span
                    className="mono"
                    style={{
                      fontSize: 8.5, lineHeight: 1,
                      letterSpacing: "0.02em",
                      color: isSelected ? "rgba(255,255,255,0.85)" : "var(--up)",
                      fontWeight: 600,
                    }}
                  >({cnt})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: "flex", alignItems: "center",
          fontSize: 9.5, color: "var(--muted)",
          letterSpacing: "0.04em",
          marginTop: 10, marginBottom: 8,
          gap: 4,
        }}>
          <span className="mono" style={{ color: "var(--up)", fontWeight: 600 }}>(N)</span>
          <span>= 急騰銘柄数</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onClose} className="btn btn-secondary tappable" style={{ flex: 1 }}>
            キャンセル
          </button>
          <button
            onClick={() => { onChange(todayKey); onClose(); }}
            className="btn btn-primary tappable"
            style={{ flex: 1 }}
          >今日</button>
        </div>
      </div>
    </div>
  );

  // マウント先:
  //  - PC: document.body 直下に portal し、position:fixed をビューポート基準にする
  //    （.page-enter の transform や列の高さに引きずられて画面外に出るのを防ぐ）
  //  - スマホ: iOSフレーム内の .app に portal して absolute センタリング
  let mountNode = null;
  if (typeof document !== "undefined") {
    mountNode = _desktop ? document.body : document.querySelector(".app");
  }
  if (mountNode && ReactDOM && ReactDOM.createPortal) {
    return ReactDOM.createPortal(modal, mountNode);
  }
  return modal;
}

function ArchivePage({ navigate }) {
  const archive = window.useArchive ? window.useArchive({ pageSize: 60 }) : {
    entries: window.SAMPLE_ARCHIVE || [], total: (window.SAMPLE_ARCHIVE || []).length,
    status: "fallback", hasMore: false, loading: false, loadMore: () => {},
  };
  const [q, setQ] = useArchiveState("q", "");
  const [themeFilter, setThemeFilter] = useArchiveState("themeFilter", null);
  const [selectedDate, setSelectedDate] = useArchiveState("selectedDate", null); // "YYYY-MM-DD"（初期化後は常に設定）
  const [calOpen, setCalOpen] = usePState(false);

  // 条件検索（急騰時からの変化率）
  const [condOpen, setCondOpen] = useArchiveState("condOpen", false);
  const [pctVal, setPctVal]     = useArchiveState("pctVal", "");    // 閾値（%）文字列
  const [pctDir, setPctDir]     = useArchiveState("pctDir", "gte"); // gte=以上 / lte=以下
  const [condScope, setCondScope] = useArchiveState("condScope", "all"); // all=全期間 / day=表示中の日
  const [condType, setCondType]   = useArchiveState("condType", "pct");  // pct=変化率 / dip=押し目付近
  const pctActive = condType === "pct" && pctVal !== "" && !Number.isNaN(Number(pctVal));
  // 押し目付近はワンタップ抽出（数値指定なし）。タブを選んだ時点で有効。
  const dipActive = condType === "dip";
  const condActive = pctActive || dipActive;
  const searchActive = q.trim() !== "";
  // 検索欄に入力があるとき、または全期間条件検索のときは、
  // 当日だけでなく読み込み済みの全日付を横断して検索する
  const globalMode = searchActive || (condActive && condScope === "all");

  // 全期間検索・条件検索のあいだは、未読込の過去分を自動で全件読み込む
  // （「さらに過去分を読み込む」を押さなくても過去のヒットがそのまま出るように）
  React.useEffect(() => {
    if (globalMode && archive.hasMore && !archive.loading) {
      archive.loadMore();
    }
  }, [globalMode, archive.hasMore, archive.loading]);

  // データがあると分かっている日付キー（新しい順）— 前日/翌日のスキップに使用
  const knownKeys = useMPMemo(() => {
    const s = new Set();
    (archive.entries || []).forEach(e => {
      const k = _formatDateKey(e.detected_at);
      if (k) s.add(k);
    });
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [archive.entries]);

  // ペイウォール: 無料は「データのある直近2営業日」のみ（日曜→木金、月曜→金月、祝日も自動対応）
  const auth = window.useAuth ? window.useAuth() : { enabled: false, paid: true };
  const gated = !!(auth.enabled && !auth.paid);
  const freeSet = useMPMemo(() => new Set(knownKeys.slice(0, 2)), [knownKeys]);

  // 初期表示: データのある最新日
  React.useEffect(() => {
    if (!selectedDate && knownKeys.length > 0) setSelectedDate(knownKeys[0]);
  }, [knownKeys, selectedDate]);

  // 選択日のデータ取得
  const dateView = window.useArchiveByDate
    ? window.useArchiveByDate(selectedDate)
    : { entries: [], loading: false, status: "idle" };

  // 前日・翌日ナビ（既知のデータあり日へスキップ、なければ ±1 日）
  const goPrevDay = () => {
    if (!selectedDate) return;
    const older = knownKeys.find(k => k < selectedDate);
    setSelectedDate(older || _shiftDate(selectedDate, -1));
  };
  const goNextDay = () => {
    if (!selectedDate) return;
    const newer = [...knownKeys].reverse().find(k => k > selectedDate);
    if (newer) setSelectedDate(newer);
    else if (!_isTodayOrLater(selectedDate)) setSelectedDate(_shiftDate(selectedDate, 1));
  };
  const nextDisabled = !selectedDate || _isTodayOrLater(selectedDate);

  // テーマ chip 候補: 出現頻度トップ8
  const topThemes = useMPMemo(() => {
    const source = globalMode ? (archive.entries || []) : (dateView.entries || []);
    const counts = {};
    source.forEach(e => {
      (e.themes || []).forEach(t => {
        if (!t) return;
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [archive.entries, dateView.entries, selectedDate, globalMode]);

  // 押し目フィルタ以外（テーマ・検索・変化率）を先に適用
  const preDip = useMPMemo(() => {
    const needle = q.trim();
    const source = globalMode ? (archive.entries || []) : (dateView.entries || []);
    const threshold = pctActive ? Number(pctVal) : null;
    return source.filter(e => {
      if (gated && !freeSet.has(_formatDateKey(e.detected_at))) return false;
      if (themeFilter && !(e.themes || []).some(t => t === themeFilter)) return false;
      if (needle && !_entryMatchesQuery(e, needle)) return false;
      if (threshold != null) {
        const pct = _entryPctChange(e);
        if (pct == null) return false;
        if (pctDir === "gte" ? pct < threshold : pct > threshold) return false;
      }
      return true;
    });
  }, [archive.entries, dateView.entries, globalMode, q, themeFilter, pctActive, pctVal, pctDir]);

  // 押し目スキャン対象（コード重複除去）
  const dipCandidates = useMPMemo(() => {
    if (!dipActive) return [];
    const seen = new Set(); const out = [];
    for (const e of preDip) {
      const c = e && e.code != null ? String(e.code) : "";
      if (!c || seen.has(c)) continue;
      seen.add(c); out.push({ code: c, detected_at: e.detected_at, current_price: e.current_price });
    }
    return out;
  }, [preDip, dipActive]);

  const dipScan = window.useArchiveDipScan
    ? window.useArchiveDipScan(dipCandidates, dipActive)
    : { status: "idle", byCode: {}, nonce: 0 };

  // 押し目付近フィルタ:「急騰後に一度乖離(armed) → いま押し目ゾーン → 調整入りしていない」で最終フィルタ
  const filtered = useMPMemo(() => {
    if (!dipActive) return preDip;
    const match = window.dipZoneMatch;
    return preDip.filter(e => {
      const sig = dipScan.byCode[String(e.code)];
      return (sig && match) ? match(sig) : false;
    });
  }, [preDip, dipActive, dipScan.nonce]);

  // 表示中の日の中では時刻降順
  const dayItems = useMPMemo(() => {
    return [...filtered].sort((a, b) => (b.detected_at || "").localeCompare(a.detected_at || ""));
  }, [filtered]);

  // 全期間モード用: 日付別グループ（新しい順）
  const grouped = useMPMemo(() => {
    if (!globalMode) return [];
    const map = new Map();
    filtered.forEach(e => {
      const key = _formatDateKey(e.detected_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    for (const items of map.values()) {
      items.sort((a, b) => (b.detected_at || "").localeCompare(a.detected_at || ""));
    }
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items }));
  }, [filtered, globalMode]);

  const condLabel = pctActive
    ? `急騰時から ${Number(pctVal) > 0 && pctDir === "gte" ? "+" : ""}${Number(pctVal)}% ${pctDir === "gte" ? "以上" : "以下"}`
    : dipActive
      ? "押し目付近"
      : null;
  const clearCond = () => { setPctVal(""); setCondType("pct"); };

  const totalLabel = dayItems.length;
  const statusNote = dateView.status === "live" ? "Supabase連携中"
    : dateView.status === "connecting" ? "読み込み中…"
    : dateView.status === "error" ? "接続エラー"
    : dateView.status === "fallback" ? "サンプル表示"
    : (archive.status === "connecting" ? "読み込み中…" : "サンプル表示");

  return (
    <div className="page-enter" style={{ position: "relative" }}>
      <PageHeader
        title="急騰履歴アーカイブ"
        subtitle={
          globalMode
            ? `${condActive ? "条件検索" : "全期間検索"}（全期間）· ${filtered.length} 件ヒット · 読み込み済み ${(archive.entries || []).length} 件が対象`
            : selectedDate
              ? `${_formatDateLabel(selectedDate)} · ${totalLabel} 件 · ${statusNote}`
              : "読み込み中…"
        }
        onBack={() => navigate("home")}
      />

      {window.ArchivePayNotice && <window.ArchivePayNotice navigate={navigate}/>}
      {gated && selectedDate && !globalMode && !freeSet.has(selectedDate) && (
        <div style={{ margin: "10px 14px 0", padding: "14px 12px", background: "var(--surface)", border: "1px solid var(--hairline)", textAlign: "center" }}>
          <div className="eyebrow" style={{ color: "var(--gold)", letterSpacing: "0.22em", marginBottom: 6 }}>有料会員限定</div>
          <div style={{ fontSize: 12.5, color: "var(--ink)", marginBottom: 10, lineHeight: 1.7 }}>この日のアーカイブは会員の方のみご覧いただけます</div>
          <button className="btn btn-gold tappable" onClick={() => navigate("plan")} style={{ fontSize: 12, padding: "8px 16px" }}>会員プランを見る</button>
        </div>
      )}
      <div style={{
        background: "var(--bg)", borderBottom: "1px solid var(--hairline)",
        padding: "10px 14px 8px",
      }}>
        <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
          <div style={{
            flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6,
            background: "var(--surface)", border: "1px solid var(--hairline-strong)",
            padding: "6px 10px",
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--muted-2)" strokeWidth="1.8" style={{ flexShrink: 0 }}>
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
            <input
              id="archive-search"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="コード・銘柄名・キーワードで検索"
              style={{
                flex: 1, border: "none", outline: "none", background: "transparent",
                fontSize: 12.5, color: "var(--ink)", fontFamily: "inherit", minWidth: 0,
              }}
            />
            {q && (
              <button onClick={() => setQ("")} style={{
                background: "transparent", border: "none", color: "var(--muted-2)",
                cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1,
              }}>×</button>
            )}
          </div>
          <button
            onClick={() => setCalOpen(true)}
            className="tappable"
            aria-label="カレンダーで日付を選択"
            style={{
              flexShrink: 0,
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 10px",
              border: "1px solid " + (selectedDate ? "var(--navy)" : "var(--hairline-strong)"),
              background: selectedDate ? "var(--navy)" : "var(--surface)",
              color: selectedDate ? "#fff" : "var(--ink)",
              cursor: "pointer",
              fontSize: 11.5, letterSpacing: "0.04em",
              fontFamily: "inherit",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="17" rx="1"/>
              <path d="M3 9h18M8 2v4M16 2v4"/>
            </svg>
            <span>日付</span>
          </button>
          <button
            onClick={() => setCondOpen(o => !o)}
            className="tappable"
            aria-label="条件で絞り込み"
            style={{
              flexShrink: 0,
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "6px 10px",
              border: "1px solid " + (condActive || condOpen ? "var(--navy)" : "var(--hairline-strong)"),
              background: condActive ? "var(--navy)" : "var(--surface)",
              color: condActive ? "#fff" : (condOpen ? "var(--navy)" : "var(--ink)"),
              cursor: "pointer",
              fontSize: 11.5, letterSpacing: "0.04em",
              fontFamily: "inherit",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z"/>
            </svg>
            <span>条件</span>
          </button>
        </div>

        {/* 条件検索パネル */}
        {condOpen && (
          <div style={{
            marginTop: 8,
            border: "1px solid var(--hairline-strong)",
            background: "var(--surface)",
            padding: "10px 12px",
          }}>
            <div className="eyebrow" style={{ color: "var(--navy)", marginBottom: 10 }}>条件で絞り込む</div>
            <div style={{ display: "flex", marginBottom: 10 }}>
              {[["pct", "変化率"], ["dip", "押し目付近"]].map(([v, label]) => (
                <button key={v} onClick={() => setCondType(v)} className="tappable" style={{
                  flex: 1, padding: "6px 0", cursor: "pointer",
                  fontSize: 12, fontFamily: "inherit", letterSpacing: "0.04em",
                  fontWeight: condType === v ? 700 : 500,
                  background: condType === v ? "var(--navy)" : "var(--surface)",
                  color: condType === v ? "#fff" : "var(--ink-soft)",
                  border: "1px solid " + (condType === v ? "var(--navy)" : "var(--hairline-strong)"),
                  marginLeft: v === "pct" ? 0 : -1,
                }}>{label}</button>
              ))}
            </div>

            {condType === "pct" && (<>
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 8, fontSize: 9.5 }}>急騰時からの変化率</div>
            <div style={{ display: "flex", gap: 6, alignItems: "stretch", marginBottom: 8, flexWrap: "wrap" }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 4,
                border: "1px solid var(--hairline-strong)", background: "var(--bg)",
                padding: "5px 8px", flex: "1 1 120px", minWidth: 0,
              }}>
                <input
                  type="number"
                  inputMode="decimal"
                  value={pctVal}
                  onChange={e => setPctVal(e.target.value)}
                  placeholder="例: 10"
                  style={{
                    flex: 1, minWidth: 0, border: "none", outline: "none",
                    background: "transparent", fontSize: 13, color: "var(--ink)",
                    fontFamily: "inherit",
                  }}
                />
                <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>%</span>
              </div>
              <div style={{ display: "flex", flexShrink: 0 }}>
                {[["gte", "以上"], ["lte", "以下"]].map(([v, label]) => (
                  <button key={v} onClick={() => setPctDir(v)} className="tappable" style={{
                    padding: "5px 12px", cursor: "pointer",
                    fontSize: 11.5, fontFamily: "inherit", letterSpacing: "0.04em",
                    background: pctDir === v ? "var(--ink)" : "var(--surface)",
                    color: pctDir === v ? "var(--bg)" : "var(--ink-soft)",
                    border: "1px solid " + (pctDir === v ? "var(--ink)" : "var(--hairline-strong)"),
                    marginLeft: -1,
                  }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
              {[5, 10, 20, 50].map(v => (
                <button key={v} onClick={() => { setPctVal(String(v)); setPctDir("gte"); }} className="tappable" style={{
                  fontSize: 10.5, padding: "3px 9px", cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: "0.04em",
                  background: condActive && pctDir === "gte" && Number(pctVal) === v ? "var(--navy)" : "transparent",
                  color: condActive && pctDir === "gte" && Number(pctVal) === v ? "#fff" : "var(--ink-soft)",
                  border: "1px solid var(--hairline-strong)",
                }}>+{v}%以上</button>
              ))}
              <button onClick={() => { setPctVal("0"); setPctDir("lte"); }} className="tappable" style={{
                fontSize: 10.5, padding: "3px 9px", cursor: "pointer",
                fontFamily: "inherit", letterSpacing: "0.04em",
                background: condActive && pctDir === "lte" && Number(pctVal) === 0 ? "var(--navy)" : "transparent",
                color: condActive && pctDir === "lte" && Number(pctVal) === 0 ? "#fff" : "var(--ink-soft)",
                border: "1px solid var(--hairline-strong)",
              }}>下落中</button>
            </div>
            </>)}

            {condType === "dip" && (
              <div style={{
                display: "flex", gap: 9, alignItems: "flex-start",
                border: "1px solid var(--hairline-strong)", background: "var(--bg)",
                padding: "9px 11px", marginBottom: 10,
              }}>
                <span className="mono" style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", flexShrink: 0,
                  color: "#fff", background: "var(--navy)", padding: "2px 6px", marginTop: 1,
                }}>ON</span>
                <div style={{ fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.75 }}>
                  急騰後に<b style={{ color: "var(--ink)" }}>25日線・75日線の両方から離れた</b>（本物の上昇局面）銘柄のうち、いま<b style={{ color: "var(--ink)" }}>押し目ゾーン（25日線・75日線の付近）</b>に戻ってきたものだけを抽出します。乖離率の入力は不要です。
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10.5, color: "var(--muted)", letterSpacing: "0.04em", flexShrink: 0 }}>範囲</span>
              <div style={{ display: "flex" }}>
                {[["all", "全期間"], ["day", "表示中の日"]].map(([v, label]) => (
                  <button key={v} onClick={() => setCondScope(v)} className="tappable" style={{
                    padding: "4px 10px", cursor: "pointer",
                    fontSize: 10.5, fontFamily: "inherit", letterSpacing: "0.04em",
                    background: condScope === v ? "var(--ink)" : "var(--surface)",
                    color: condScope === v ? "var(--bg)" : "var(--ink-soft)",
                    border: "1px solid " + (condScope === v ? "var(--ink)" : "var(--hairline-strong)"),
                    marginLeft: -1,
                  }}>{label}</button>
                ))}
              </div>
              {condActive && (
                <button onClick={clearCond} className="tappable" style={{
                  marginLeft: "auto", flexShrink: 0,
                  fontSize: 10.5, padding: "4px 10px", cursor: "pointer",
                  fontFamily: "inherit", letterSpacing: "0.04em",
                  background: "transparent", color: "var(--down)",
                  border: "1px solid var(--hairline-strong)",
                }}>クリア</button>
              )}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 8, lineHeight: 1.6 }}>
              {condType === "pct"
                ? "※ 現在株価・急騰時株価が揃っている銘柄のみが対象です。"
                : `※ 日足から各銘柄の移動平均線を計算し、急騰後に25日線・75日線の両方から+8%以上離れた（本物の上昇局面）その後いったん押し目ゾーンまで戻した銘柄を抽出します。終値で75日線を割った「調整入り」銘柄は除外します。${dipScan.status === "loading" ? " 判定中…" : ""}`}
            </div>
          </div>
        )}

        {/* 適用中の条件 chip */}
        {condActive && !condOpen && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "4px 10px",
              background: "var(--navy)", color: "#fff",
              fontSize: 11.5, fontWeight: 600, letterSpacing: "0.02em",
            }}>
              {condLabel} · {condScope === "all" ? "全期間" : "表示中の日"}
              <button
                onClick={clearCond}
                aria-label="条件を解除"
                style={{
                  background: "transparent", border: "none", color: "#fff",
                  cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1,
                  opacity: 0.85,
                }}
              >×</button>
            </span>
          </div>
        )}

        {/* Selected date chip + prev/next day nav（全期間条件検索中は非表示） */}
        {selectedDate && !globalMode && (
          <div style={{
            display: "flex", alignItems: "center", gap: 6, marginTop: 8,
          }}>
            <button
              onClick={goPrevDay}
              className="tappable"
              aria-label="前の日"
              style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3,
                padding: "5px 10px", cursor: "pointer",
                background: "var(--surface)", color: "var(--ink)",
                border: "1px solid var(--hairline-strong)",
                fontSize: 11.5, fontFamily: "inherit", letterSpacing: "0.02em",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              前日
            </button>
            <span style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              padding: "5px 10px",
              background: "var(--navy)", color: "#fff",
              fontSize: 12, fontWeight: 600,
              letterSpacing: "0.02em", whiteSpace: "nowrap",
            }}>
              {_formatDateLabel(selectedDate)}
              {knownKeys.length > 0 && selectedDate !== knownKeys[0] && (
                <button
                  onClick={() => setSelectedDate(knownKeys[0])}
                  aria-label="最新の日へ戻る"
                  style={{
                    background: "rgba(255,255,255,0.16)", border: "none", color: "#fff",
                    cursor: "pointer", padding: "1px 7px", fontSize: 10, lineHeight: 1.5,
                    letterSpacing: "0.05em", fontFamily: "inherit",
                  }}
                >最新へ</button>
              )}
            </span>
            <button
              onClick={goNextDay}
              disabled={nextDisabled}
              className="tappable"
              aria-label="次の日"
              style={{
                flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3,
                padding: "5px 10px",
                cursor: nextDisabled ? "default" : "pointer",
                background: "var(--surface)",
                color: nextDisabled ? "var(--muted-2)" : "var(--ink)",
                border: "1px solid var(--hairline-strong)",
                opacity: nextDisabled ? 0.5 : 1,
                fontSize: 11.5, fontFamily: "inherit", letterSpacing: "0.02em",
              }}
            >
              翌日
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>
        )}

        {/* Theme chips */}
        {topThemes.length > 0 && (
          <div style={{
            display: "flex", gap: 5, marginTop: 8, overflowX: "auto",
            scrollbarWidth: "none",
          }}>
            <button onClick={() => setThemeFilter(null)} className="tappable" style={{
              flexShrink: 0,
              fontSize: 10.5, padding: "3px 9px",
              letterSpacing: "0.04em", cursor: "pointer",
              background: themeFilter === null ? "var(--ink)" : "transparent",
              color: themeFilter === null ? "var(--bg)" : "var(--ink)",
              border: "1px solid " + (themeFilter === null ? "var(--ink)" : "var(--hairline-strong)"),
            }}>すべて</button>
            {topThemes.map(t => (
              <button key={t.name} onClick={() => setThemeFilter(themeFilter === t.name ? null : t.name)} className="tappable" style={{
                flexShrink: 0,
                fontSize: 10.5, padding: "3px 9px",
                letterSpacing: "0.04em", cursor: "pointer",
                background: themeFilter === t.name ? "var(--navy)" : "transparent",
                color: themeFilter === t.name ? "#fff" : "var(--ink-soft)",
                border: "1px solid " + (themeFilter === t.name ? "var(--navy)" : "var(--hairline-strong)"),
                display: "inline-flex", alignItems: "center", gap: 4,
                whiteSpace: "nowrap",
              }}>
                {t.name}
                <span className="mono" style={{
                  fontSize: 9.5,
                  color: themeFilter === t.name ? "rgba(255,255,255,0.7)" : "var(--muted-2)",
                }}>{t.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Empty */}
      {(globalMode ? filtered.length === 0 : dayItems.length === 0) && (
        <div style={{
          padding: "40px 24px", textAlign: "center", color: "var(--muted)",
          fontSize: 12, lineHeight: 1.7,
        }}>
          {dipActive && dipScan.status === "loading"
            ? "押し目を判定中… · 日足を取得しています"
            : globalMode
            ? (archive.loading ? "読み込み中…" : "該当する銘柄がありません。「さらに過去分を読み込む」で対象を広げられます。")
            : !selectedDate || dateView.loading || archive.status === "connecting"
              ? "読み込み中…"
              : (q.trim() || themeFilter || condActive)
                ? "条件に該当するデータがありません。"
                : `${_formatDateLabel(selectedDate)} に急騰検知データはありません。`}
        </div>
      )}

      {/* 全期間条件検索: 日付別グループ表示 */}
      {globalMode && grouped.map(g => (
        <DateGroup key={g.date} dateKey={g.date} items={g.items} navigate={navigate}/>
      ))}

      {/* 全期間条件検索: 過去分を自動読み込み中の表示 */}
      {globalMode && archive.hasMore && (
        <div style={{ padding: "14px 14px 6px", textAlign: "center" }}>
          <span style={{ fontSize: 11.5, color: "var(--muted)", letterSpacing: "0.04em" }}>
            過去ログを読み込み中… · 読み込み済み {(archive.entries || []).length} 件
          </span>
        </div>
      )}

      {/* 表示中の日の一覧 */}
      {!globalMode && selectedDate && dayItems.length > 0 && (
        <DateGroup dateKey={selectedDate} items={dayItems} navigate={navigate}/>
      )}

      {/* 下部の前日/翌日ナビ（リストを見終わった後の移動用） */}
      {!globalMode && selectedDate && (
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "14px 14px 6px",
        }}>
          <button
            onClick={() => {
              goPrevDay();
              const sc = document.querySelector(".scroll");
              if (sc) sc.scrollTo({ top: 0 });
            }}
            className="tappable"
            aria-label="前の日"
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "9px 10px", cursor: "pointer",
              background: "var(--surface)", color: "var(--ink)",
              border: "1px solid var(--hairline-strong)",
              fontSize: 12, fontFamily: "inherit", letterSpacing: "0.02em",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            前日
          </button>
          <button
            onClick={() => {
              goNextDay();
              const sc = document.querySelector(".scroll");
              if (sc) sc.scrollTo({ top: 0 });
            }}
            disabled={nextDisabled}
            className="tappable"
            aria-label="次の日"
            style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "9px 10px",
              cursor: nextDisabled ? "default" : "pointer",
              background: "var(--surface)",
              color: nextDisabled ? "var(--muted-2)" : "var(--ink)",
              border: "1px solid var(--hairline-strong)",
              opacity: nextDisabled ? 0.5 : 1,
              fontSize: 12, fontFamily: "inherit", letterSpacing: "0.02em",
            }}
          >
            翌日
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      )}

      <Disclaimer/>

      {/* Calendar modal */}
      {calOpen && (
        <MiniCalendar
          value={selectedDate}
          onChange={k => setSelectedDate(k)}
          onClose={() => setCalOpen(false)}
        />
      )}
    </div>
  );
}

function DateGroup({ dateKey, items, navigate }) {
  const dt = _parseDateKey(dateKey);
  const dateLabel = dt
    ? `${dt.getUTCFullYear()}.${String(dt.getUTCMonth() + 1).padStart(2, "0")}.${String(dt.getUTCDate()).padStart(2, "0")}`
    : "—";
  const weekday = dt ? _WEEKDAY[dt.getUTCDay()] : "";
  const isWeekend = weekday === "土" || weekday === "日";

  // 「今日」「昨日」表示
  const today = new Date();
  const todayKey = _formatDateKey(today.toISOString());
  const yest = new Date(today.getTime() - 86400000);
  const yestKey = _formatDateKey(yest.toISOString());
  const relLabel = dateKey === todayKey ? "今日"
                  : dateKey === yestKey ? "昨日" : null;

  return (
    <section>
      {/* Date header */}
      <div style={{
        padding: "16px 14px 8px",
        background: "var(--bg)",
        display: "flex", alignItems: "baseline", gap: 10,
        borderBottom: "1px solid var(--hairline)",
      }}>
        <div className="mono" style={{
          fontSize: 13, fontWeight: 600,
          letterSpacing: "0.04em", color: "var(--ink)",
        }}>{dateLabel}</div>
        <div style={{
          fontSize: 10.5, color: isWeekend ? "var(--up)" : "var(--muted)",
          letterSpacing: "0.08em", fontWeight: 500,
        }}>
          {weekday}曜日
          {relLabel && <span style={{
            marginLeft: 6, padding: "0 5px",
            background: "var(--ink)", color: "var(--bg)",
            fontSize: 9, letterSpacing: "0.1em",
          }}>{relLabel}</span>}
        </div>
        <div className="mono" style={{
          marginLeft: "auto", fontSize: 10.5, color: "var(--muted-2)",
        }}>
          {items.length}件
        </div>
      </div>

      {/* Entries */}
      <div style={{ background: "var(--surface)" }}>
        {items.map((item, i) => (
          <ArchiveRow
            key={item.id || (item.code + (item.detected_at || i))}
            item={item}
            onOpen={() => navigate("stock", item)}
            onTheme={t => navigate("theme", t)}
          />
        ))}
      </div>
    </section>
  );
}

function _fmtPrice(v) {
  if (v == null || v === "" || Number.isNaN(Number(v))) return null;
  const n = Number(v);
  // 1未満は小数2桁、それ以外は整数+カンマ
  return n < 10 ? n.toFixed(2) : Math.round(n).toLocaleString("ja-JP");
}

function ArchiveRow({ item, onOpen, onTheme, showDate = false, locked = false }) {
  const time = item.time || (item.detected_at || "").slice(11, 16) || "—:—";
  const themes = (item.themes || []).slice(0, 3);
  let dateLbl = null;
  if (showDate && item.detected_at) {
    try {
      const d = new Date(item.detected_at);
      if (!isNaN(d)) dateLbl = `${d.getMonth() + 1}/${d.getDate()}`;
    } catch (e) {}
  }

  // 急騰時 / 現在の株価（データ未取得なら null）
  const surgePrice   = item.surge_price ?? item.price ?? null;
  const currentPrice = item.current_price ?? null;
  const surgeFmt   = _fmtPrice(surgePrice);
  const currentFmt = _fmtPrice(currentPrice);
  const hasBoth = surgePrice != null && currentPrice != null && Number(surgePrice) > 0;
  const pctChange = hasBoth
    ? ((Number(currentPrice) - Number(surgePrice)) / Number(surgePrice)) * 100
    : null;
  const pctColor = pctChange == null ? "var(--muted-2)"
                 : pctChange > 0 ? "var(--up)"
                 : pctChange < 0 ? "var(--down)" : "var(--muted)";
  const pctLabel = pctChange == null ? null
                 : `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}%`;
  return (
    <div role="button" tabIndex={0} onClick={onOpen}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen && onOpen(); } }}
      className="tappable" style={{
      width: "100%", textAlign: "left", cursor: "pointer",
      background: "var(--surface)", border: "none",
      borderBottom: "1px solid var(--hairline)",
      padding: "12px 14px",
      display: "grid",
      gridTemplateColumns: "48px 1fr",
      gap: 10, alignItems: "flex-start",
      fontFamily: "inherit",
    }}>
      {/* Time column */}
      <div style={{ paddingTop: 2 }}>
        {dateLbl && (
          <div className="mono" style={{
            fontSize: 11, fontWeight: 700, color: "var(--navy)",
            letterSpacing: "0.02em", marginBottom: 1,
          }}>{dateLbl}</div>
        )}
        <div className="mono" style={{
          fontSize: 12, fontWeight: 600,
          color: "var(--ink-soft)", letterSpacing: "0.02em",
        }}>{time}</div>
        <div className="mono" style={{
          fontSize: 9.5, color: "var(--muted-2)", marginTop: 2,
          letterSpacing: "0.08em",
        }}>JST</div>
      </div>

      {/* Body */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
          <span className="mono" style={{
            fontSize: 10.5, color: "var(--muted)",
            border: "1px solid var(--hairline-strong)",
            padding: "0 5px", letterSpacing: "0.04em",
          }}>{item.code}</span>
          <span style={{
            fontSize: 13.5, fontWeight: 600, color: "var(--ink)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            minWidth: 0,
          }}>{item.name}</span>
          {locked && (
            <span style={{
              fontSize: 9.5, color: "var(--gold)", border: "1px solid var(--gold)",
              padding: "0 5px", letterSpacing: "0.1em", whiteSpace: "nowrap", flexShrink: 0,
            }}>会員限定</span>
          )}
          <span style={{
            marginLeft: "auto", color: "var(--muted-2)",
            fontSize: 14, lineHeight: 1, flexShrink: 0,
          }}>›</span>
        </div>
        <div style={{
          fontSize: 12, color: "var(--ink-soft)", lineHeight: 1.55,
          borderLeft: "2px solid var(--navy)", paddingLeft: 8,
          marginBottom: 6,
        }}>
          {locked ? "過去の検知メモは有料会員限定です。押すと会員プランを開きます" : (item.reason || "—")}
        </div>

        {/* 株価セル: 急騰時 / 現在 / 変化率 */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr auto",
          gap: 6, alignItems: "stretch",
          marginBottom: themes.length > 0 ? 6 : 0,
          border: "1px solid var(--hairline)",
          background: "var(--surface-sub)",
        }}>
          <div style={{ padding: "5px 8px", borderRight: "1px solid var(--hairline)" }}>
            <div style={{
              fontSize: 9, letterSpacing: "0.1em", color: "var(--muted-2)",
              marginBottom: 1,
            }}>急騰時</div>
            <div className="mono" style={{
              fontSize: 12, fontWeight: 600,
              color: surgeFmt ? "var(--ink)" : "var(--muted-2)",
            }}>
              {surgeFmt ? <><span style={{ fontSize: 9.5, color: "var(--muted)", marginRight: 1 }}>¥</span>{surgeFmt}</> : "—"}
            </div>
          </div>
          <div style={{ padding: "5px 8px", borderRight: pctLabel ? "1px solid var(--hairline)" : "none" }}>
            <div style={{
              fontSize: 9, letterSpacing: "0.1em", color: "var(--muted-2)",
              marginBottom: 1,
            }}>現在</div>
            <div className="mono" style={{
              fontSize: 12, fontWeight: 600,
              color: currentFmt ? "var(--ink)" : "var(--muted-2)",
            }}>
              {currentFmt ? <><span style={{ fontSize: 9.5, color: "var(--muted)", marginRight: 1 }}>¥</span>{currentFmt}</> : "—"}
            </div>
          </div>
          {pctLabel && (
            <div className="mono" style={{
              padding: "0 10px",
              display: "flex", alignItems: "center", justifyContent: "flex-end",
              fontSize: 12, fontWeight: 700,
              color: pctColor,
              letterSpacing: "0.02em",
              minWidth: 64,
            }}>{pctLabel}</div>
          )}
        </div>
        {themes.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {themes.map(t => (
              <span key={t}
                onClick={onTheme ? (e => { e.stopPropagation(); onTheme(String(t).trim()); }) : undefined}
                role={onTheme ? "button" : undefined}
                style={{
                fontSize: 10, color: "var(--muted)",
                border: "1px solid var(--hairline)",
                padding: "1px 6px", letterSpacing: "0.02em",
                cursor: onTheme ? "pointer" : undefined,
              }}>{t}</span>
            ))}
            {(item.themes || []).length > 3 && (
              <span className="mono" style={{
                fontSize: 10, color: "var(--muted-2)", padding: "1px 4px",
              }}>+{item.themes.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// THEME — テーマ別の検知履歴（テーマ札から遷移）
// ============================================================
function ThemePage({ theme, navigate, goBack }) {
  const th = window.useThemeEntries ? window.useThemeEntries(theme) : { entries: [], loading: false };
  const entries = th.entries || [];
  // 過去の検知メモは有料会員限定（銘柄詳細の検知履歴と同じ決まり。各銘柄の最新の回だけ無料）
  const auth = window.useAuth ? window.useAuth() : { enabled: false, paid: true };
  const gated = !!(auth.enabled && !auth.paid);
  const codes = new Set(entries.map(e => String(e.code)));
  const dates = entries.map(e => e.detected_at).filter(Boolean).sort();
  const fmtDate = d => {
    try {
      return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" }).format(new Date(d));
    } catch (e) { return ""; }
  };

  return (
    <div className="page-enter">
      <PageHeader title="テーマ" onBack={goBack}/>

      <div style={{ padding: "18px 16px 4px" }}>
        <div className="eyebrow" style={{ color: "var(--navy)" }}>テーマ別の検知履歴</div>
        <h1 className="mincho" style={{ margin: "6px 0 0", fontSize: 24, fontWeight: 700, letterSpacing: "0.02em" }}>
          {theme}
        </h1>
        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "var(--muted)", flexWrap: "wrap" }}>
          <span>検知 <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>{entries.length}</span> 件</span>
          <span>銘柄 <span className="mono" style={{ color: "var(--ink)", fontWeight: 600 }}>{codes.size}</span> 種</span>
          {dates.length > 0 && <span>初出 <span style={{ color: "var(--ink)" }}>{fmtDate(dates[0])}</span></span>}
        </div>
      </div>

      <SectionHeader kicker="新しい順" title="このテーマで動いた銘柄"/>
      <div style={{ borderTop: "1px solid var(--hairline)" }}>
        {th.loading && (
          <div style={{ padding: "28px 16px", fontSize: 11, color: "var(--muted)", textAlign: "center" }}>読み込み中…</div>
        )}
        {!th.loading && entries.length === 0 && (
          <div style={{ padding: "28px 16px", fontSize: 11.5, color: "var(--muted)", textAlign: "center", lineHeight: 1.9 }}>
            このテーマの検知はまだありません。
          </div>
        )}
        {entries.map((e, i) => {
          const locked = gated && !e.isLatest;
          return (
            <ArchiveRow
              key={e.id || i}
              item={e}
              showDate={true}
              locked={locked}
              onOpen={() => locked ? navigate("plan") : navigate("stock", e)}
              onTheme={t => { if (t !== theme) navigate("theme", t); }}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// WATCHLIST — 自分のウォッチリスト（localStorage 保存）
// ============================================================
function WatchlistPage({ navigate }) {
  const wl = window.useWatchlist ? window.useWatchlist() : { items: [], remove: () => {} };
  const dip = window.useDipSignals ? window.useDipSignals() : null;
  // ?dipdemo 付きURLでは合成データで表示確認できる
  const items = dip && dip.demo && dip.state.demoItems ? dip.state.demoItems : wl.items;
  const prices = window.useWatchPrices
    ? window.useWatchPrices(items.map(x => x.code))
    : {};
  const DipAlerts = window.DipAlertsSection || null;

  return (
    <div className="page-enter">
      <PageHeader
        title="ウォッチリスト"
        subtitle={items.length > 0 ? `${items.length} 銘柄を登録中 · この端末に保存` : "気になる銘柄を保存"}
        onBack={() => navigate("home")}
      />

      {DipAlerts && <DipAlerts navigate={navigate}/>}

      {items.length === 0 && (
        <div style={{
          padding: "48px 28px", textAlign: "center",
          color: "var(--muted)", fontSize: 12.5, lineHeight: 2,
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--muted-2)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10 }}>
            <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/>
          </svg>
          <div style={{ fontWeight: 600, color: "var(--ink-soft)", marginBottom: 4 }}>まだ登録がありません</div>
          銘柄詳細ページの「ウォッチ」ボタンから<br/>気になる銘柄を追加できます。
        </div>
      )}

      {items.length > 0 && (
        <div style={{ background: "var(--surface)", borderTop: "1px solid var(--hairline)" }}>
          {items.map(item => (
            <WatchRow
              key={item.code}
              item={item}
              sig={dip ? dip.state.signals[item.code] : null}
              livePrice={prices[item.code] || null}
              onOpen={() => navigate("stock", { ...item, current_price: prices[item.code]?.price ?? item.current_price })}
              onRemove={() => wl.remove(item.code)}
            />
          ))}
        </div>
      )}

      <Disclaimer/>
    </div>
  );
}

function WatchRow({ item, sig, livePrice, onOpen, onRemove }) {
  const Chips = window.DipChips || null;
  const surgePrice   = item.surge_price ?? null;
  const currentPrice = (livePrice && livePrice.price != null) ? livePrice.price : (item.current_price ?? null);
  const surgeFmt   = _fmtPrice(surgePrice);
  const currentFmt = _fmtPrice(currentPrice);
  const hasBoth = surgePrice != null && currentPrice != null && Number(surgePrice) > 0;
  const pctChange = hasBoth
    ? ((Number(currentPrice) - Number(surgePrice)) / Number(surgePrice)) * 100
    : null;
  const pctColor = pctChange == null ? "var(--muted-2)"
                 : pctChange > 0 ? "var(--up)"
                 : pctChange < 0 ? "var(--down)" : "var(--muted)";
  const pctLabel = pctChange == null ? null
                 : `${pctChange > 0 ? "+" : ""}${pctChange.toFixed(1)}%`;
  const detectedLabel = item.detected_at
    ? `${item.detected_at.slice(0, 10).replace(/-/g, ".")} 検知`
    : null;

  return (
    <div
      onClick={onOpen}
      className="tappable"
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onOpen(); }}
      style={{
        cursor: "pointer",
        borderBottom: "1px solid var(--hairline)",
        padding: "12px 14px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span className="mono" style={{
          fontSize: 10.5, color: "var(--muted)",
          border: "1px solid var(--hairline-strong)",
          padding: "0 5px", letterSpacing: "0.04em",
        }}>{item.code}</span>
        <span style={{
          fontSize: 13.5, fontWeight: 600, color: "var(--ink)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          minWidth: 0,
        }}>{item.name}</span>
        {detectedLabel && (
          <span className="mono" style={{ fontSize: 9.5, color: "var(--muted-2)", flexShrink: 0 }}>
            {detectedLabel}
          </span>
        )}
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          aria-label="ウォッチリストから外す"
          className="tappable"
          style={{
            marginLeft: "auto", flexShrink: 0,
            background: "transparent", border: "none", cursor: "pointer",
            padding: "4px 2px 4px 8px", lineHeight: 1,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="var(--gold)" stroke="var(--gold)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/>
          </svg>
        </button>
      </div>

      {item.reason && (
        <div style={{
          fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.55,
          borderLeft: "2px solid var(--navy)", paddingLeft: 8,
          marginBottom: 8,
          overflow: "hidden", display: "-webkit-box",
          WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
        }}>
          {item.reason}
        </div>
      )}

      {Chips && <Chips sig={sig}/>}

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr auto",
        gap: 6, alignItems: "stretch",
        border: "1px solid var(--hairline)",
        background: "var(--surface-sub)",
      }}>
        <div style={{ padding: "5px 8px", borderRight: "1px solid var(--hairline)" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--muted-2)", marginBottom: 1 }}>急騰時</div>
          <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: surgeFmt ? "var(--ink)" : "var(--muted-2)" }}>
            {surgeFmt ? <><span style={{ fontSize: 9.5, color: "var(--muted)", marginRight: 1 }}>¥</span>{surgeFmt}</> : "—"}
          </div>
        </div>
        <div style={{ padding: "5px 8px", borderRight: pctLabel ? "1px solid var(--hairline)" : "none" }}>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", color: "var(--muted-2)", marginBottom: 1 }}>現在</div>
          <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: currentFmt ? "var(--ink)" : "var(--muted-2)" }}>
            {currentFmt ? <><span style={{ fontSize: 9.5, color: "var(--muted)", marginRight: 1 }}>¥</span>{currentFmt}</> : "—"}
          </div>
        </div>
        {pctLabel && (
          <div className="mono" style={{
            padding: "0 10px",
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            fontSize: 12.5, fontWeight: 700, color: pctColor,
          }}>{pctLabel}</div>
        )}
      </div>
    </div>
  );
}
