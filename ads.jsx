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
      fontSize: 9,
      letterSpacing: "0.14em",
      fontWeight: 600,
      color: light ? "rgba(255,255,255,0.75)" : "var(--muted)",
      border: "1px solid " + (light ? "rgba(255,255,255,0.35)" : "var(--hairline-strong)"),
      padding: "0 5px",
      lineHeight: "16px",
      display: "inline-block",
      flexShrink: 0,
    }}>PR</span>
  );
}

// ── 枠①：銘柄詳細ページ（リアルチャート直下） ──
// 「この銘柄をもっと深く」の文脈で紹介ページへ誘導する本命枠
function ScouterPromoCard({ navigate }) {
  if (!_slotOn("stockDetail")) return null;
  return (
    <div style={{ padding: "20px 14px 0" }}>
      <div
        className="tappable"
        role="button"
        tabIndex={0}
        onClick={() => navigate("scouter")}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("scouter"); } }}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--hairline)",
          borderTop: "2px solid var(--gold)",
          padding: "14px 16px 13px",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <PRTag/>
          <span className="eyebrow">さらに深掘りするなら</span>
        </div>
        {_adsCfg().monex.cardImage && (
          <img src={_adsCfg().monex.cardImage} alt="銘柄スカウター" style={{
            display: "block", width: "100%", height: "auto",
            border: "1px solid var(--hairline)", marginBottom: 10,
          }}/>
        )}
        <div className="mincho" style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: "0.02em", lineHeight: 1.5 }}>
          この銘柄、業績の中身はどうか
        </div>
        <p style={{ margin: "7px 0 0", fontSize: 12, lineHeight: 1.8, color: "var(--ink-soft)" }}>
          急騰の「その先」を判断する材料は企業の中身。マネックス証券の
          <strong style={{ fontWeight: 600 }}>銘柄スカウター</strong>なら、
          10期以上の業績・セグメント・アナリスト予想までグラフで確認できます。
        </p>
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: "1px dashed var(--hairline)",
          fontSize: 11, color: "var(--navy)", fontWeight: 500,
        }}>
          銘柄スカウターで何が見れるか →
        </div>
      </div>
    </div>
  );
}

// ── 枠②：ホーム（無料記事の下） ──
function HomeScouterAd({ navigate }) {
  if (!_slotOn("home")) return null;
  return (
    <div style={{ padding: "22px 14px 0" }}>
      <div
        className="tappable"
        role="button"
        tabIndex={0}
        onClick={() => navigate("scouter")}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate("scouter"); } }}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--hairline)",
          display: "grid",
          gridTemplateColumns: "4px 1fr",
          cursor: "pointer",
        }}
      >
        <div style={{ background: "var(--gold)" }}/>
        <div style={{ padding: "13px 15px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <PRTag/>
            <span className="eyebrow">外部ツールの紹介</span>
            <span aria-hidden="true" style={{ marginLeft: "auto", color: "var(--muted-2)", fontSize: 13 }}>›</span>
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.6 }}>
            急騰要因メモは「きっかけ」の記録。企業そのものの分析は<span className="mincho" style={{ fontWeight: 700 }}>銘柄スカウター</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.7 }}>
            10期以上の業績推移・アナリスト予想・10年スクリーニング。口座があれば無料で使える定番の分析ツールです。
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 枠③：ホーム下部の細い帯（免責の上） ──
function FooterAdStrip({ navigate }) {
  if (!_slotOn("footer")) return null;
  return (
    <div style={{ padding: "26px 14px 0" }}>
      <button
        className="tappable"
        onClick={() => navigate("scouter")}
        style={{
          width: "100%",
          display: "flex", alignItems: "center", gap: 9,
          background: "var(--surface-sub)",
          border: "1px solid var(--hairline)",
          padding: "9px 12px",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <PRTag/>
        <span style={{ fontSize: 11.5, color: "var(--ink-soft)", lineHeight: 1.5, flex: 1, minWidth: 0 }}>
          本物のIR並みの指標を無料で — マネックス証券「銘柄スカウター」
        </span>
        <span aria-hidden="true" style={{ color: "var(--muted-2)", fontSize: 13, flexShrink: 0 }}>›</span>
      </button>
    </div>
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

function _ExtLink({ href, children, className, style }) {
  const rel = _adsCfg().monex.rel || "sponsored noopener noreferrer";
  return (
    <a href={href} target="_blank" rel={rel} className={className} style={{ textDecoration: "none", ...style }}>
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
        padding: "9px 18px",
        background: "var(--surface-sub)",
        borderBottom: "1px solid var(--hairline)",
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 10.5, color: "var(--muted)", lineHeight: 1.6,
      }}>
        <PRTag/>
        {cfg.affiliate
          ? "本ページはアフィリエイト広告（マネックス証券）を利用しています。"
          : "本ページは外部サービスの紹介を含みます。マネックス証券が運営・監修するものではありません。"}
      </div>

      {/* リード */}
      <div style={{ padding: "22px 18px 4px" }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>もっと深く調べたい人へ</div>
        <h1 className="mincho" style={{ margin: 0, fontSize: 23, fontWeight: 700, lineHeight: 1.55, letterSpacing: "0.02em" }}>
          急騰に「気づく」のが急騰要因メモ。<br/>
          買っていいかを「確かめる」道具が、もう一つ要る。
        </h1>
        <p style={{ margin: "14px 0 0", fontSize: 13, lineHeight: 1.95, color: "var(--ink-soft)" }}>
          急騰要因メモが記録するのは、急騰の瞬間と<strong style={{ fontWeight: 600 }}>そのきっかけ</strong>まで。
          その銘柄を実際に検討するなら、業績・財務・アナリスト予想といった企業の中身を見る必要があります。
          そこで定番なのが、マネックス証券の銘柄分析ツール
          <strong style={{ fontWeight: 600 }}>「マネックス銘柄スカウター」</strong>。
          証券口座（開設無料）があれば、無料で使えます。
        </p>
      </div>

      {/* 役割分担の対比表 */}
      <SectionHeader kicker="役割分担" title="急騰要因メモ × 銘柄スカウター"/>
      <div style={{ margin: "0 14px", border: "1px solid var(--hairline)", background: "var(--surface)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "76px 1fr 1fr", fontSize: 11, background: "var(--navy)", color: "#fff" }}>
          <div style={{ padding: "8px 10px" }}/>
          <div className="mincho" style={{ padding: "8px 10px", fontWeight: 700, borderLeft: "1px solid rgba(255,255,255,0.15)" }}>急騰要因メモ</div>
          <div className="mincho" style={{ padding: "8px 10px", fontWeight: 700, borderLeft: "1px solid rgba(255,255,255,0.15)" }}>銘柄スカウター</div>
        </div>
        {[
          ["見るもの", "急騰の初動ときっかけ", "業績・財務の中身"],
          ["時間軸", "今日、この瞬間", "過去10年と来期予想"],
          ["使いどころ", "動いた銘柄に気づく", "買う価値を確かめる"],
        ].map((row, i) => (
          <div key={row[0]} style={{
            display: "grid", gridTemplateColumns: "76px 1fr 1fr",
            borderTop: "1px solid var(--hairline)", fontSize: 12,
          }}>
            <div style={{ padding: "10px 10px", background: "var(--surface-sub)", fontSize: 10.5, fontWeight: 600, color: "var(--ink-soft)", letterSpacing: "0.04em" }}>{row[0]}</div>
            <div style={{ padding: "10px 10px", borderLeft: "1px solid var(--hairline)", lineHeight: 1.6, color: "var(--ink-soft)" }}>{row[1]}</div>
            <div style={{ padding: "10px 10px", borderLeft: "1px solid var(--hairline)", lineHeight: 1.6, color: "var(--ink-soft)" }}>{row[2]}</div>
          </div>
        ))}
      </div>

      {/* できること */}
      <SectionHeader kicker="主な機能" title="何が見れるのか"/>
      <div style={{ margin: "0 14px", border: "1px solid var(--hairline)", background: "var(--surface)" }}>
        {_SCOUTER_FEATURES.map((f, i) => (
          <div key={f.no} style={{
            display: "grid", gridTemplateColumns: "40px 1fr",
            borderTop: i > 0 ? "1px solid var(--hairline)" : "none",
          }}>
            <div className="mono" style={{
              padding: "13px 0 0 14px",
              fontSize: 11, color: "var(--gold)", fontWeight: 600,
            }}>{f.no}</div>
            <div style={{ padding: "12px 14px 12px 4px" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{f.t}</div>
              <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.7 }}>{f.d}</div>
            </div>
          </div>
        ))}
      </div>

      {/* 画面イメージ — ASP支給素材が入るまではセクションごと非表示。
          ads-config.js の monex.pageImage に素材URLを設定すれば復活する。
          （自前で撮ったスクリーンショットは著作権・提携規約の観点から使用しない） */}
      {m.pageImage && (
        <>
          <SectionHeader kicker="画面イメージ" title="業績が「絵」で分かる"/>
          <div style={{ margin: "0 14px" }}>
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
      <div style={{ margin: "0 14px", display: "grid", gap: 10 }}>
        <div style={{ border: "1px solid var(--hairline)", background: "var(--surface)", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>STEP 1</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>口座なしで「ライト版」を試す</span>
          </div>
          <p style={{ margin: "6px 0 10px", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.75 }}>
            口座開設不要の「銘柄スカウターライト」で、過去5期の業績や四半期業績など基本機能を体験できます。
          </p>
          <_ExtLink href={m.liteUrl} className="btn btn-secondary tappable" style={{ width: "100%", boxSizing: "border-box" }}>
            ライト版を開く（無料・登録不要）
          </_ExtLink>
        </div>
        <div style={{ border: "1px solid var(--ink)", background: "var(--surface)", padding: "14px 16px", position: "relative" }}>
          <div style={{
            position: "absolute", top: -1, right: -1,
            background: "var(--ink)", color: "var(--bg)",
            fontSize: 9.5, letterSpacing: "0.14em", padding: "3px 8px",
          }}>フル機能</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="mono" style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600 }}>STEP 2</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>無料口座開設でフル機能を使う</span>
          </div>
          <p style={{ margin: "6px 0 10px", fontSize: 11.5, color: "var(--muted)", lineHeight: 1.75 }}>
            10期以上の業績・セグメント・アナリスト予想・10年スクリーニングなどの全機能は、
            マネックス証券の証券総合取引口座（開設・維持とも無料）で利用できます。
          </p>
          <_ExtLink href={m.accountUrl} className="btn btn-primary tappable" style={{ width: "100%", boxSizing: "border-box" }}>
            マネックス証券 公式サイトへ
          </_ExtLink>
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted-2)", lineHeight: 1.6 }}>
            ※ 口座開設には本人確認書類が必要です。審査には数日かかる場合があります。
          </div>
        </div>
      </div>

      {/* 注記 */}
      <div style={{ margin: "18px 14px 0", fontSize: 10.5, color: "var(--muted)", lineHeight: 1.8 }}>
        記載内容は公開情報に基づく紹介であり、機能・条件は変更される場合があります。最新の情報は公式サイトをご確認ください。
        {cfg.affiliate && " 本ページのリンクから口座開設された場合、当サイトに報酬が支払われることがあります。"}
      </div>

      <Disclaimer/>
      <Footer navigate={navigate}/>
    </div>
  );
}

Object.assign(window, { PRTag, ScouterPromoCard, HomeScouterAd, FooterAdStrip, ScouterPage });
