// 株価急騰要因メモ — app shell
// Wires iOS frame + tweaks + page navigation

const { useState, useEffect } = React;

// 公開ビルド判定：公開版HTMLで window.PUBLIC_BUILD = true をセット。
// true のとき iPhoneベゼル・Tweaksパネルを外し、実端末フルスクリーンで表示する。
const PUBLIC_BUILD = !!window.PUBLIC_BUILD;

// 画面幅で PC / スマホを判定。PC(>=1000px)では全幅レイアウト、
// それ未満では従来の iPhone フレーム表示にする。
function useIsDesktop(bp = 1000) {
  const q = `(min-width: ${bp}px)`;
  const [is, setIs] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = (e) => setIs(e.matches);
    m.addEventListener ? m.addEventListener("change", h) : m.addListener(h);
    setIs(m.matches);
    return () => { m.removeEventListener ? m.removeEventListener("change", h) : m.removeListener(h); };
  }, [q]);
  return is;
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showLiveTicker": true,
  "accent": "navy",
  "marketPalette": "jp"
}/*EDITMODE-END*/;

// タブのルートページ — これらに遷移したら履歴をリセットする
const TAB_ROOTS = ["home", "cats", "archive", "watch", "report", "plan"];

// URLで直接開けるページ（例: /legal → 特商法表記）。Stripe審査等でURL提出に使う。
// _worker.js の SPA_PATH と揃えること（静的ファイルが無いパスに index.html を返す）
const HASH_PAGES = ["home", "cats", "archive", "watch", "report", "plan", "legal", "privacy", "scouter"];

// JST の YYYYMMDD
function _jstYmd(iso) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(new Date(iso)).replace(/-/g, "");
  } catch (e) { return ""; }
}

// URL から最初に開くページを読む。
// 新形式：/stock/1234、/stock/1234/20261103、/archive
// 旧形式：/#stock/1234、/#legal（Xの過去ポストや外部のリンク用に引き続き受け付ける）
function _routeFromUrl() {
  const path = window.location.pathname.replace(/\/index\.html$/, "/");
  const hash = (window.location.hash || "").replace(/^#\/?/, "");
  const m = path.match(/^\/stock\/([0-9A-Za-z]+)(?:\/(\d{8}))?\/?$/) || hash.match(/^stock\/([0-9A-Za-z]+)(?:\/(\d{8}))?/);
  if (m) return { page: "home", stock: { code: m[1], ymd: m[2] || null } };
  const seg = path.replace(/^\/|\/$/g, "") || hash;
  return { page: HASH_PAGES.includes(seg) ? seg : "home", stock: null };
}

// ページに対応するURLを返す。銘柄詳細は /stock/1234（その銘柄の最新の検知）
function _urlFor(page, data) {
  if (page === "stock" && data && data.code) return "/stock/" + data.code;
  if (HASH_PAGES.includes(page) && page !== "home") return "/" + page;
  return "/";
}

// アーカイブ検索欄にフォーカス（描画待ちのため見つかるまで少しリトライ）
function _focusArchiveSearch() {
  let tries = 0;
  const tick = () => {
    const el = document.getElementById("archive-search")
      || document.querySelector('input[placeholder="コード・銘柄名・キーワードで検索"]');
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } return; }
    if (++tries < 20) setTimeout(tick, 100);
  };
  setTimeout(tick, 120);
}

function App() {
  // ページ遷移履歴のスタック。最後の要素が現在のページ。
  const [route0] = useState(_routeFromUrl);
  const [history, setHistory] = useState(() => [{ page: route0.page, data: null }]);
  const current = history[history.length - 1];
  const page = current.page;
  const pageData = current.data;
  const scrollRef = React.useRef(null);
  const [t, setTweak] = window.useTweaks(TWEAK_DEFAULTS);
  const live = window.useLiveData ? window.useLiveData() : { status: "fallback" };

  // ディープリンク: /stock/1234 → 該当銘柄の詳細ページを直接開く（Xポスト・検索からの流入用）。
  // 開くのはその銘柄の最新の検知。日付付きURL（/stock/1234/20261103）は、過去の検知メモが
  // 有料会員限定なので、最新の日を指しているときだけその日として扱い、それ以外も最新を開く
  const [pendingStock, setPendingStock] = useState(route0.stock);
  const stockFetchRef = React.useRef(false);
  useEffect(() => {
    if (!pendingStock) return;
    const code = String(pendingStock.code);
    const stocks = live.stocks || [];
    const hit = stocks.find(s => String(s.code) === code);
    const open = s => setHistory([{ page: "home", data: null }, { page: "stock", data: s }]);
    if (hit) {
      setPendingStock(null);
      open(hit);
      return;
    }
    // 読み込み済みリストに無い（表示期間より古い等）→ Supabase から直接1件取得。
    // 取得し終えるまで pendingStock を残し、途中のホームを page_view として数えない
    if (live.status !== "connecting" && window.fetchStockByCode && !stockFetchRef.current) {
      stockFetchRef.current = true;
      window.fetchStockByCode(code)
        .then(s => { if (s) open(s); })
        .finally(() => setPendingStock(null));
    }
  }, [pendingStock, live.status, live.stocks]);

  // Apply tweak: accent color
  useEffect(() => {
    const root = document.documentElement;
    if (t.accent === "ink") {
      root.style.setProperty("--navy", "#000000");
      root.style.setProperty("--navy-deep", "#000000");
    } else if (t.accent === "indigo") {
      root.style.setProperty("--navy", "#2A3B6E");
      root.style.setProperty("--navy-deep", "#1A2548");
    } else {
      root.style.setProperty("--navy", "#1D2026");
      root.style.setProperty("--navy-deep", "#1D2026");
    }
    // Market color convention
    if (t.marketPalette === "us") {
      root.style.setProperty("--up", "#1E7A55");
      root.style.setProperty("--up-soft", "#E6F2EC");
      root.style.setProperty("--down", "#D7332A");
      root.style.setProperty("--down-soft", "#FBEAE8");
    } else {
      root.style.setProperty("--up", "#D7332A");
      root.style.setProperty("--up-soft", "#FBEAE8");
      root.style.setProperty("--down", "#1E7A55");
      root.style.setProperty("--down-soft", "#E6F2EC");
    }
  }, [t.accent, t.marketPalette]);

  const _scrollTop = () => {
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, 10);
  };

  const navigate = (p, data) => {
    setHistory(h => {
      // タブのルートへ移動するときは履歴を畳んで1件に
      if (TAB_ROOTS.includes(p)) return [{ page: p, data: data || null }];
      // 同じページの重複pushは避ける
      const top = h[h.length - 1];
      if (top && top.page === p && top.data === (data || null)) return h;
      return [...h, { page: p, data: data || null }];
    });
    // 直リンク可能なページはURLを同期（履歴は汚さない）
    try {
      (window.__replaceUrl || window.history.replaceState.bind(window.history))(null, "", _urlFor(p, data));
    } catch (e) {}
    _scrollTop();
  };

  // 一つ前のページへ戻る。履歴がなければホームへ。
  const goBack = () => {
    setHistory(h => {
      const nh = h.length > 1 ? h.slice(0, -1) : [{ page: "home", data: null }];
      const top = nh[nh.length - 1];
      try {
        (window.__replaceUrl || window.history.replaceState.bind(window.history))(null, "", _urlFor(top.page, top.data));
      } catch (e) {}
      return nh;
    });
    _scrollTop();
  };

  const tabKey = ["home"].includes(page) ? "home"
    : ["cats", "category"].includes(page) ? "cats"
    : ["archive"].includes(page) ? "archive"
    : ["watch"].includes(page) ? "watch"
    : ["report"].includes(page) ? "report"
    : ["plan"].includes(page) ? "plan"
    : null;

  // ページ切替ごとにタイトルとURLを揃え、Google アナリティクスへ page_view を送る。
  // URL を持たない画面（テーマ・カテゴリ詳細など）は /theme/… のような仮想パスで GA に渡す
  useEffect(() => {
    // 銘柄への直リンクを開いている途中（いったんホームが描かれる）は数えない
    if (pendingStock) return;
    const SITE = "株価急騰要因メモ";
    const d = pageData || {};
    const name = d.name && window._dispName ? window._dispName(d.name) : d.name;
    const info = {
      home:     { path: "/",                                   title: SITE },
      surges:   { path: "/surges",                             title: "今日の急騰銘柄" },
      stock:    { path: "/stock/" + (d.code || ""),            title: `${name || "銘柄詳細"}（${d.code || ""}）が急騰した理由` },
      cats:     { path: "/cats",                               title: "急騰理由カテゴリ" },
      category: { path: "/category/" + (d.key || ""),          title: `${d.label || "カテゴリ"}で急騰した銘柄` },
      theme:    { path: "/theme/" + encodeURIComponent(typeof pageData === "string" ? pageData : ""), title: `テーマ「${typeof pageData === "string" ? pageData : ""}」で動いた銘柄` },
      archive:  { path: "/archive",                            title: "急騰履歴アーカイブ" },
      watch:    { path: "/watch",                              title: "ウォッチリスト" },
      report:   { path: "/report",                             title: "週次レポート" },
      plan:     { path: "/plan",                               title: "会員プラン" },
      article:  { path: "/article/" + (d.code || ""),          title: `${d.name || "無料記事"}　${d.reason || ""}` },
      legal:    { path: "/legal",                              title: "特定商取引法に基づく表記" },
      privacy:  { path: "/privacy",                            title: "プライバシーポリシー" },
      scouter:  { path: "/scouter",                            title: "銘柄スカウター" },
    }[page] || { path: "/", title: SITE };
    const title = page === "home" ? SITE : `${info.title} | ${SITE}`;
    document.title = title;
    // /stock/1234/日付 や /#legal で開かれたときも、正規のURL（/stock/1234、/legal）に揃える
    const want = _urlFor(page, pageData);
    if (want !== "/" && window.location.pathname + window.location.hash !== want) {
      try { (window.__replaceUrl || window.history.replaceState.bind(window.history))(null, "", want); } catch (e) {}
    }
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_title: title,
        page_location: window.location.origin + info.path,
        page_path: info.path,
      });
    }
  }, [page, pageData, pendingStock]);

  let body = null;
  switch (page) {
    case "home":     body = <HomePage navigate={navigate}/>; break;
    case "surges":   body = <SurgesPage navigate={navigate}/>; break;
    case "stock":    body = <StockDetailPage stock={pageData} navigate={navigate} goBack={goBack}/>; break;
    case "cats":     body = <CategoriesPage navigate={navigate}/>; break;
    case "category": body = <CategoryPage cat={pageData} navigate={navigate} goBack={goBack}/>; break;
    case "theme":    body = <ThemePage theme={pageData} navigate={navigate} goBack={goBack}/>; break;
    case "archive":  body = <ArchivePage navigate={navigate}/>; break;
    case "watch":    body = <WatchlistPage navigate={navigate}/>; break;
    case "report":   body = <ReportPage navigate={navigate}/>; break;
    case "plan":     body = <PlanPage navigate={navigate} goBack={goBack}/>; break;
    case "article":  body = <ArticlePage article={pageData} navigate={navigate} goBack={goBack}/>; break;
    case "legal":    body = <LegalPage navigate={navigate} goBack={goBack}/>; break;
    case "privacy":  body = <PrivacyPage navigate={navigate} goBack={goBack}/>; break;
    case "scouter":  body = window.ScouterPage ? <window.ScouterPage navigate={navigate} goBack={goBack}/> : <HomePage navigate={navigate}/>; break;
    default:         body = <HomePage navigate={navigate}/>;
  }

  const isReportPage = page === "report";
  const isDesktop = useIsDesktop();

  // ===== PC（全幅）レイアウト：上に題字と横並びメニュー + 中央の誌面 =====
  if (isDesktop) {
    const navItems = [
      { k: "home",    label: "ホーム" },
      { k: "cats",    label: "カテゴリ" },
      { k: "archive", label: "アーカイブ" },
      { k: "watch",   label: "ウォッチ" },
      { k: "report",  label: "レポート" },
      { k: "plan",    label: "プラン" },
    ];
    return (
      <>
        <div className="dk-root">
          <header className="dk-mast">
            <div className="dk-mast-inner">
              <div className="dk-mast-top">
                <button
                  onClick={() => navigate("home")}
                  aria-label="ホームへ戻る"
                  style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", display: "block" }}
                >
                  <span className="dk-logo">株価急騰要因メモ</span>
                  <span className="dk-sub">急騰した銘柄の理由を、その日のうちに記録しています</span>
                </button>
                <div className="mast-issue" style={{ fontSize: 12.5, paddingBottom: 2 }}>
                  <span><b>{window._issueLabel ? window._issueLabel() : ""}</b>号</span>
                  {window.ConnectionPill && <window.ConnectionPill status={live.status}/>}
                  {live.lastUpdate && window._jstHM && <span>更新 <span className="mono">{window._jstHM(live.lastUpdate)}</span></span>}
                </div>
              </div>
              <nav className="dk-nav" aria-label="メインメニュー">
                {navItems.map(({ k, label }) => {
                  const a = tabKey === k;
                  return (
                    <button key={k} className={"dk-navbtn" + (a ? " active" : "")} onClick={() => navigate(k)} aria-current={a ? "page" : undefined}>
                      <span style={{ position: "relative" }}>
                        {label}
                        {k === "watch" && window.DipBadge && <window.DipBadge style={{ right: -16, top: -4 }}/>}
                      </span>
                    </button>
                  );
                })}
                <button className="dk-navbtn dk-nav-search" onClick={() => { navigate("archive"); _focusArchiveSearch(); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
                  <span>銘柄を検索</span>
                </button>
              </nav>
            </div>
          </header>
          <main className="dk-main">
            {t.showLiveTicker && <Ticker stocks={live.stocks && live.stocks.length ? live.stocks : SURGE_STOCKS}/>}
            <div ref={scrollRef} className="dk-content">
              <div className={"dk-col app" + (page === "home" ? " dk-col--wide" : "")} key={page} style={{ height: "auto", paddingTop: 0, paddingBottom: 40, overflow: "visible", display: "block" }}>
                {body}
              </div>
              {page !== "home" && page !== "legal" && page !== "privacy" && page !== "plan" && (
                <div className="dk-foot" style={{ padding: "18px 40px 28px", borderTop: "1px solid var(--hairline)" }}>
                  本サイトの情報は特定銘柄の売買を推奨するものではありません。投資判断はご自身の責任で行ってください。
                  <a
                    href="/legal"
                    onClick={e => { e.preventDefault(); navigate("legal"); }}
                    style={{ marginLeft: 12, color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                  >特定商取引法に基づく表記</a>
                  <a
                    href="/privacy"
                    onClick={e => { e.preventDefault(); navigate("privacy"); }}
                    style={{ marginLeft: 12, color: "inherit", textDecoration: "underline", textUnderlineOffset: 2 }}
                  >プライバシーポリシー</a>
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Tweaks panel */}
        {renderTweaks(t, setTweak)}
      </>
    );
  }

  return (
    <>
      <div className="app" style={PUBLIC_BUILD ? {
        height: "100dvh",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 10px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)",
      } : undefined}>
        {!isReportPage && <TopBar onMenu={() => navigate("plan")} onHome={() => navigate("home")} onSearch={() => { navigate("archive"); _focusArchiveSearch(); }} status={live.status} lastUpdate={live.lastUpdate}/>}
        {!isReportPage && t.showLiveTicker && <Ticker stocks={live.stocks && live.stocks.length ? live.stocks : SURGE_STOCKS}/>}
        <div ref={scrollRef} className="scroll" key={page}>
          {body}
        </div>
        {tabKey !== null && <TabBar active={tabKey} onChange={(k) => {
          if (k === "home") navigate("home");
          else if (k === "cats") navigate("cats");
          else if (k === "archive") navigate("archive");
          else if (k === "watch") navigate("watch");
          else if (k === "report") navigate("report");
          else if (k === "plan") navigate("plan");
        }}/>}
      </div>

      {/* Tweaks panel */}
      {renderTweaks(t, setTweak)}
    </>
  );
}

// Tweaks panel（PC/スマホ両レイアウトで共有）
function renderTweaks(t, setTweak) {
  if (PUBLIC_BUILD) return null;
  return (
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection label="表示">
          <window.TweakToggle
            label="ライブティッカー"
            value={t.showLiveTicker}
            onChange={v => setTweak("showLiveTicker", v)}
          />
        </window.TweakSection>
        <window.TweakSection label="アクセント">
          <window.TweakRadio
            label="メイン"
            value={t.accent}
            options={[
              { label: "ネイビー", value: "navy" },
              { label: "インディゴ", value: "indigo" },
              { label: "ブラック", value: "ink" },
            ]}
            onChange={v => setTweak("accent", v)}
          />
        </window.TweakSection>
        <window.TweakSection label="色彩規則">
          <window.TweakRadio
            label="上昇=色"
            value={t.marketPalette}
            options={[
              { label: "赤=上昇(JP)", value: "jp" },
              { label: "緑=上昇(US)", value: "us" },
            ]}
            onChange={v => setTweak("marketPalette", v)}
          />
        </window.TweakSection>
      </window.TweaksPanel>
  );
}

// Render: PC は全幅、スマホは iPhone フレーム中央表示
function Root() {
  const isDesktop = useIsDesktop();
  const content = (
    <window.LiveDataProvider>
      <App/>
    </window.LiveDataProvider>
  );
  if (isDesktop || PUBLIC_BUILD) return content;
  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "32px 16px",
      background: "#2A2D33",
    }}>
      <IOSDevice width={402} height={874} dark={true}>
        {content}
      </IOSDevice>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<Root/>);
