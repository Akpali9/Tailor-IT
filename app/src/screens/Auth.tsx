import { useState, type FormEvent } from "react";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { friendly } from "@/lib/errors";
import { openUrl } from "@/lib/native";
import { usePlatformSettings } from "@/lib/queries";
import { Button, Field } from "@/components/ui";
import Icon from "@/components/Icon";
import Logo from "@/components/Logo";
import type { Role } from "@/lib/types";

type Mode = "signin" | "signup" | "forgot" | "sent" | "reset";

export default function Auth({ initialMode = "signin" }: { initialMode?: Mode }) {
  const { signIn, signUp, sendReset, updatePassword } = useAuth();
  const toast = useToast();
  const { data: settings } = usePlatformSettings();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [role, setRole] = useState<Role>("client");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referral, setReferral] = useState("");
  const [agree, setAgree] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const terms = String(settings?.terms_url ?? "https://tailorit.app/terms");
  const privacy = String(settings?.privacy_url ?? "https://tailorit.app/privacy");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode !== "reset" && !/^\S+@\S+\.\S+$/.test(email)) return setError("Enter a valid email address.");
    if ((mode === "signup" || mode === "reset") && password.length < 8) return setError("Use at least 8 characters for your password.");
    if (mode === "signup" && name.trim().length < 2) return setError("Tell us your name.");
    if (mode === "signup" && !agree) return setError("Please accept the Terms and Privacy Policy.");
    setBusy(true);
    try {
      if (mode === "signin") await signIn(email, password);
      else if (mode === "signup") { const r = await signUp({ email, password, fullName: name, role, referral }); if (r.needsConfirmation) setMode("sent"); }
      else if (mode === "forgot") { await sendReset(email); setMode("sent"); }
      else if (mode === "reset") { await updatePassword(password); toast("Password updated", "success"); }
    } catch (err) { setError(friendly(err)); } finally { setBusy(false); }
  };

  const heading = {
    signin: <>Designed to fit.<br /><em>Made to belong.</em></>,
    signup: <>Your style journey<br /><em>starts here.</em></>,
    forgot: <>Reset your<br /><em>password.</em></>,
    sent: <>Check your<br /><em>inbox.</em></>,
    reset: <>Choose a new<br /><em>password.</em></>,
  }[mode];

  return (
    <main className="auth-screen">
      <div className="auth-wrap">
        <Logo />
        <span className="overline">{mode === "signin" ? "WELCOME BACK" : mode === "signup" ? "JOIN TAILOR IT" : "ACCOUNT"}</span>
        <h1>{heading}</h1>

        {mode === "sent" ? (
          <>
            <p className="intro">{initialMode === "forgot" || email ? `We've sent a link to ${email || "your email"}. Open it on this device to continue.` : "Open the link we emailed you on this device."}</p>
            <Button variant="secondary" className="full" onClick={() => setMode("signin")}>Back to sign in</Button>
          </>
        ) : (
          <>
            <p className="intro">
              {mode === "signin" && "Visualize your look, perfect your fit, and work directly with exceptional designers."}
              {mode === "signup" && "Discover independent designers and order clothing made for your body."}
              {mode === "forgot" && "Enter your email and we'll send you a secure reset link."}
              {mode === "reset" && "Pick a strong password you haven't used elsewhere."}
            </p>
            {mode === "signup" && (
              <div className="role-switch" role="radiogroup" aria-label="Account type">
                <button type="button" role="radio" aria-checked={role === "client"} className={role === "client" ? "active" : ""} onClick={() => setRole("client")}><Icon name="user" size={17} /> I'm a client</button>
                <button type="button" role="radio" aria-checked={role === "designer"} className={role === "designer" ? "active" : ""} onClick={() => setRole("designer")}><Icon name="hanger" size={17} /> I'm a designer</button>
              </div>
            )}
            <form onSubmit={submit} noValidate>
              {mode === "signup" && <Field label={role === "designer" ? "Your name or brand" : "Full name"}><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="How should we address you?" /></Field>}
              {mode !== "reset" && <Field label="Email address"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" placeholder="you@example.com" /></Field>}
              {mode !== "forgot" && (
                <Field label={mode === "reset" ? "New password" : "Password"}>
                  <div className="password-field">
                    <input value={password} onChange={(e) => setPassword(e.target.value)} type={show ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder={mode === "signin" ? "Enter your password" : "At least 8 characters"} />
                    <button type="button" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}><Icon name="eye" size={18} /></button>
                  </div>
                </Field>
              )}
              {mode === "signup" && <Field label="Invite code (optional)"><input value={referral} onChange={(e) => setReferral(e.target.value.toUpperCase())} autoCapitalize="characters" placeholder="e.g. A1B2C3D4" /></Field>}
              {mode === "signup" && (
                <label className="check">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>I agree to the <button type="button" className="link" onClick={() => void openUrl(terms)}>Terms</button> and <button type="button" className="link" onClick={() => void openUrl(privacy)}>Privacy Policy</button></span>
                </label>
              )}
              {error && <p className="form-error" role="alert">{error}</p>}
              {mode === "signin" && <div className="form-meta"><button type="button" className="link" onClick={() => { setMode("forgot"); setError(""); }}>Forgot password?</button></div>}
              <Button type="submit" className="full" loading={busy}>
                {mode === "signin" ? "Sign in" : mode === "signup" ? "Create my account" : mode === "forgot" ? "Send reset link" : "Save password"} <Icon name="arrow" size={17} />
              </Button>
            </form>
            {mode !== "reset" && (
              <p className="switch-mode">
                {mode === "signin" ? "New to Tailor IT?" : "Already have an account?"}{" "}
                <button className="link" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); }}>{mode === "signin" ? "Create account" : "Sign in"}</button>
              </p>
            )}
            <small className="legal"><Icon name="lock" size={12} /> Your photos and measurements are encrypted and only used to serve you.</small>
          </>
        )}
      </div>
    </main>
  );
}
