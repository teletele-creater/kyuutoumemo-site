// Sample data for the prototype.
// 注: 全て架空のサンプルデータ。実銘柄の推奨ではありません。

const SURGE_STOCKS = [
  {
    code: "2342", name: "トランスジェニック", market: "東S",
    pct: 23.7, price: 412, vol: "1,840万",
    reason: "新規ライセンス契約発表",
    cat: "材料発表",
    themes: ["バイオ", "創薬支援", "低位株"],
    spark: [40,42,41,44,48,55,62,72,88,96,103,118],
    time: "14:32"
  },
  {
    code: "6526", name: "ソシオネクスト", market: "東P",
    pct: 14.2, price: 4385, vol: "612万",
    reason: "通期上方修正・営業益2.1倍",
    cat: "上方修正",
    themes: ["AI", "半導体", "車載"],
    spark: [60,62,61,63,66,70,74,78,82,86,90,94],
    time: "13:11"
  },
  {
    code: "7011", name: "三菱重工業", market: "東P",
    pct: 8.9, price: 14820, vol: "1,210万",
    reason: "防衛装備品 追加受注観測",
    cat: "政策テーマ",
    themes: ["防衛", "重工", "政策"],
    spark: [70,71,72,72,73,75,78,80,82,84,86,88],
    time: "11:48"
  },
  {
    code: "4385", name: "メルカリ", market: "東P",
    pct: 7.4, price: 2418, vol: "980万",
    reason: "決算受けて買い戻し優勢",
    cat: "好決算",
    themes: ["内需", "EC"],
    spark: [60,58,56,58,61,64,66,69,72,75,77,80],
    time: "10:05"
  },
  {
    code: "9519", name: "レノバ", market: "東P",
    pct: 12.1, price: 1075, vol: "421万",
    reason: "TOBプレミアム期待で買い",
    cat: "TOB・M&A",
    themes: ["再エネ", "TOB"],
    spark: [55,55,56,57,60,68,75,82,88,92,94,96],
    time: "09:40"
  },
  {
    code: "3132", name: "マクニカHD", market: "東P",
    pct: 6.3, price: 7820, vol: "320万",
    reason: "AI半導体 受注好調",
    cat: "材料発表",
    themes: ["AI", "半導体", "商社"],
    spark: [70,71,72,73,72,73,75,78,80,82,84,86],
    time: "09:12"
  },
];

const CATEGORIES = [
  { key: "earn",   label: "好決算",       count: 15, icon: "▲" },
  { key: "upward", label: "上方修正",     count: 18, icon: "▲" },
  { key: "div",    label: "増配",         count: 7,  icon: "¥" },
  { key: "tob",    label: "TOB・M&A",     count: 4,  icon: "◆" },
  { key: "ai",     label: "AI・半導体",   count: 22, icon: "AI" },
  { key: "bio",    label: "バイオ",       count: 9,  icon: "Bx" },
  { key: "def",    label: "防衛",         count: 6,  icon: "△" },
  { key: "fx",     label: "円安メリット", count: 11, icon: "¥/$" },
  { key: "pol",    label: "政策テーマ",   count: 11, icon: "★" },
  { key: "low",    label: "低位株",       count: 13, icon: "·" },
];

const FREE_ARTICLES = [
  {
    date: "5/20 14:32",
    code: "2342", name: "トランスジェニック",
    reason: "新規ライセンス契約発表",
    summary: "後場寄りに開示。バイオ関連の連想買いも入り、出来高は前日比約8倍。低位株への資金回帰の一例として整理。",
    read: "30秒"
  },
  {
    date: "5/20 13:11",
    code: "6526", name: "ソシオネクスト",
    reason: "通期上方修正・営業益2.1倍",
    summary: "車載・AI向け需要が想定を上振れ。半導体セクター全体への波及度合いを過去事例と並べて整理しています。",
    read: "30秒"
  },
  {
    date: "5/20 11:48",
    code: "7011", name: "三菱重工業",
    reason: "防衛装備品 追加受注観測",
    summary: "報道ベース。防衛セクター全体に持続的な資金流入が観測される中での反応として位置付け。",
    read: "30秒"
  },
  {
    date: "5/20 10:05",
    code: "4385", name: "メルカリ",
    reason: "決算受けて買い戻し優勢",
    summary: "悪材料出尽くしのパターン。過去3年の決算翌日の値動きとの類似度を簡易に比較。",
    read: "30秒"
  },
];

const FLOW_THEMES = [
  { rank: 1, name: "AI・半導体", change: +12.4, count: 22, hot: true },
  { rank: 2, name: "防衛",       change: +8.7,  count: 6 },
  { rank: 3, name: "バイオ",     change: +5.2,  count: 9 },
  { rank: 4, name: "上方修正",   change: +3.1,  count: 18 },
  { rank: 5, name: "TOB・M&A",   change: +2.8,  count: 4 },
  { rank: 6, name: "円安メリット", change: +1.6, count: 11 },
  { rank: 7, name: "増配",       change: +0.9,  count: 7 },
];

const REASON_RANK = [
  { name: "上方修正",  count: 18 },
  { name: "好決算",    count: 15 },
  { name: "政策テーマ", count: 11 },
  { name: "材料発表",  count: 9 },
  { name: "増配",      count: 7 },
  { name: "TOB・M&A",  count: 4 },
];

const WATCH_THEMES = [
  { name: "AI周辺銘柄",         note: "半導体上流から検査・装置まで波及確認中", level: "観察" },
  { name: "防衛関連",           note: "受注報道の継続性に注目", level: "観察" },
  { name: "低時価総額の好決算",  note: "出来高急増を伴うものに限定", level: "観察" },
  { name: "TOBプレミアム関連",   note: "事例増加。過熱の可能性も併記", level: "注意" },
];

const BACKTEST_CARDS = [
  {
    title: "上方修正 × 出来高急増",
    period: "過去3年",
    note: "翌週末まで「注目継続」と分類された事例は全体の62%。下落転換は18%。",
    detail: "サンプル数 n=214",
  },
  {
    title: "TOB公表後5営業日の値動き",
    period: "過去5年",
    note: "プレミアム水準±2%への収束が約7割。乖離継続は条件次第。",
    detail: "サンプル数 n=88",
  },
  {
    title: "防衛テーマ 報道反応の半減期",
    period: "過去2年",
    note: "報道初動から平均5.3営業日で出来高は半減。継続性は個別要因に依存。",
    detail: "サンプル数 n=47",
  },
];

// ===== ARCHIVE SAMPLE =====
// Notion / Supabase に蓄積された過去の急騰検知ログのサンプル。
// 実環境では useArchive() が Supabase から取得した行で上書きされる。
const SAMPLE_ARCHIVE = [
  // 2026-05-20
  { code: "2342", name: "トランスジェニック", reason: "新規ライセンス契約発表", themes: ["バイオ","創薬支援","低位株"], detected_at: "2026-05-20T14:32:00+09:00", business: "遺伝子改変動物の開発・受託研究を手掛けるバイオベンチャー。", backgrounds: ["主力の遺伝子改変マウスは創薬研究で需要が安定。", "新規ライセンス契約により業績寄与が見込まれる。"] },
  { code: "6526", name: "ソシオネクスト", reason: "通期上方修正・営業益2.1倍", themes: ["AI","半導体","車載"], detected_at: "2026-05-20T13:11:00+09:00", business: "データセンター・車載向けカスタムSoCを設計するファブレス半導体企業。" },
  { code: "7011", name: "三菱重工業", reason: "防衛装備品 追加受注観測", themes: ["防衛","重工","政策"], detected_at: "2026-05-20T11:48:00+09:00", business: "防衛・原子力・航空宇宙・産業機械を手掛ける重工大手。" },
  { code: "4385", name: "メルカリ", reason: "決算受けて買い戻し優勢", themes: ["内需","EC"], detected_at: "2026-05-20T10:05:00+09:00", business: "CtoCフリマアプリ「メルカリ」を運営。" },
  { code: "9519", name: "レノバ", reason: "TOBプレミアム期待で買い", themes: ["再エネ","TOB"], detected_at: "2026-05-20T09:40:00+09:00", business: "再生可能エネルギー発電事業を手掛ける独立系電力会社。" },
  { code: "3132", name: "マクニカHD", reason: "AI半導体 受注好調", themes: ["AI","半導体","商社"], detected_at: "2026-05-20T09:12:00+09:00" },
  // 2026-05-19
  { code: "7203", name: "トヨタ自動車", reason: "通期上方修正", themes: ["円安","自動車"], detected_at: "2026-05-19T13:55:00+09:00", business: "世界最大級の自動車メーカー。" },
  { code: "9984", name: "ソフトバンクグループ", reason: "AI関連投資先の評価益拡大", themes: ["AI","投資","半導体"], detected_at: "2026-05-19T11:20:00+09:00" },
  { code: "6920", name: "レーザーテック", reason: "EUVマスク検査装置の受注好調", themes: ["半導体","設備投資"], detected_at: "2026-05-19T10:34:00+09:00" },
  { code: "4565", name: "ネクセラファーマ", reason: "パイプライン進捗期待", themes: ["バイオ","希少疾患","中枢神経"], detected_at: "2026-05-19T09:48:00+09:00", business: "希少疾患・中枢神経系疾患領域の新薬開発バイオベンチャー。" },
  // 2026-05-18 (土) — 1件のみ
  { code: "9983", name: "ファーストリテイリング", reason: "月次売上高 好調", themes: ["インバウンド","円安","SPA"], detected_at: "2026-05-18T08:11:00+09:00" },
  // 2026-05-15
  { code: "8035", name: "東京エレクトロン", reason: "前工程装置 受注上振れ", themes: ["半導体","設備投資"], detected_at: "2026-05-15T14:08:00+09:00" },
  { code: "4661", name: "オリエンタルランド", reason: "GW入園者数 過去最高", themes: ["インバウンド","レジャー"], detected_at: "2026-05-15T13:22:00+09:00" },
  { code: "6758", name: "ソニーグループ", reason: "イメージセンサー出荷増", themes: ["半導体","車載","エンタメ"], detected_at: "2026-05-15T11:03:00+09:00" },
  { code: "9501", name: "東京電力HD", reason: "原発再稼働 報道", themes: ["原子力","電力","政策"], detected_at: "2026-05-15T10:14:00+09:00" },
  // 2026-05-14
  { code: "2158", name: "FRONTEO", reason: "AI創薬・法務向けAI受注拡大期待", themes: ["AI創薬","医療AI","国産AI"], detected_at: "2026-05-14T14:50:00+09:00", business: "独自AIエンジン「KIBIT」を核に、AI創薬・法務向けAIを提供する企業。" },
  { code: "5256", name: "ヘリオステクノHD", reason: "半導体製造装置 関連受注", themes: ["半導体","設備投資"], detected_at: "2026-05-14T11:33:00+09:00" },
  { code: "7375", name: "リファインバース", reason: "リサイクル事業 上方修正", themes: ["環境","循環型"], detected_at: "2026-05-14T10:01:00+09:00" },
  // 2026-05-13
  { code: "6526", name: "ソシオネクスト", reason: "AI・データセンター向け受注", themes: ["AI","半導体","データセンター"], detected_at: "2026-05-13T15:30:00+09:00" },
  { code: "3591", name: "ワコールHD", reason: "構造改革進展・業績回復期待", themes: ["構造改革","インナーウェア"], detected_at: "2026-05-13T12:10:00+09:00" },
  { code: "7810", name: "クロスフォー", reason: "ジュエリー事業好調", themes: ["インバウンド","高額消費"], detected_at: "2026-05-13T09:42:00+09:00" },
  // 2026-05-12
  { code: "5246", name: "ELEMENTS", reason: "本人確認AI 大口契約", themes: ["AI","フィンテック"], detected_at: "2026-05-12T14:00:00+09:00" },
  { code: "4733", name: "オービックビジネスコンサルタント", reason: "中堅向けクラウド ERP 好調", themes: ["SaaS","DX"], detected_at: "2026-05-12T13:24:00+09:00" },
  { code: "4055", name: "ティアンドエスグループ", reason: "AIインフラ運用受注拡大", themes: ["AI","受託","半導体周辺"], detected_at: "2026-05-12T11:18:00+09:00" },
  // 2026-05-11 (日)
  // 2026-05-08
  { code: "4063", name: "信越化学工業", reason: "シリコンウェハー価格上昇", themes: ["半導体","素材"], detected_at: "2026-05-08T14:42:00+09:00" },
  { code: "9433", name: "KDDI", reason: "決算で連続増配方針示唆", themes: ["通信","増配"], detected_at: "2026-05-08T13:05:00+09:00" },
  { code: "6074", name: "ジェイエスエス", reason: "好業績・業績上方修正期待", themes: ["スイミングスクール","フィットネス需要"], detected_at: "2026-05-08T10:25:00+09:00", business: "スイミングスクールを中心としたスポーツクラブ運営。" },
  // 2026-05-07
  { code: "4385", name: "メルカリ", reason: "海外ユーザー数 計画上振れ", themes: ["EC","海外展開"], detected_at: "2026-05-07T11:48:00+09:00" },
  { code: "6432", name: "竹内製作所", reason: "北米向け建機 受注堅調", themes: ["建機","円安","北米"], detected_at: "2026-05-07T10:09:00+09:00" },
  // 2026-05-01
  { code: "4385", name: "メルカリ", reason: "決算プレビュー期待", themes: ["EC"], detected_at: "2026-05-01T13:30:00+09:00" },
  { code: "9988", name: "ニッパツ", reason: "車載シート部品 受注堅調", themes: ["自動車部品","車載"], detected_at: "2026-05-01T10:55:00+09:00" },
  // 2026-04-28
  { code: "6920", name: "レーザーテック", reason: "次世代EUV検査機 出荷", themes: ["半導体","設備投資"], detected_at: "2026-04-28T14:18:00+09:00" },
  { code: "4324", name: "電通グループ", reason: "海外広告事業 回復", themes: ["広告","海外"], detected_at: "2026-04-28T11:02:00+09:00" },
  { code: "3936", name: "GMOグローバルサインHD", reason: "電子契約サービス契約数増", themes: ["SaaS","電子契約"], detected_at: "2026-04-28T09:55:00+09:00" },
  // 2026-04-24
  { code: "8035", name: "東京エレクトロン", reason: "通期業績予想を上方修正", themes: ["半導体","設備投資","上方修正"], detected_at: "2026-04-24T13:48:00+09:00" },
  { code: "7203", name: "トヨタ自動車", reason: "ハイブリッド販売 北米で過去最高", themes: ["自動車","HEV","北米"], detected_at: "2026-04-24T10:30:00+09:00" },
  // 2026-04-20
  { code: "7810", name: "クロスフォー", reason: "ジュエリー事業の好調による業績回復期待", themes: ["インバウンド","高額消費","ジュエリー需要回復"], detected_at: "2026-04-20T02:04:00+09:00" },
  { code: "3591", name: "ワコールHD", reason: "構造改革進展・業績回復期待", themes: ["構造改革","収益改善","インナーウェア"], detected_at: "2026-04-20T00:10:00+09:00" },
  // 2026-04-17
  { code: "2158", name: "FRONTEO", reason: "AI創薬・法務向けAIソリューションの受注拡大期待", themes: ["AI創薬","医療AI","国産AI","eディスカバリー"], detected_at: "2026-04-17T00:14:00+09:00" },
  // 2026-04-13
  { code: "6074", name: "ジェイエスエス", reason: "好業績・業績上方修正期待", themes: ["スイミングスクール","フィットネス需要","習い事需要"], detected_at: "2026-04-13T04:13:00+09:00" },
  // 2026-04-08
  { code: "9983", name: "ファーストリテイリング", reason: "好決算・月次売上高の好調", themes: ["インバウンド","円安","SPA","グローバル展開"], detected_at: "2026-04-08T00:11:00+09:00" },
  // 2026-04-01
  { code: "4565", name: "ネクセラファーマ", reason: "パイプライン進捗期待・臨床試験データ発表", themes: ["バイオベンチャー","希少疾患","中枢神経系","新薬開発"], detected_at: "2026-04-01T00:30:00+09:00" },
  // 2026-03-26
  { code: "6526", name: "ソシオネクスト", reason: "AI・データセンター向け半導体需要拡大", themes: ["AI半導体","データセンター向けSoC","ファブレス"], detected_at: "2026-03-26T01:41:00+09:00", business: "ファブレス半導体企業。データセンター・自動車向けカスタムSoCを設計開発。" },
  { code: "7375", name: "リファインバース", reason: "リサイクル事業 受注堅調", themes: ["環境","循環型"], detected_at: "2026-03-26T02:00:00+09:00" },
  // 2026-03-23
  { code: "9701", name: "東京會舘", reason: "婚礼需要 回復", themes: ["インバウンド","ブライダル"], detected_at: "2026-03-23T03:50:00+09:00" },
  { code: "8835", name: "太平洋興発", reason: "資源価格高 業績寄与", themes: ["資源","エネルギー"], detected_at: "2026-03-23T01:16:00+09:00" },
  // 2026-03-18
  { code: "7203", name: "トヨタ自動車", reason: "新型EV プラットフォーム公開", themes: ["自動車","EV","プラットフォーム"], detected_at: "2026-03-18T14:46:00+09:00" },
  { code: "9984", name: "ソフトバンクグループ", reason: "Arm関連 ポジティブ報道", themes: ["AI","半導体","投資"], detected_at: "2026-03-18T14:34:00+09:00" },
].map((e, i) => {
  // ── 表示確認用のダミー株価（実データ取得時は上書きされる）──
  // code を種にした決定論的な値で、急騰時 → 現在の変動を生成
  const codeNum = parseInt(e.code, 10) || (i + 1) * 137;
  const base = 200 + (codeNum * 7) % 8500;            // 急騰時株価（200〜8700円台）
  const driftPct = ((codeNum * 13) % 80) - 40;        // -40% 〜 +39%
  const surgePrice   = Math.round(base);
  const currentPrice = Math.max(50, Math.round(surgePrice * (1 + driftPct / 100)));
  return {
    id: "sample-" + i,
    market: "東",
    pct: null, price: null, vol: null,
    spark: null,
    // detected_at から HH:MM を派生して time に
    time: (e.detected_at || "").slice(11, 16),
    business: e.business || "",
    backgrounds: e.backgrounds || [],
    related_stocks: e.related_stocks || "",
    cat: e.reason,
    surge_price:   surgePrice,
    current_price: currentPrice,
    ...e,
  };
});

Object.assign(window, {
  SURGE_STOCKS, CATEGORIES, FREE_ARTICLES,
  FLOW_THEMES, REASON_RANK, WATCH_THEMES, BACKTEST_CARDS,
  SAMPLE_ARCHIVE,
});
