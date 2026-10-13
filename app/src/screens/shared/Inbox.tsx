import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Empty, ErrorState, Header, Loading } from "@/components/ui";
import Icon from "@/components/Icon";
import { useNotifications } from "@/lib/queries";
import { supabase, APP_SCHEME } from "@/lib/supabase";
import { openUrl } from "@/lib/native";
import { timeAgo } from "@/lib/format";
import type { AppNotification } from "@/lib/types";

const iconFor = (k: string) => (k.startsWith("broadcast") ? "megaphone" : k === "payment" ? "card" : k === "order" ? "bag" : "bell");

export default function Inbox() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useNotifications();
  const unread = (data ?? []).filter((n) => !n.read_at).length;

  const markAll = async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  const open = async (n: AppNotification) => {
    if (!n.read_at) { await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id); void qc.invalidateQueries({ queryKey: ["notifications"] }); }
    if (n.data.order_id) nav(`/orders/${n.data.order_id}`);
    else if (n.data.link?.startsWith(`${APP_SCHEME}://`)) nav("/" + n.data.link.slice(`${APP_SCHEME}://`.length));
    else if (n.data.link) void openUrl(n.data.link);
  };

  return (
    <>
      <Header title="Notifications" subtitle={unread ? `${unread} unread` : "You're all caught up"} back right={unread ? <button className="link" onClick={markAll}>Mark all read</button> : <span />} />
      {isError ? <ErrorState onRetry={() => refetch()} /> : isLoading ? <Loading /> : (data ?? []).length === 0
        ? <Empty icon="bell" title="Nothing yet" text="Order updates, payments and messages from Tailor IT will show up here." />
        : <div className="notif-list">{data!.map((n) => (
            <button key={n.id} className={`notif ${n.read_at ? "" : "unread"}`} onClick={() => open(n)}>
              <span className="n-icon"><Icon name={iconFor(n.kind)} size={18} /></span>
              <div><strong>{n.title}</strong>{n.body && <p>{n.body}</p>}<small>{timeAgo(n.created_at)}{n.kind === "broadcast:promo" ? " · Promotion" : ""}</small></div>
              {!n.read_at && <i aria-label="Unread" />}
            </button>
          ))}</div>}
    </>
  );
}
