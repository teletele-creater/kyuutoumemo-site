// ============================================================
// 広告枠（PR）＋ 銘柄スカウター紹介ページ
//
// - すべての枠は ADS_CONFIG (ads-config.js) でON/OFFできる
// - アプリ内の枠は直接外部に飛ばさず、まず「scouter」ページへ
//   （ワンクッション方式：紹介 → 納得した人だけ外部リンクへ）
// - 外部リンクはこのファイルの ScouterPage 内にのみ存在する
// ============================================================

const _adsCfg = () => window.ADS_CONFIG || { enabled: false, slots: {}, monex: {} };
const _slotOn = (key) => {
  const c = _adsCfg();
  return !!(c.enabled && c.slots && c.slots[key]);
};

// 小さな PR 表記チップ（景表法・ステマ規制対応の明示）
function PRTag({ light = false }) {
  return (
    <span style={{
      fontSize: 10.5,
      fontWeight: 700,
      color: light ? "rgba(255,255,255,0.8)" : "var(--muted)",
      border: "1px solid " + (light ? "rgba(255,255,255,0.4)" : "var(--hairline-strong)"),
      padding: "0 6px",
      lineHeight: "17px",
      display: "inline-block",
      flexShrink: 0,
    }}>PR</span>
  );
}

// 広告の計測（Google アナリティクス）。slot = どの枠か、link = 外部リンクの種類
function _adTrack(event, params) {
  try { if (typeof window.gtag === "function") window.gtag("event", event, { partner: "monex", ...params }); } catch (e) {}
}
function _openScouter(navigate, slot) {
  _adTrack("ad_slot_click", { slot });
  navigate("scouter");
}

// ── 枠①：銘柄詳細ページ（「なぜ上がったのか」の直下） ──
// 理由を読み終えて「この会社の中身は？」と思ったところで紹介ページへ誘導する本命枠
function ScouterPromoCard({ navigate, stock }) {
  if (!_slotOn("stockDetail")) return null;
  const name = stock && stock.name ? (window._dispName ? window._dispName(stock.name) : stock.name) : null;
  const open = () => _openScouter(navigate, "stockDetail");
  return (
    <aside aria-label="広告" style={{ padding: "26px 18px 0" }}>
      <div
        className="tappable"
        role="link"
        tabIndex={0}
        onClick={open}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--ink)",
          padding: "16px 18px 16px",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
          <PRTag/>
          <span>マネックス証券</span>
        </div>
        {_adsCfg().monex.cardImage && (
          <img src={_adsCfg().monex.cardImage} alt="銘柄スカウター" style={{
            display: "block", width: "100%", height: "auto",
            border: "1px solid var(--hairline)", marginTop: 10,
          }}/>
        )}
        <div style={{ marginTop: 8, fontFamily: "var(--f-head)", fontSize: 19, fontWeight: 900, lineHeight: 1.45 }}>
          {name ? `${name}の業績、中身はどうか` : "この銘柄、業績の中身はどうか"}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.85, color: "var(--ink-soft)", maxWidth: "36em" }}>
          急騰の理由が分かったら、次は企業そのもの。マネックス証券の<strong>銘柄スカウター</strong>なら、
          10期以上の業績・セグメント別の売上・アナリスト予想をグラフで確かめられます。証券口座（開設無料）があれば無料です。
        </p>
        <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 4 }}>
          銘柄スカウターでできることを見る
        </div>
      </div>
    </aside>
  );
}

// ── 枠②：ホーム（無料記事の下） ──
function HomeScouterAd({ navigate }) {
  if (!_slotOn("home")) return null;
  const open = () => _openScouter(navigate, "home");
  return (
    <aside aria-label="広告" style={{ padding: "26px 18px 0" }}>
      <div
        className="tappable"
        role="link"
        tabIndex={0}
        onClick={open}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
        style={{ background: "var(--surface)", border: "1px solid var(--hairline-strong)", padding: "14px 18px", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
          <PRTag/>
          <span>マネックス証券</span>
        </div>
        <div style={{ marginTop: 6, fontFamily: "var(--f-head)", fontSize: 16, fontWeight: 900, lineHeight: 1.55 }}>
          急騰の理由の次は、企業の中身を見る。銘柄スカウター
        </div>
        <div style={{ marginTop: 4, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.75 }}>
          10期以上の業績推移・アナリスト予想・10年スクリーニング。口座があれば無料で使える分析ツールです。
        </div>
      </div>
    </aside>
  );
}

// ── 枠③：ホーム下部の細い帯（免責の上） ──
function FooterAdStrip({ navigate }) {
  if (!_slotOn("footer")) return null;
  return (
    <aside aria-label="広告" style={{ padding: "22px 18px 0" }}>
      <button
        className="tappable"
        onClick={() => _openScouter(navigate, "footer")}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 9,
          background: "var(--surface-sub)",
          border: "none",
          padding: "10px 12px",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <PRTag/>
        <span style={{ fontSize: 12.5, color: "var(--ink-soft)", lineHeight: 1.5, flex: 1, minWidth: 0 }}>
          業績・アナリスト予想を無料で確かめる。マネックス証券「銘柄スカウター」
        </span>
        <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 14, flexShrink: 0 }}>›</span>
      </button>
    </aside>
  );
}

// ============================================================
// 紹介ページ（ワンクッションLP）
// アプリ内の全広告枠はここに着地し、外部リンクはここからのみ
// ============================================================

const _SCOUTER_FEATURES = [
  { no: "01", t: "過去10期以上の業績グラフ", d: "売上高・営業利益などの長期推移を一目で。増収増益が続いているかの確認に。" },
  { no: "02", t: "3ヶ月ごとの四半期業績", d: "決算短信の累計値を自分で引き算しなくても、直近の勢いがそのまま見える。" },
  { no: "03", t: "セグメント業績", d: "どの事業で稼いでいる会社なのか。急騰材料と本業の関係を確かめられる。" },
  { no: "04", t: "アナリスト予想・目標株価", d: "主要証券のコンセンサス予想とレーティングの動き。" },
  { no: "05", t: "理論株価と上値・下値目途", d: "PER・PBRを統計処理した妥当水準の目安を表示。" },
  { no: "06", t: "10年スクリーニング・銘柄比較", d: "過去10年の業績で絞り込み。最大6銘柄を表で並べて比較。" },
];

function _ExtLink({ href, children, className, style, track }) {
  const rel = _adsCfg().monex.rel || "sponsored noopener noreferrer";
  return (
    <a href={href} target="_blank" rel={rel} className={className} style={{ textDecoration: "none", ...style }}
      onClick={() => _adTrack("affiliate_click", { link: track || "unknown" })}>
      {children}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 5, flexShrink: 0 }}>
        <path d="M7 17 17 7M9 7h8v8"/>
      </svg>
    </a>
  );
}

function ScouterPage({ navigate, goBack }) {
  const PageHeader = window.PageHeader;
  const SectionHeader = window.SectionHeader;
  const Disclaimer = window.Disclaimer;
  const Footer = window.Footer;
  const cfg = _adsCfg();
  const m = cfg.monex || {};

  return (
    <div className="page-enter" data-screen-label="銘柄スカウター紹介">
      <PageHeader title="銘柄スカウターの紹介" onBack={goBack || (() => navigate("home"))}/>

      {/* 広告表記（ステマ規制対応） */}
      <div style={{
        padding: "10px 18px",
        background: "var(--surface-sub)",
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 12, color: "var(--muted)", lineHeight: 1.6,
      }}>
        <PRTag/>
        {cfg.affiliate
          ? "本ページはアフィリエイト広告（マネックス証券）を利用しています。"
          : "本ページは外部サービスの紹介を含みます。マネックス証券が運営・監修するものではありません。"}
      </div>

      {/* リード */}
      <div style={{ padding: "22px 18px 4px" }}>
        <h1 style={{ margin: 0, fontFamily: "var(--f-head)", fontSize: 24, fontWeight: 900, lineHeight: 1.55 }}>
          急騰の理由の次は、<br/>
          企業の中身を確かめる。
        </h1>
        <p style={{ margin: "14px 0 0", fontSize: 14, lineHeight: 1.95, color: "var(--ink-soft)", maxWidth: "38em" }}>
          急騰要因メモが記録するのは、急騰の瞬間と<strong style={{ fontWeight: 600 }}>そのきっかけ</strong>まで。
          その銘柄を実際に検討するなら、業績・財務・アナリスト予想といった企業の中身を見る必要があります。
          そこで定番なのが、マネックス証券の銘柄分析ツール
          <strong style={{ fontWeight: 600 }}>「マネックス銘柄スカウター」</strong>。
          証券口座（開設無料）があれば、無料で使えます。
        </p>
      </div>

      {/* 役割分担の対比表 */}
      <SectionHeader kicker="役割分担" title="急騰要因メモ × 銘柄スカウター"/>
      <div style={{ margin: "0 18px", borderTop: "1px solid var(--ink)", background: "var(--surface)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 1fr", fontSize: 13, fontFamily: "var(--f-head)", fontWeight: 900 }}>
          <div style={{ padding: "10px 10px" }}/>
          <div style={{ padding: "10px 10px", borderLeft: "1px solid var(--hairline)" }}>急騰要因メモ</div>
          <div style={{ padding: "10px 10px", borderLeft: "1px solid var(--hairline)" }}>銘柄スカウター</div>
        </div>
        {[
          ["見るもの", "急騰の初動ときっかけ", "業績・財務の中身"],
          ["時間軸", "今日、この瞬間", "過去10年と来期予想"],
          ["使いどころ", "動いた銘柄に気づく", "買う価値を確かめる"],
        ].map((row, i) => (
          <div key={row[0]} style={{
            display: "grid", gridTemplateColumns: "84px 1fr 1fr",
            borderTop: "1px solid var(--hairline)", fontSize: 13,
          }}>
            <div style={{ padding: "10px 10px", fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{row[0]}</div>
            <div style={{ padding: "10px 10px", borderLeft: "1px solid var(--hairline)", lineHeight: 1.6, color: "var(--ink-soft)" }}>{row[1]}</div>
            <div style={{ padding: "10px 10px", borderLeft: "1px solid var(--hairline)", lineHeight: 1.6, color: "var(--ink-soft)" }}>{row[2]}</div>
          </div>
        ))}
      </div>

      {/* できること */}
      <SectionHeader kicker="主な機能" title="何が見れるのか"/>
      <div style={{ margin: "0 18px", borderTop: "1px solid var(--ink)" }}>
        {_SCOUTER_FEATURES.map(f => (
          <div key={f.no} style={{ padding: "12px 0", borderBottom: "1px solid var(--hairline)" }}>
            <div style={{ fontSize: 14.5, fontWeight: 700 }}>{f.t}</div>
            <div style={{ marginTop: 3, fontSize: 13, color: "var(--muted)", lineHeight: 1.75 }}>{f.d}</div>
          </div>
        ))}
      </div>

      {/* 画面イメージ — ASP支給素材が入るまではセクションごと非表示。
          ads-config.js の monex.pageImage に素材URLを設定すれば復活する。
          （自前で撮ったスクリーンショットは著作権・提携規約の観点から使用しない） */}
      {m.pageImage && (
        <>
          <SectionHeader kicker="画面イメージ" title="業績が「絵」で分かる"/>
          <div style={{ margin: "0 18px" }}>
            <img src={m.pageImage} alt="銘柄スカウターの画面イメージ" style={{
              display: "block", width: "100%", height: "auto",
              border: "1px solid var(--hairline)",
            }}/>
            <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted-2)", lineHeight: 1.6 }}>
              ※ 画面イメージはマネックス証券の公式素材（またはASP提供素材）を使用します。
            </div>
          </div>
        </>
      )}

      {/* まず試す → 口座開設 */}
      <SectionHeader kicker="使いはじめ方" title="まず無料で触ってみる"/>
      <div style={{ margin: "0 18px", display: "grid", gap: 12 }}>
        <div style={{ border: "1px solid var(--hairline-strong)", background: "var(--surface)", padding: "16px 18px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="num-cond" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>1</span>
            <span style={{ fontFamily: "var(--f-head)", fontSize: 16, fontWeight: 900 }}>口座なしで「ライト版」を試す</span>
          </div>
          <p style={{ margin: "8px 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
            口座開設不要の「銘柄スカウターライト」で、過去5期の業績や四半期業績など基本機能を体験できます。
          </p>
          <_ExtLink href={m.liteUrl} track="lite" className="btn btn-secondary" style={{ width: "100%", boxSizing: "border-box" }}>
            ライト版を開く（無料・登録不要）
          </_ExtLink>
        </div>
        <div style={{ border: "2px solid var(--ink)", background: "var(--surface)", padding: "15px 17px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="num-cond" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1 }}>2</span>
            <span style={{ fontFamily: "var(--f-head)", fontSize: 16, fontWeight: 900 }}>無料の口座開設で、全機能を使う</span>
          </div>
          <p style={{ margin: "8px 0 12px", fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>
            10期以上の業績・セグメント・アナリスト予想・10年スクリーニングなどの全機能は、
            マネックス証券の証券総合取引口座（開設・維持とも無料）で利用できます。
          </p>
          <_ExtLink href={m.accountUrl} track="account" className="btn btn-primary" style={{ width: "100%", boxSizing: "border-box" }}>
            マネックス証券 公式サイトへ
          </_ExtLink>
          <div style={{ marginTop: 8, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.7 }}>
            ※ 口座開設には本人確認書類が必要です。審査には数日かかる場合があります。
          </div>
        </div>
      </div>

      {/* 注記 */}
      <div style={{ margin: "20px 18px 0", fontSize: 12, color: "var(--muted)", lineHeight: 1.8, maxWidth: "48em" }}>
        記載内容は公開情報に基づく紹介であり、機能・条件は変更される場合があります。最新の情報は公式サイトをご確認ください。
        {cfg.affiliate && " 本ページのリンクから口座開設された場合、当サイトに報酬が支払われることがあります。"}
      </div>

      <Disclaimer/>
      <Footer navigate={navigate}/>
    </div>
  );
}

Object.assign(window, { PRTag, ScouterPromoCard, HomeScouterAd, FooterAdStrip, ScouterPage });
