// ────────────────────────────────────────────────────────────
// 週次レポート（先週分・月〜日）
// すべてクライアント集計：useRecentEntries(21) で先週+前週を取得し、
// テーマ潮流の差分 / 注目初動 / 効いた・続かなかった / 押し目状況 を組む。
// 追加バックエンドなし。pages.jsx の ReportPage から呼ばれる。
// ────────────────────────────────────────────────────────────

// JSTの日付演算は「+9hシフトしてUTCゲッターで読む」方式で統一
const _WR_DAY = 86400000;
function _wrShift(t) { return new Date(t + 9 * 3600000); }
function _wrMD(shiftedMs) {
  const d = new Date(shiftedMs);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}
function _wrIsoWeek(shiftedMs) {
  const t = new Date(shiftedMs);
  const dayNum = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - firstThu) / _WR_DAY - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}
function _wrPct(e) {
  const sp = Number(e.surge_price ?? e.price);
  const cp = e.current_price != null ? Number(e.current_price) : NaN;
  if (!sp || sp <= 0 || isNaN(cp)) return null;
  return ((cp - sp) / sp) * 100;
}

// 全週リスト（月起点）を新しい順に作る。完了週（先週以前）のみ。
// 検知が1件もない週はスキップ。最大12週分。
function _wrWeekList(entries) {
  const list = (entries || []).filter(e => e && e.detected_at);
  if (!list.length) return [];
  const now = _wrShift(Date.now()).getTime();
  const dow = (new Date(now).getUTCDay() + 6) % 7;
  const todayMid = Math.floor(now / _WR_DAY) * _WR_DAY;
  // 土日は市場が閉まっているため、土曜0時（JST）の時点で当週（月〜金）を完了週として扱う
  const thisMon = todayMid - dow * _WR_DAY + (dow >= 5 ? 7 * _WR_DAY : 0); // これより前が完了週

  const ms = e => _wrShift(new Date(e.detected_at).getTime()).getTime();
  const byWeek = {};
  list.forEach(e => {
    const t = ms(e);
    if (t >= thisMon) return; // 今週分はまだレポート化しない
    const mon = t - ((new Date(Math.floor(t / _WR_DAY) * _WR_DAY).getUTCDay() + 6) % 7) * _WR_DAY;
    const monMid = Math.floor(mon / _WR_DAY) * _WR_DAY;
    (byWeek[monMid] = byWeek[monMid] || []).push(e);
  });
  const mons = Object.keys(byWeek).map(Number).sort((a, b) => b - a).slice(0, 12);
  return mons.map(mon => ({
    mon,
    lw: byWeek[mon],
    pw: byWeek[mon - 7 * _WR_DAY] || [],
    lastSun: mon + 6 * _WR_DAY,
    isLatest: mon === mons[0],
  }));
}

function _wrThemeCount(pool) {
  const m = {};
  pool.forEach(e => (e.themes || []).forEach(t => {
    const k = String(t).trim();
    if (k) m[k] = (m[k] || 0) + 1;
  }));
  return m;
}

// 分析コメントの自動組立（データから文章を生成。推奨は書かない）
function _wrPickWords(B, themes, perf) {
  const n = B.lw.length, p = B.pw.length, diff = n - p;
  const trend = diff >= 3 ? "明確に増加" : diff >= 1 ? "小幅に増加" : diff === 0 ? "横ばい" : diff >= -2 ? "小幅に減少" : "明確に減少";
  const mood = diff >= 3 ? "個別材料に資金が回りやすい地合いだったと言えます"
    : diff <= -3 ? "新規の物色より様子見が優勢な週でした"
    : "物色と様子見が拮抗する中立的な週でした";

  const t0 = themes.rows[0], t1 = themes.rows[1];
  let themeLead = "週内で突出したテーマはなく、物色は分散気味でした。";
  if (t0) {
    const t0trend = t0.isNew ? "今週新たに浮上したテーマであり、初動段階の可能性があります"
      : t0.d > 0 ? `前週（${t0.prev}件）から勢いを増しており、資金の続きが意識される局面です`
      : t0.d === 0 ? "前週と同ペースで、定着した物色対象になりつつあります"
      : `前週（${t0.prev}件）比では劣勢だったものの首位を維持しています`;
    themeLead = `資金の中心は「${t0.name}」で週内${t0.n}件。${t0trend}。`;
    if (t1) themeLead += `次点は「${t1.name}」（${t1.n}件${t1.isNew ? "・新規" : t1.d > 0 ? `・前週比+${t1.d}` : ""}）。`;
  }

  const withPct = perf.upAll.length + perf.downAll.length;
  const hitLine = withPct > 0
    ? `検知後にプラスを維持しているのは${withPct}件中${perf.upAll.length}件。` +
      (perf.upAll.length / withPct >= 0.6 ? "初動の続きが良く、追風の強い週でした。"
        : perf.upAll.length / withPct >= 0.4 ? "続伸と失速が混在しており、材料の質で明暗が分かれています。"
        : "初動後の失速が目立ち、短期の利食いが早い環境でした。")
    : "";

  // ---- 各セクションの本文段落（総括並みの分量） ----

  // テーマ潮流：集中度・新規・後退まで含めた段落
  let themePara = "";
  if (t0) {
    const themedTotal = themes.rows.reduce((a, t) => a + t.n, 0);
    const share = themedTotal > 0 ? Math.round((t0.n / themedTotal) * 100) : 0;
    const t2 = themes.rows[2];
    themePara = themeLead;
    if (t2) themePara += `3番手には「${t2.name}」（${t2.n}件）が入りました。`;
    themePara += share >= 40
      ? `上位テーマへの集中度は高く（首位だけで約${share}%）、物色は一極集中に近い状態です。こうした局面はテーマの当たり外れがはっきり出るため、中心テーマの周辺銘柄（2番手・3番手）に検知が広がるかが次のチェックポイントになります。`
      : share >= 25
      ? `首位のシェアは約${share}%と適度な集中にとどまり、複数テーマが並行して動く健全な分布です。特定テーマの崩れが全体に波及しにくい週だったと言えます。`
      : `首位でもシェア約${share}%と物色は広く分散しており、テーマより個別材料主導の週でした。`;
    const news = themes.rows.filter(t => t.isNew);
    if (news.length > 0) themePara += `新規に浮上したのは${news.map(t => `「${t.name}」`).join("")}。初動の早い段階であり、今週も検知が続くかで一過性か定着かを見極めます。`;
    if (themes.faded.length > 0) themePara += `一方、前週に賑わった${themes.faded.map(f => `「${f.name}」`).join("")}は今週ゼロ件と後退しました。短命に終わった可能性があり、戻りを追う際は注意が必要です。`;
  }

  // 注目初動：首位・次点の物語＋テーマとの接続
  let picksPara = "";
  const b0 = perf.ranked[0], b1 = perf.ranked[1];
  if (b0) {
    const dys = Math.max(1, Math.round((Date.now() - new Date(b0.e.detected_at).getTime()) / _WR_DAY));
    picksPara = `最も効いたのは${b0.e.name}（${b0.e.code}）で、検知から${dys}日で+${b0.pct.toFixed(1)}%。`;
    if (b1) picksPara += `次いで${b1.e.name}が${b1.pct >= 0 ? "+" : ""}${b1.pct.toFixed(1)}%と続きます。`;
    if (t0) {
      const hits = perf.ranked.filter(x => (x.e.themes || []).includes(t0.name)).length;
      picksPara += hits >= 2 ? `上位には首位テーマ「${t0.name}」絡みが${hits}件入っており、テーマの勢いがそのまま個別の続伸につながっています。`
        : hits === 1 ? `首位テーマ「${t0.name}」絡みは上位に1件。テーマと個別の強さが必ずしも一致していない点は留意です。`
        : `なお、上位に首位テーマ「${t0.name}」絡みは入っておらず、件数の多さと値動きの強さが乖離しています。`;
    }
    picksPara += "検知時の理由と合わせて、何が効いたのかを下のカードで確認できます。";
  }

  // 効いた/続かなかった：勝率＋平均＋両端
  let reviewPara = hitLine;
  if (withPct > 0) {
    const avg = arr => arr.length ? arr.reduce((a, x) => a + x.pct, 0) / arr.length : null;
    const avgUp = avg(perf.upAll), avgDn = avg(perf.downAll);
    if (avgUp != null) reviewPara += `プラス圏の平均は+${avgUp.toFixed(1)}%`;
    if (avgDn != null) reviewPara += `${avgUp != null ? "、" : ""}マイナス圏の平均は${avgDn.toFixed(1)}%。`;
    else if (avgUp != null) reviewPara += "。";
    const worst = perf.downAll[0];
    if (worst) reviewPara += `最も崩れたのは${worst.e.name}（${worst.pct.toFixed(1)}%）で、初動の翌日以降に続きが入らなかったパターンです。`;
    reviewPara += "当たったものだけでなく外れたものも含めて毎週開示し、検知ロジックの精度をそのまま見ていただく方針です。";
  }

  return { trend, mood, themeLead, hitLine, themePara, picksPara, reviewPara };
}

// ---- 小物 ----
function WrSection({ title, kicker, children }) {
  return (
    <section style={{ padding: "18px 16px 6px" }}>
      <div className="eyebrow" style={{ color: "#7D828B", letterSpacing: "0.2em", fontSize: 9.5 }}>{kicker}</div>
      <h2 className="mincho" style={{ margin: "3px 0 12px", fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>{title}</h2>
      {children}
    </section>
  );
}
function WrEmpty({ children }) {
  return <div style={{ fontSize: 11.5, color: "#7D828B", padding: "10px 0 14px" }}>{children}</div>;
}
function WrDelta({ d, isNew }) {
  if (isNew) return <span className="mono" style={{ fontSize: 9.5, color: "var(--marker)", border: "1px solid rgba(255,225,77,0.5)", padding: "1px 5px", letterSpacing: "0.08em" }}>NEW</span>;
  if (d === 0) return <span className="mono" style={{ fontSize: 10, color: "#7D828B" }}>±0</span>;
  const up = d > 0;
  return (
    <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: up ? "#ff8a8f" : "#7fa7d9" }}>
      {up ? "▲" : "▼"}{Math.abs(d)}
    </span>
  );
}

// ---- 本体 ----
function WeeklyReportBody({ navigate }) {
  const rec = window.useRecentEntries ? window.useRecentEntries(98) : { entries: [], loading: false };
  const dip = window.useDipSignals ? window.useDipSignals() : null;

  const weeks = React.useMemo(() => _wrWeekList(rec.entries), [rec.entries]);
  const [wi, setWi] = React.useState(0); // 0 = 最新週
  React.useEffect(() => { if (wi >= weeks.length) setWi(0); }, [weeks.length]);
  const sel = weeks[Math.min(wi, Math.max(0, weeks.length - 1))] || null;

  const B = React.useMemo(() => sel ? {
    lw: sel.lw, pw: sel.pw, lastMon: sel.mon, lastSun: sel.lastSun,
    isFallback: false, isLatest: sel.isLatest,
  } : null, [sel]);

  // テーマ潮流（先週 vs 前週）
  const themes = React.useMemo(() => {
    if (!B) return { rows: [], faded: [] };
    const lwm = _wrThemeCount(B.lw), pwm = _wrThemeCount(B.pw);
    const rows = Object.entries(lwm)
      .map(([name, n]) => ({ name, n, prev: pwm[name] || 0, d: n - (pwm[name] || 0), isNew: !pwm[name] }))
      .sort((a, b) => b.n - a.n || b.d - a.d)
      .slice(0, 7);
    const faded = Object.entries(pwm)
      .filter(([name, n]) => n >= 2 && !lwm[name])
      .map(([name, n]) => ({ name, prev: n }))
      .sort((a, b) => b.prev - a.prev)
      .slice(0, 3);
    return { rows, faded };
  }, [B]);

  // 検知後変化率つきリスト
  const perf = React.useMemo(() => {
    if (!B) return { ranked: [], up: [], down: [] };
    const withPct = B.lw
      .map(e => ({ e, pct: _wrPct(e) }))
      .filter(x => x.pct != null);
    const ranked = [...withPct].sort((a, b) => b.pct - a.pct);
    const upAll = ranked.filter(x => x.pct > 0);
    const downAll = [...withPct].sort((a, b) => a.pct - b.pct).filter(x => x.pct < 0);
    return {
      ranked: ranked.slice(0, 4),
      up: upAll.slice(0, 3),
      down: downAll.slice(0, 3),
      upAll, downAll,
    };
  }, [B]);

  // 押し目（もうすぐ / 現在）
  const dips = React.useMemo(() => {
    if (!dip || dip.state.status !== "ready") return { now: [], soon: [] };
    const items = (window.DipSignals && window.DipSignals.demo && dip.state.demoItems)
      ? dip.state.demoItems
      : (window.DipSignals ? window.DipSignals._watchItems() : []);
    const nameOf = {}; items.forEach(it => { nameOf[it.code] = it.name || it.code; });
    const now = [], soon = [];
    Object.entries(dip.state.signals || {}).forEach(([code, s]) => {
      if (!s || !s.armed || s.ended) return;
      if (s.stage >= 1) now.push({ code, name: nameOf[code] || code, s });
      else if (s.distMa25 != null && s.distMa25 <= 3) soon.push({ code, name: nameOf[code] || code, s });
    });
    now.sort((a, b) => b.s.stage - a.s.stage);
    soon.sort((a, b) => a.s.distMa25 - b.s.distMa25);
    return { now, soon };
  }, [dip && dip.state]);

  if (!B) {
    return (
      <div className="page-enter" style={{ background: "#17191E", minHeight: "100%", padding: "40px 16px", color: "#A3A7AE", fontSize: 12.5 }}>
        {rec.loading ? "集計データを読み込み中..." : "集計対象のデータがまだありません。"}
      </div>
    );
  }

  const weekNo = _wrIsoWeek(B.lastMon);
  const rng = `${_wrMD(B.lastMon)}（月）— ${_wrMD(B.lastSun)}（日）`;
  const diff = B.lw.length - B.pw.length;
  const topTheme = themes.rows[0] || null;
  const best = perf.ranked[0] || null;
  const W = _wrPickWords(B, themes, perf);

  // 巻頭コメント（アナリスト風の導入段落をデータから組み立て）
  const lead = [
    `先週（${rng}）の初動検知は${B.lw.length}件と、前週の${B.pw.length}件から${W.trend}。${W.mood}。`,
    W.themeLead,
    W.hitLine,
    best ? `個別では${best.e.name}（${best.e.code}）が検知後+${best.pct.toFixed(1)}%と週の最高記録。以下、テーマの潮流と個別の振り返り、押し目の現況を順に整理します。` : "以下、テーマの潮流と個別の振り返りを順に整理します。",
  ].filter(Boolean).join("");

  // 総括3行
  const summary = [
    <>先週の初動検知は <b className="mono" style={{ color: "#fff" }}>{B.lw.length}件</b>（前週比 <b className="mono" style={{ color: diff > 0 ? "#ff8a8f" : diff < 0 ? "#7fa7d9" : "#A3A7AE" }}>{diff > 0 ? `+${diff}` : diff}件</b>）。</>,
    topTheme
      ? <>資金の中心は「<b style={{ color: "var(--marker)" }}>{topTheme.name}</b>」（{topTheme.n}件{topTheme.isNew ? "・今週浮上" : topTheme.d > 0 ? `・前週比+${topTheme.d}` : ""}）。</>
      : <>明確なテーマ集中は見られませんでした。</>,
    best
      ? <>検知後の最高は <span className="mono">{best.e.code}</span> {best.e.name} の <b className="mono" style={{ color: "#ff8a8f" }}>+{best.pct.toFixed(1)}%</b>（現在値比）。</>
      : <>検知後の値動きデータは集計中です。</>,
  ];

  return (
    <div className="page-enter" style={{ background: "#17191E", color: "#E8EAED", minHeight: "100%" }}>
      {/* ヘッダー */}
      <div style={{
        padding: "14px 16px 14px", background: "var(--navy-deep)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        position: "sticky", top: 0, zIndex: 5,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => navigate("home")} className="tappable" style={{ background: "transparent", border: "none", color: "#A3A7AE", cursor: "pointer", padding: 4 }}>‹ ホーム</button>
          <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "#A3A7AE", letterSpacing: "0.1em" }}>
            {B.isLatest ? "先週分 · 毎週土曜更新" : "バックナンバー"}
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          <div className="eyebrow" style={{ color: "var(--marker)", letterSpacing: "0.22em" }}>有料会員限定の週次レポート</div>
          <h1 className="mincho" style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: "0.02em" }}>
            週次レポート
          </h1>
          <div style={{ fontSize: 11.5, color: "#A3A7AE", marginTop: 4 }}>
            第 {weekNo} 週 · {rng} · 検知 <span className="mono">{B.lw.length}</span> 件
          </div>
        </div>
        {/* 週の切替（バックナンバー） */}
        {weeks.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            <button className="tappable" disabled={wi >= weeks.length - 1} onClick={() => setWi(wi + 1)} style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
              color: wi >= weeks.length - 1 ? "#4A4E56" : "#C9CDD3", cursor: wi >= weeks.length - 1 ? "default" : "pointer",
              padding: "6px 12px", fontSize: 11.5, fontFamily: "inherit", whiteSpace: "nowrap",
            }}>‹ 前の週</button>
            <select value={wi} onChange={e => setWi(Number(e.target.value))} className="tappable" style={{
              flex: 1, minWidth: 0, background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.12)", color: "#E8EAED",
              padding: "6px 8px", fontSize: 11.5, fontFamily: "inherit", cursor: "pointer",
            }}>
              {weeks.map((w, i) => (
                <option key={w.mon} value={i} style={{ color: "#111" }}>
                  第{_wrIsoWeek(w.mon)}週（{_wrMD(w.mon)}—{_wrMD(w.lastSun)}）検知{w.lw.length}件{w.isLatest ? " ・最新" : ""}
                </option>
              ))}
            </select>
            <button className="tappable" disabled={wi === 0} onClick={() => setWi(wi - 1)} style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
              color: wi === 0 ? "#4A4E56" : "#C9CDD3", cursor: wi === 0 ? "default" : "pointer",
              padding: "6px 12px", fontSize: 11.5, fontFamily: "inherit", whiteSpace: "nowrap",
            }}>次の週 ›</button>
          </div>
        )}
      </div>

      {/* 1. 総括 */}
      <WrSection title="今週の総括" kicker="SUMMARY">
        <p style={{
          margin: "0 0 14px", fontSize: 13, lineHeight: 2.05, color: "#C9CDD3",
          textAlign: "justify",
        }}>{lead}</p>
        <div style={{ display: "grid", gap: 8, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12 }}>
          {summary.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--marker)", flexShrink: 0 }}>0{i + 1}</span>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.8, color: "#C9CDD3" }}>{s}</p>
            </div>
          ))}
        </div>
      </WrSection>

      {/* 2. テーマ潮流 */}
      <WrSection title="資金の潮流" kicker="THEME FLOW · WoW">
        <div style={{ fontSize: 10.5, color: "#7D828B", marginBottom: 8, letterSpacing: "0.04em" }}>
          テーマ別の検知件数 ／ 前週比
        </div>
        {themes.rows.length === 0 && <WrEmpty>先週はテーマ付きの検知がありませんでした。</WrEmpty>}
        {themes.rows.length > 0 && (
          <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 2, color: "#C9CDD3", textAlign: "justify" }}>
            {W.themePara}
          </p>
        )}
        <div style={{ display: "grid", gap: 2 }}>
          {themes.rows.map((t, i) => {
            const max = Math.max(...themes.rows.map(x => x.n), 1);
            return (
              <div key={t.name} style={{
                display: "grid", gridTemplateColumns: "22px 1fr 54px 44px",
                alignItems: "center", gap: 8, padding: "8px 0",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <span className="mono" style={{ fontSize: 11, color: i < 3 ? "var(--marker)" : "#7D828B", fontWeight: 600 }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 5 }}>{t.name}</div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.06)", position: "relative" }}>
                    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: (t.n / max) * 100 + "%", background: i < 3 ? "var(--marker)" : "#4A4E56" }}/>
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 12, color: "#fff", textAlign: "right" }}>{t.n}件</span>
                <span style={{ textAlign: "right" }}><WrDelta d={t.d} isNew={t.isNew}/></span>
              </div>
            );
          })}
        </div>
        {themes.faded.length > 0 && (
          <div style={{ marginTop: 10, fontSize: 11, color: "#7D828B", lineHeight: 1.8 }}>
            後退：{themes.faded.map(f => `${f.name}（前週${f.prev}件 → 0）`).join(" ／ ")}
          </div>
        )}
      </WrSection>

      {/* 3. 注目初動（抜粋） */}
      <WrSection title="注目初動 抜粋" kicker="PICKS · TOP MOVES">
        {perf.ranked.length === 0 && <WrEmpty>検知後の値動きデータがまだありません。</WrEmpty>}
        {W.picksPara && (
          <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 2, color: "#C9CDD3", textAlign: "justify" }}>{W.picksPara}</p>
        )}
        <div style={{ display: "grid", gap: 8 }}>
          {perf.ranked.map(({ e, pct }) => (
            <button key={e.id || e.code} className="tappable" onClick={() => navigate("stock", e)} style={{
              textAlign: "left", cursor: "pointer", fontFamily: "inherit",
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              padding: "10px 12px", color: "inherit",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span className="mono" style={{ fontSize: 10.5, color: "#A3A7AE" }}>{e.code}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{e.name}</span>
                <span className="mono" style={{ marginLeft: "auto", flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: pct >= 0 ? "#ff8a8f" : "#7fa7d9" }}>
                  {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                </span>
              </div>
              {e.reason && (
                <p style={{
                  margin: "6px 0 0", fontSize: 11.5, lineHeight: 1.7, color: "#A3A7AE",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                }}>{e.reason}</p>
              )}
              {(e.themes || []).length > 0 && (
                <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
                  {(e.themes || []).slice(0, 3).map(t => (
                    <span key={t} className="mono" style={{ fontSize: 9.5, color: "var(--marker)", border: "1px solid rgba(255,225,77,0.4)", padding: "1px 6px", letterSpacing: "0.06em" }}>{t}</span>
                  ))}
                </div>
              )}
            </button>
          ))}
        </div>
        <button className="tappable" onClick={() => navigate("archive")} style={{
          background: "transparent", border: "none", color: "#A3A7AE", cursor: "pointer",
          fontSize: 11.5, padding: "10px 0 0", letterSpacing: "0.04em", fontFamily: "inherit",
        }}>先週の検知全件はアーカイブで見る ›</button>
      </WrSection>

      {/* 4. 効いた / 続かなかった */}
      <WrSection title="効いた初動・続かなかった初動" kicker="REVIEW · BOTH SIDES">
        {W.reviewPara && (
          <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 2, color: "#C9CDD3", textAlign: "justify" }}>{W.reviewPara}</p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {[
            { label: "効いた", rows: perf.up, col: "#ff8a8f", empty: "プラス圏の初動なし" },
            { label: "続かなかった", rows: perf.down, col: "#7fa7d9", empty: "マイナス圏の初動なし" },
          ].map(g => (
            <div key={g.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", padding: "10px 12px" }}>
              <div style={{ fontSize: 10.5, color: g.col, letterSpacing: "0.12em", fontWeight: 600, marginBottom: 8 }}>{g.label}</div>
              {g.rows.length === 0 && <div style={{ fontSize: 10.5, color: "#7D828B" }}>{g.empty}</div>}
              <div style={{ display: "grid", gap: 7 }}>
                {g.rows.map(({ e, pct }) => (
                  <div key={e.id || e.code} style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: "#E8EAED", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{e.name}</span>
                    <span className="mono" style={{ marginLeft: "auto", flexShrink: 0, fontSize: 11.5, fontWeight: 700, color: g.col }}>
                      {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 10, color: "#7D828B", lineHeight: 1.7 }}>
          ※ 外れた初動も含めて開示しています。変化率は検知時価格 → 現在値。
        </p>
      </WrSection>

      {/* 5. 押し目シグナル（現時点の状況なので最新週のみ） */}
      {B.isLatest && (
      <WrSection title="押し目シグナル状況" kicker="DIP WATCH · MA25 / MA75">
        <p style={{ margin: "0 0 12px", fontSize: 12.5, lineHeight: 2, color: "#C9CDD3", textAlign: "justify" }}>
          急騰後の銘柄が最初の調整でどこまで押されるかは、25日線・75日線が目安になります。
          当サイトではウォッチ登録銘柄の日足を毎日判定し、25日線タッチを押し目①、75日線タッチを押し目②として記録、
          終値で75日線を割り込んだ場合は「調整入り」として自動的に追跡を終了します。
          {dips.now.length > 0 && `現在、ウォッチ中の${dips.now.length}銘柄が押し目ゾーンに到達しています。${dips.now.slice(0, 2).map(x => `${x.name}は${x.s.stage >= 2 ? "75日線まで到達した深めの調整" : "25日線タッチの浅い押し目"}`).join("、")}という位置関係です。`}
          {dips.soon.length > 0 && `${dips.soon.map(x => x.name).slice(0, 2).join("と")}は25日線まであとわずかで、今週の接触が視野に入ります。接触すれば通知パネルに①として表示されます。`}
          {(dips.now.length + dips.soon.length) === 0 && "現在、押し目ゾーンにあるウォッチ銘柄はありません。急騰直後の銘柄は高値掴みになりやすく、最初の押し目を待ってから検討する方針の方にこの欄を活用いただけます。"}
        </p>
        {(dips.now.length + dips.soon.length) === 0 && (
          <WrEmpty>対象なし。ウォッチ登録した急騰銘柄に押し目が来るとここに載ります。</WrEmpty>
        )}
        {dips.now.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, color: "var(--marker)", letterSpacing: "0.12em", fontWeight: 600, marginBottom: 6 }}>現在押し目</div>
            <div style={{ display: "grid", gap: 6 }}>
              {dips.now.map(x => (
                <div key={x.code} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,225,77,0.08)", border: "1px solid rgba(255,225,77,0.3)", padding: "9px 12px" }}>
                  <span style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--marker)", color: "var(--marker)", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{x.s.stage >= 2 ? "②" : "①"}</span>
                  <span className="mono" style={{ fontSize: 10.5, color: "#A3A7AE", flexShrink: 0 }}>{x.code}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{x.name}</span>
                  <span style={{ marginLeft: "auto", flexShrink: 0, fontSize: 10.5, color: "#C9CDD3" }}>{x.s.stage >= 2 ? "75日線タッチ" : "25日線タッチ"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {dips.soon.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, color: "#A3A7AE", letterSpacing: "0.12em", fontWeight: 600, marginBottom: 6 }}>もうすぐ押し目（25日線接近）</div>
            <div style={{ display: "grid", gap: 6 }}>
              {dips.soon.map(x => (
                <div key={x.code} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", padding: "9px 12px" }}>
                  <span className="mono" style={{ fontSize: 10.5, color: "#A3A7AE", flexShrink: 0 }}>{x.code}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{x.name}</span>
                  <span className="mono" style={{ marginLeft: "auto", flexShrink: 0, fontSize: 11, color: "#C9CDD3" }}>あと{Math.max(0, x.s.distMa25).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <button className="tappable" onClick={() => navigate("watch")} style={{
          background: "transparent", border: "none", color: "#A3A7AE", cursor: "pointer",
          fontSize: 11.5, padding: "10px 0 0", letterSpacing: "0.04em", fontFamily: "inherit",
        }}>ウォッチリストで通知を管理 ›</button>
      </WrSection>
      )}

      {/* 6. 来週の観測ポイント */}
      <WrSection title={B.isLatest ? "来週の観測ポイント" : "翌週の観測ポイント（当時の整理）"} kicker="NEXT WEEK · WATCH POINTS">
        <div style={{ display: "grid", gap: 10 }}>
          {[
            topTheme && {
              h: `「${topTheme.name}」の継続性`,
              b: topTheme.isNew
                ? "今週初めて浮上したテーマ。2週目も検知が続くかで、一過性か資金の定着かを見極めます。"
                : `${topTheme.prev > 0 ? "2週連続" : "先週"}で最多の検知。物色が3週目に入ると過熱域に近づく事例もあり、件数の伸びと質（理由の強さ）を確認します。`,
            },
            themes.rows.filter(t => t.isNew).length > 0 && {
              h: "新規テーマの2週目",
              b: `${themes.rows.filter(t => t.isNew).slice(0, 3).map(t => `「${t.name}」`).join("")}が初登場。翌週に追随検知が出るかが定着のサインです。`,
            },
            dips.soon.length > 0 && B.isLatest && {
              h: "25日線への接触",
              b: `${dips.soon.slice(0, 2).map(x => `${x.name}（あと${Math.max(0, x.s.distMa25).toFixed(1)}%）`).join("、")}。接触すれば押し目①として通知されます。`,
            },
            perf.downAll.length > perf.upAll.length && {
              h: "初動の質の低下",
              b: "先週はマイナス圏の初動が多数派でした。追いかけ買いより、押し目やテーマの2番手を待つ姿勢が合う環境です。",
            },
          ].filter(Boolean).map((p, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span className="mono" style={{ fontSize: 10, color: "var(--marker)", flexShrink: 0, paddingTop: 3 }}>◆</span>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "#fff", marginBottom: 3 }}>{p.h}</div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.9, color: "#A3A7AE", textAlign: "justify" }}>{p.b}</p>
              </div>
            </div>
          ))}
        </div>
      </WrSection>

      {/* 7. 注記 */}
      <section style={{ padding: "20px 16px 90px" }}>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
          <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.9, color: "#7D828B" }}>
            集計対象：{rng} に検知した初動 {B.lw.length} 件（前週 {B.pw.length} 件）。
            変化率は検知時価格から現在値までの騰落率で、閲覧時点により変動します。
            {!B.isLatest && "バックナンバーの変化率も最新の株価で再計算しているため、発行当時の数値とは異なる場合があります。"}
            押し目シグナルはウォッチ登録銘柄の日足移動平均（25日・75日）への接触判定です。
            本レポートは情報整理を目的としたものであり、売買の推奨ではありません。投資判断はご自身の責任でお願いします。
          </p>
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { WeeklyReportBody });
