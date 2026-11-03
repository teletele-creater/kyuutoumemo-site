// ────────────────────────────────────────────────────────────
// 会員認証・課金ゲート
//   Supabase Auth（メールのマジックリンク）+ Stripe Payment Link
//
// SITE_CONFIG.PAYWALL.ENABLED が false の間は何も表示・ブロックしない
// （＝Stripe審査中も今まで通りのサイトとして動く）。
// 有料公開時に site-config.js の ENABLED を true にし、
// paywall_setup/PAYWALL-SETUP.md の手順で Stripe / Supabase を設定する。
// ────────────────────────────────────────────────────────────

function _paywallCfg() {
  return (window.SITE_CONFIG && window.SITE_CONFIG.PAYWALL) || {};
}

// テスト動作確認モード：URLに ?paywall=test を付けるとこのブラウザだけ
// 課金ゲートが有効になる（一般訪問者には影響なし）。?paywall=off で解除。
const _PAYWALL_TEST = (() => {
  try {
    const q = new URLSearchParams(window.location.search).get("paywall");
    if (q === "test") localStorage.setItem("kyuutou-paywall-test", "1");
    if (q === "off")  localStorage.removeItem("kyuutou-paywall-test");
    return localStorage.getItem("kyuutou-paywall-test") === "1";
  } catch (e) { return false; }
})();
function _paywallEnabled() { return !!_paywallCfg().ENABLED || _PAYWALL_TEST; }

// ---- Supabase クライアント（authセッション永続化つき・1個だけ） ----
let _authClient = null;
function getAuthClient() {
  if (_authClient) return _authClient;
  const c = window.SITE_CONFIG || {};
  if (!(c.SUPABASE_URL && c.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient)) return null;
  _authClient = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "kyuutou-auth",
    },
  });
  return _authClient;
}

// ---- グローバル auth ストア（Provider不要でどこからでも useAuth() できる） ----
const _authStore = {
  state: { loading: true, user: null, paid: false, paidLoading: false },
  subs: new Set(),
  set(patch) {
    this.state = { ...this.state, ...patch };
    this.subs.forEach(f => f(this.state));
  },
};

async function _refreshMembership(user) {
  if (!user) { _authStore.set({ paid: false, paidLoading: false }); return; }
  const sb = getAuthClient();
  if (!sb) return;
  const table = _paywallCfg().MEMBERS_TABLE || "members";
  _authStore.set({ paidLoading: true });
  try {
    const { data, error } = await sb
      .from(table)
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    const paid = !!(
      data &&
      data.status === "active" &&
      (!data.current_period_end ||
        new Date(data.current_period_end).getTime() > Date.now() - 24 * 3600 * 1000)
    );
    _authStore.set({ paid, paidLoading: false });
  } catch (e) {
    console.warn("[auth] 会員状態の取得に失敗", e);
    _authStore.set({ paid: false, paidLoading: false });
  }
}

let _authInited = false;
function _initAuth() {
  if (_authInited) return;
  _authInited = true;
  const sb = getAuthClient();
  if (!sb) { _authStore.set({ loading: false }); return; }
  sb.auth.getSession().then(({ data }) => {
    const user = data && data.session ? data.session.user : null;
    _authStore.set({ loading: false, user });
    _refreshMembership(user);
  });
  sb.auth.onAuthStateChange((_ev, session) => {
    const user = session ? session.user : null;
    _authStore.set({ loading: false, user });
    _refreshMembership(user);
  });
}

function useAuth() {
  const [s, setS] = React.useState(_authStore.state);
  React.useEffect(() => {
    _initAuth();
    const f = st => setS(st);
    _authStore.subs.add(f);
    setS(_authStore.state);
    return () => { _authStore.subs.delete(f); };
  }, []);
  return {
    ...s,
    enabled: _paywallEnabled(),
    signOut: async () => { const sb = getAuthClient(); if (sb) await sb.auth.signOut(); },
    refresh: () => _refreshMembership(_authStore.state.user),
  };
}

// Stripe Payment Link に「誰の支払いか」を載せる
function _checkoutUrl(user) {
  const cfg = _paywallCfg();
  const link = (_PAYWALL_TEST && cfg.TEST_PAYMENT_LINK) ? cfg.TEST_PAYMENT_LINK : (cfg.STRIPE_PAYMENT_LINK || "");
  if (!link || !user) return null;
  const sep = link.includes("?") ? "&" : "?";
  return link + sep +
    "client_reference_id=" + encodeURIComponent(user.id) +
    "&prefilled_email=" + encodeURIComponent(user.email || "");
}

// ---- ログインボックス（マジックリンク送信） ----
function LoginBox({ dark }) {
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [err, setErr] = React.useState(null);

  const send = async () => {
    const sb = getAuthClient();
    if (!sb || !email.trim()) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await sb.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setErr(e.message || "送信に失敗しました。時間をおいてお試しください。");
    } finally {
      setBusy(false);
    }
  };

  // メール記載の6桁コードでログイン（リンク不要・メールの先読み対策）
  const verify = async () => {
    const sb = getAuthClient();
    const token = code.trim();
    if (!sb || token.length < 6) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await sb.auth.verifyOtp({ email: email.trim(), token, type: "email" });
      if (error) throw error;
      // 成功すると onAuthStateChange が発火し、この画面は自動で切り替わる
    } catch (e) {
      setErr("コードが正しくないか、期限切れです。もう一度お試しください。");
      setBusy(false);
    }
  };

  const fg = dark ? "#E8EAED" : "var(--ink)";
  const sub = dark ? "#A3A7AE" : "var(--muted)";
  if (sent) {
    return (
      <div style={{ fontSize: 12.5, lineHeight: 1.8, color: fg }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>確認メールを送信しました</div>
        <div style={{ color: sub, marginBottom: 10 }}>
          {email} 宛のメールに記載された<b>8桁のログインコード</b>を入力してください。
          （迷惑メールフォルダもご確認ください）
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={e => setCode(e.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={e => { if (e.key === "Enter") verify(); }}
            placeholder="8桁コード"
            style={{
              width: 140, fontSize: 16, letterSpacing: "0.25em", textAlign: "center",
              padding: "9px 10px",
              border: dark ? "1px solid rgba(255,255,255,0.2)" : "1px solid var(--hairline-strong)",
              background: dark ? "rgba(255,255,255,0.06)" : "var(--bg)",
              color: fg, outline: "none",
            }}
          />
          <button className="btn btn-gold tappable" disabled={busy || code.trim().length < 6} onClick={verify}
            style={{ opacity: busy || code.trim().length < 6 ? 0.6 : 1, whiteSpace: "nowrap" }}>
            {busy ? "確認中…" : "ログイン"}
          </button>
        </div>
        {err && <div style={{ fontSize: 11, color: "var(--up)", marginTop: 6 }}>{err}</div>}
        <button onClick={() => { setSent(false); setCode(""); setErr(null); }}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 10, fontSize: 11, color: sub, textDecoration: "underline" }}>
          別のメールアドレスでやり直す
        </button>
      </div>
    );
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: sub, marginBottom: 8, lineHeight: 1.7 }}>
        メールアドレスに8桁のログインコードをお送りします。パスワードは不要です。
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") send(); }}
          placeholder="メールアドレス"
          style={{
            flex: 1, minWidth: 0, fontSize: 13, padding: "9px 10px",
            border: dark ? "1px solid rgba(255,255,255,0.2)" : "1px solid var(--hairline-strong)",
            background: dark ? "rgba(255,255,255,0.06)" : "var(--bg)",
            color: fg, outline: "none",
          }}
        />
        <button className="btn btn-gold tappable" disabled={busy || !email.trim()} onClick={send}
          style={{ opacity: busy || !email.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}>
          {busy ? "送信中…" : "送信"}
        </button>
      </div>
      {err && <div style={{ fontSize: 11, color: "var(--up)", marginTop: 6 }}>{err}</div>}
    </div>
  );
}

// ---- 未課金ユーザー向け：決済への誘導 ----
function CheckoutBox({ dark }) {
  const auth = useAuth();
  const url = _checkoutUrl(auth.user);
  const sub = dark ? "#A3A7AE" : "var(--muted)";
  return (
    <div>
      <div style={{ fontSize: 12, color: sub, lineHeight: 1.7, marginBottom: 10 }}>
        {auth.user && auth.user.email ? `${auth.user.email} でログイン中。` : ""}
        初回30日間は無料です。以降は月額500円（税込）で全コンテンツをご覧いただけます。いつでも解約できます。
      </div>
      {url ? (
        <a href={url} className="btn btn-gold tappable"
          style={{ display: "block", textAlign: "center", textDecoration: "none", width: "100%" }}>
          30日間無料で試す（以降月額500円）
        </a>
      ) : (
        <div style={{ fontSize: 12, color: sub, border: "1px dashed " + (dark ? "rgba(255,255,255,0.25)" : "var(--hairline-strong)"), padding: "10px 12px", lineHeight: 1.7 }}>
          決済の準備中です。もうしばらくお待ちください。
        </div>
      )}
      <div style={{ display: "flex", gap: 12, marginTop: 10, alignItems: "center" }}>
        <button onClick={auth.refresh} className="tappable" style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontSize: 11, color: sub, textDecoration: "underline", padding: 0,
        }}>支払い済みの方はこちら（反映を確認）</button>
        <button onClick={auth.signOut} className="tappable" style={{
          background: "transparent", border: "none", cursor: "pointer",
          fontSize: 11, color: sub, textDecoration: "underline", padding: 0,
        }}>ログアウト</button>
      </div>
    </div>
  );
}

// テストモード中であることの表示
function TestModeBadge({ dark }) {
  if (!_PAYWALL_TEST || _paywallCfg().ENABLED) return null;
  return (
    <div style={{
      marginBottom: 10, padding: "6px 8px",
      border: "1px dashed " + (dark ? "rgba(255,255,255,0.35)" : "var(--hairline-strong)"),
      fontSize: 10.5, lineHeight: 1.6,
      color: dark ? "#A3A7AE" : "var(--muted)",
    }}>
      テスト動作確認モード（このブラウザのみ）。URLに ?paywall=off を付けると解除。
    </div>
  );
}

// ---- 課金ゲート：有料コンテンツを包む ----
function PayGate({ children, dark, label, navigate }) {
  const auth = useAuth();
  if (!auth.enabled) return children;
  if (auth.paid) return children;

  const boxStyle = dark
    ? { background: "#17191E", color: "#E8EAED", minHeight: "100%", padding: "0 0 24px" }
    : { padding: "0 0 24px" };
  const cardStyle = dark
    ? { margin: "16px 16px 0", padding: "18px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }
    : { margin: "16px 14px 0", padding: "18px 16px", background: "var(--surface)", border: "1px solid var(--hairline)" };

  return (
    <div className="page-enter" style={boxStyle}>
      {dark ? (
        <div style={{
          padding: "14px 16px 12px",
          background: "var(--navy-deep)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <button onClick={navigate ? () => navigate("home") : undefined} className="tappable" style={{
            background: "transparent", border: "none", color: "#A3A7AE",
            cursor: "pointer", padding: "0 0 4px", fontSize: 13,
          }}>‹ ホーム</button>
          <h1 className="mincho" style={{
            margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: "0.02em", color: "#fff",
          }}>{label || "有料会員限定"}</h1>
        </div>
      ) : (
        window.PageHeader && (
          <PageHeader title={label || "有料会員限定"} onBack={navigate ? () => navigate("home") : undefined}/>
        )
      )}
      <div style={cardStyle}>
        <TestModeBadge dark={dark}/>
        <div className="eyebrow" style={{ color: dark ? "var(--marker)" : "var(--gold)", marginBottom: 8 }}>
          有料会員限定
        </div>
        <div className="mincho" style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: dark ? "#fff" : "var(--ink)" }}>
          このコンテンツは会員の方のみご覧いただけます
        </div>
        {auth.loading || auth.paidLoading ? (
          <div style={{ fontSize: 12, color: dark ? "#A3A7AE" : "var(--muted)" }}>確認中…</div>
        ) : auth.user ? (
          <CheckoutBox dark={dark}/>
        ) : (
          <LoginBox dark={dark}/>
        )}
      </div>
      <div style={{ padding: "14px 16px 0", fontSize: 11, lineHeight: 1.8, color: dark ? "#7D828B" : "var(--muted-2)" }}>
        無料でご覧いただける「今日の急騰理由メモ」「急騰理由カテゴリ」「アーカイブ（直近2営業日）」はこれまで通りご利用いただけます。
      </div>
    </div>
  );
}

// ---- プランページ用：ログイン／会員状態ブロック ----
function PaywallAccount({ navigate }) {
  const auth = useAuth();
  if (!auth.enabled) return null;
  return (
    <div style={{
      margin: "16px 14px 0",
      background: "var(--surface)",
      border: "1px solid var(--hairline)",
      padding: "16px 16px",
    }}>
      <TestModeBadge/>
      <div className="eyebrow" style={{ color: "var(--gold)", letterSpacing: "0.22em", marginBottom: 8 }}>
        会員ステータス
      </div>
      {auth.loading ? (
        <div style={{ fontSize: 12, color: "var(--muted)" }}>確認中…</div>
      ) : !auth.user ? (
        <LoginBox/>
      ) : auth.paid ? (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            有料会員としてログイン中
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.7, marginBottom: 10 }}>
            {auth.user.email}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {_paywallCfg().STRIPE_PORTAL_LINK && (
              <a href={_paywallCfg().STRIPE_PORTAL_LINK} style={{
                fontSize: 11.5, color: "var(--navy)", textDecoration: "underline",
              }}>お支払い・解約の管理</a>
            )}
            <button onClick={auth.signOut} className="tappable" style={{
              background: "transparent", border: "none", cursor: "pointer",
              fontSize: 11.5, color: "var(--muted)", textDecoration: "underline", padding: 0,
            }}>ログアウト</button>
          </div>
        </div>
      ) : (
        <CheckoutBox/>
      )}
    </div>
  );
}

// ---- アーカイブページ上部の注意書き（無料は前日と当日） ----
function ArchivePayNotice({ navigate }) {
  const auth = useAuth();
  if (!auth.enabled || auth.paid || auth.loading) return null;
  return (
    <div style={{
      margin: "10px 14px 0",
      padding: "10px 12px",
      background: "var(--surface)",
      border: "1px solid var(--hairline)",
      fontSize: 11.5, lineHeight: 1.7, color: "var(--muted)",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ flex: 1 }}>
        無料プランでは直近2営業日分を表示しています。それ以前の閲覧は有料会員限定です。
      </span>
      <button className="btn btn-gold tappable" onClick={() => navigate && navigate("plan")}
        style={{ whiteSpace: "nowrap", fontSize: 11, padding: "6px 10px" }}>
        詳しく
      </button>
    </div>
  );
}

// 「30日無料で試す」CTAの共通動作：
//   ログイン済みならそのままStripe決済へ、未ログインならプラン頁のログイン欄へ
 function goPremiumCheckout(navigate) {
  const st = _authStore.state;
  if (!st.paid && st.user) {
    const url = _checkoutUrl(st.user);
    if (url) { window.location.href = url; return; }
  }
  if (navigate) navigate("plan");
  setTimeout(() => {
    const sc = document.querySelector(".dk-content") || document.querySelector(".scroll");
    if (sc) sc.scrollTo({ top: 0, behavior: "smooth" });
  }, 60);
}

Object.assign(window, {
  useAuth, getAuthClient, goPremiumCheckout,
  PayGate, PaywallAccount, ArchivePayNotice, LoginBox,
});
