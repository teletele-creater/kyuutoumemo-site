// ────────────────────────────────────────────────────────────
// 広告設定 — リンクは全部ここに集約
//
// ASP（アフィリエイト）契約後にやること：
//   1. accountUrl / scouterInfoUrl を ASP発行のアフィリエイトリンクに差し替える
//   2. affiliate を true にする（紹介ページの表記が確定文言になる）
// それまでは公式サイトへの通常リンク。
//
// 枠を個別にON/OFFしたい場合は slots を編集。
// ────────────────────────────────────────────────────────────
window.ADS_CONFIG = {
  enabled: true,          // false で全枠を一括非表示
  affiliate: true,        // アフィリエイトリンク差し替え済みなら true
  slots: {
    stockDetail: true,    // 銘柄詳細ページ（リアルチャート直下）
    home: true,           // ホーム（無料記事の下）
    footer: true,         // ホーム下部（免責の上の細い帯）
  },
  monex: {
    // PRカード・紹介ページに表示する画像（ASP支給のバナーや公式スクリーンショット）。
    // 画像ファイルを ads/ フォルダに置いてパスを指定。空文字なら非表示。
    cardImage: "",        // 例: "ads/scouter-banner.png"（銘柄詳細のPRカード内）
    pageImage: "",        // 例: "ads/scouter-screen.png"（紹介ページの画面イメージ枠）
    // 銘柄スカウター公式紹介ページ（TCSアフィリエイト / バナーID 1: 総合取引口座開設）
    scouterInfoUrl: "https://www.tcs-asp.net/alink?AC=C142433&LC=MXSEC1&SQ=0&isq=1",
    // 口座開設の導線（TCSアフィリエイト / バナーID 1: 総合取引口座開設）
    accountUrl: "https://www.tcs-asp.net/alink?AC=C142433&LC=MXSEC1&SQ=0&isq=1",
    // 口座開設不要のライト版（通常リンクのままでOK）
    liteUrl: "https://scouter.monex.co.jp/",
    rel: "sponsored noopener noreferrer",
  },
};
