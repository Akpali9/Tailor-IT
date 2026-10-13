import { useState } from "react";
import { Button, Sheet } from "./ui";
import Icon from "./Icon";
import { useAuth } from "@/state/Auth";
import { useToast } from "@/state/Toast";
import { supabase } from "@/lib/supabase";
import { friendly } from "@/lib/errors";
import { openUrl } from "@/lib/native";
import { usePlatformSettings } from "@/lib/queries";

/** Explicit, revocable consent before photos or measurements are sent to AI providers. */
export default function ConsentSheet({ onClose, onAccepted }: { onClose: () => void; onAccepted: () => void }) {
  const { session, refresh } = useAuth();
  const toast = useToast();
  const { data: settings } = usePlatformSettings();
  const [busy, setBusy] = useState(false);
  const accept = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("profile_private").update({ ai_consent_at: new Date().toISOString() }).eq("user_id", session!.user.id);
      if (error) throw error;
      await refresh();
      onAccepted();
    } catch (e) { toast(friendly(e), "error"); } finally { setBusy(false); }
  };
  return (
    <Sheet onClose={onClose} label="AI processing notice">
      <div className="sheet-pad">
        <span className="big-icon plum"><Icon name="shield" size={30} /></span>
        <h2>Before we use AI on your photo</h2>
        <ul className="plain-list">
          <li>Your photo is sent securely to our AI partners <b>only</b> to create your try-on or measurement estimate.</li>
          <li>Source photos are automatically deleted after 7 days; generated previews after 30.</li>
          <li>Your photo is never shown to designers or other users.</li>
          <li>AI results are approximate. You always review measurements before they're saved.</li>
          <li>You can withdraw consent any time in Profile → Privacy.</li>
        </ul>
        <Button className="full" loading={busy} onClick={accept}>I understand — continue</Button>
        <button className="link center" onClick={() => void openUrl(String(settings?.privacy_url ?? "https://tailorit.app/privacy"))}>Read the Privacy Policy</button>
      </div>
    </Sheet>
  );
}
