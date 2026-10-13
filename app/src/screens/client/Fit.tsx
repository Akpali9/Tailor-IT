import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Header, Loading } from "@/components/ui";
import Icon from "@/components/Icon";
import { useMeasurements } from "@/lib/queries";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { supabase } from "@/lib/supabase";
import { friendly } from "@/lib/errors";
import { CM_PER_IN } from "@/lib/format";
import { MEASUREMENT_FIELDS, REQUIRED_MEASUREMENTS } from "@/lib/types";

interface Proposed { measurements: Record<string, number>; confidence: number; tips: string[] }

export default function Fit() {
  const { session } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const qc = useQueryClient();
  const proposed = (useLocation().state as { proposed?: Proposed } | null)?.proposed;
  const { data, isLoading } = useMeasurements();
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [aiKeys, setAiKeys] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const show = (cm: number) => String(unit === "cm" ? Math.round(cm * 10) / 10 : Math.round((cm / CM_PER_IN) * 10) / 10);
  const toCm = (v: string) => { const n = parseFloat(v.replace(",", ".")); return Number.isFinite(n) ? (unit === "cm" ? n : n * CM_PER_IN) : NaN; };

  useEffect(() => {
    const base = Object.fromEntries(Object.entries(data?.sizes ?? {}).map(([k, v]) => [k, show(v)]));
    if (proposed) {
      const merged = { ...base };
      for (const [k, v] of Object.entries(proposed.measurements)) merged[k] = show(v);
      setDraft(merged); setAiConfidence(proposed.confidence); setAiKeys(new Set(Object.keys(proposed.measurements))); setDirty(true);
    } else setDraft(base);
  }, [data, unit, proposed]); // eslint-disable-line react-hooks/exhaustive-deps

  const filled = MEASUREMENT_FIELDS.filter((f) => Number.isFinite(toCm(draft[f.key] ?? ""))).length;
  const pct = Math.round((filled / MEASUREMENT_FIELDS.length) * 100);

  const save = async () => {
    const sizes: Record<string, number> = {};
    for (const f of MEASUREMENT_FIELDS) {
      const cm = toCm(draft[f.key] ?? "");
      if (!draft[f.key]) continue;
      if (!Number.isFinite(cm) || cm < 5 || cm > 260) return toast(`Check your ${f.label.toLowerCase()} value`, "error");
      sizes[f.key] = Math.round(cm * 10) / 10;
    }
    setSaving(true);
    try {
      const usedAi = aiKeys.size > 0;
      const allAi = usedAi && Object.keys(sizes).every((k) => aiKeys.has(k));
      const { error } = await supabase.from("measurements").upsert({
        user_id: session!.user.id, sizes, source: allAi ? "ai_estimate" : usedAi ? "mixed" : "manual", confidence: usedAi ? aiConfidence : null,
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["measurements"] });
      setDirty(false); setAiKeys(new Set());
      toast("Measurements saved", "success");
      nav(".", { replace: true, state: null });
    } catch (e) { toast(friendly(e), "error"); } finally { setSaving(false); }
  };

  if (isLoading) return <><Header title="My fit profile" /><Loading /></>;
  return (
    <>
      <Header title="My fit profile" subtitle="Accurate measurements for a perfect fit" />
      <section className="fit-score">
        <div className="score-ring" style={{ ["--p" as string]: pct }}><strong>{pct}</strong><span>%</span></div>
        <div>
          <small>PROFILE COMPLETENESS</small>
          <h2>{filled >= REQUIRED_MEASUREMENTS ? "Ready to order" : "Add a few more"}</h2>
          <p>{filled} of {MEASUREMENT_FIELDS.length} measurements. {filled < REQUIRED_MEASUREMENTS ? `You need at least ${REQUIRED_MEASUREMENTS} to order.` : "More detail means a better first fit."}</p>
        </div>
      </section>

      {proposed && (
        <section className="callout soft" role="status">
          <b><Icon name="sparkle" size={15} /> AI estimate loaded — please verify</b>
          <p>Confidence {proposed.confidence}%. Photo estimates are approximate: measure yourself with a tape where you can, then save.</p>
          {proposed.tips.map((t) => <small key={t}>• {t}</small>)}
        </section>
      )}

      <section className="measure-card">
        <div className="measure-head">
          <div><span>BODY MEASUREMENTS</span><h2>Fit details</h2></div>
          <div className="unit-toggle" role="group" aria-label="Units">
            {(["cm", "in"] as const).map((u) => <button key={u} className={unit === u ? "active" : ""} aria-pressed={unit === u} onClick={() => setUnit(u)}>{u}</button>)}
          </div>
        </div>
        <div className="measure-grid">
          {MEASUREMENT_FIELDS.map((f) => (
            <label key={f.key} className={aiKeys.has(f.key) ? "ai" : ""}>
              <span>{f.label}{aiKeys.has(f.key) && <i title="AI estimate"> ✦</i>}</span>
              <div><input inputMode="decimal" value={draft[f.key] ?? ""} placeholder="—" aria-describedby={`h-${f.key}`}
                onChange={(e) => { setDraft({ ...draft, [f.key]: e.target.value }); setDirty(true); setAiKeys((s) => { const n = new Set(s); n.delete(f.key); return n; }); }} /><em>{unit}</em></div>
              <small id={`h-${f.key}`}>{f.hint}</small>
            </label>
          ))}
        </div>
        <Button className="full" disabled={!dirty} loading={saving} onClick={save}>Save measurements</Button>
        <Button variant="secondary" className="full" onClick={() => nav("/try-on", { state: { intent: "estimate" } })}><Icon name="camera" size={17} /> Estimate from a photo (AI)</Button>
      </section>

      <section className="privacy-card">
        <Icon name="lock" />
        <div><h3>You control your measurements</h3><p>A designer only receives a copy when you place and pay for an order. Edit or delete them any time.</p></div>
      </section>
    </>
  );
}
