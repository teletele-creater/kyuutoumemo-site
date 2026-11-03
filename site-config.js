// ────────────────────────────────────────────────────────────
// サイト接続情報（Supabase Realtime）
//
// anon キーは公開してOK（RLSで読み取り専用に制限済み）。
// service_role キーは絶対にここに置かないこと。
// ────────────────────────────────────────────────────────────
window.SITE_CONFIG = {
  SUPABASE_URL:      "https://byywhukxggelizpckbba.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5eXdodWt4Z2dlbGl6cGNrYmJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjQ0NTAsImV4cCI6MjA5NDkwMDQ1MH0.Dg-rXPTzV2YrHS9-mCVBkUMTDWLAWKHxARwJ1rMaRw4",
  SUPABASE_TABLE:    "surge_events",

  // ── 有料会員（ペイウォール）設定 ──
  // ENABLEDをtrueにするとログイン＋課金ゲートが有効になる。
  // 手順は paywall_setup/PAYWALL-SETUP.md 参照。
  PAYWALL: {
    ENABLED: true,
    STRIPE_PAYMENT_LINK: "https://buy.stripe.com/bJedRb7cYdgkdfC5g2cQU00",  // 月額500円・初月無料
    TEST_PAYMENT_LINK:   "",  // サンドボックスのテスト用Payment Link（?paywall=test 中のみ使用）
    STRIPE_PORTAL_LINK:  "https://billing.stripe.com/p/login/bJedRb7cYdgkdfC5g2cQU00",  // 解約用ポータル
    MEMBERS_TABLE: "members",
  },
};
