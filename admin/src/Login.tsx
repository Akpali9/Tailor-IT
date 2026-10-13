import { useEffect, useState, type FormEvent } from "react";
import { supabase, errMsg } from "./lib";

type Step = "password" | "enroll" | "challenge";

/** Password → mandatory TOTP (aal2). Database policies reject any admin action without aal2. */
export default function Login({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const afterPassword = async () => {
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const verified = factors?.totp?.find((f) => f.status === "verified");
    if (verified) { setFactorId(verified.id); setStep("challenge"); return; }
    for (const f of factors?.totp ?? []) await supabase.auth.mfa.unenroll({ factorId: f.id }); // clean half-finished enrolments
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Tailor IT Console" });
    if (error) throw error;
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setStep("enroll");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      if (step === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error("Invalid credentials");
        await afterPassword();
      } else {
        const ch = await supabase.auth.mfa.challenge({ factorId });
        if (ch.error) throw ch.error;
        const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: code.trim() });
        if (v.error) throw new Error("Incorrect code");
        const { data: ok } = await supabase.rpc("is_admin");
        if (ok !== true) { await supabase.auth.signOut(); throw new Error("This account is not authorised."); }
        onDone();
      }
    } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); }
  };
  useEffect(() => { void supabase.auth.signOut(); }, []);

  return (
    <div className="login"><form className="login-box" onSubmit={submit}>
      <h1>Tailor IT Console</h1>
      <p>{step === "password" ? "Authorised staff only." : step === "enroll" ? "Set up your authenticator app" : "Enter the 6-digit code from your authenticator."}</p>
      {step === "password" && <>
        <label>Email<input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label></>}
      {step === "enroll" && <><img className="qr" src={qr} alt="MFA QR code" /><p style={{ fontSize: 12, wordBreak: "break-all" }}>Or enter manually: <code>{secret}</code></p></>}
      {step !== "password" && <label>6-digit code<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus required /></label>}
      {err && <p className="err" role="alert">{err}</p>}
      <button className="btn primary" style={{ width: "100%", marginTop: 18 }} disabled={busy}>{busy ? "…" : step === "password" ? "Continue" : "Verify & sign in"}</button>
    </form></div>
  );
}
