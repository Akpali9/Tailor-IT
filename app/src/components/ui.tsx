import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { useNotifications } from "@/lib/queries";
import { useAuth } from "@/state/Auth";
import { haptic } from "@/lib/native";
import { initials } from "@/lib/format";
import type { OrderStatus } from "@/lib/types";

export function Button({ children, variant = "primary", loading, className = "", onClick, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean }) {
  return (
    <button className={`btn ${variant} ${className}`} disabled={props.disabled || loading} aria-busy={loading}
      onClick={(e) => { void haptic(); onClick?.(e); }} {...props}>
      {loading ? <span className="spinner sm" aria-hidden /> : children}
    </button>
  );
}

export function Header({ title, subtitle, back, right, brand = true }: { title: string; subtitle?: string; back?: boolean; right?: ReactNode; brand?: boolean }) {
  const nav = useNavigate();
  const { data } = useNotifications();
  const unread = (data ?? []).some((n) => !n.read_at);
  const { profile } = useAuth();
  return (
    <header className="mobile-header">
      {back && <button className="circle-btn" aria-label="Go back" onClick={() => nav(-1)}><Icon name="back" size={19} /></button>}
      <div className="mh-text">
        {brand && !back && <span className="mini-brand">TAILOR IT</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {right ?? (
        <div className="mh-actions">
          <button className="circle-btn" aria-label={unread ? "Notifications, unread" : "Notifications"} onClick={() => nav("/inbox")}>
            <Icon name="bell" size={19} />{unread && <i />}
          </button>
          {profile?.role === "client" && <button className="circle-btn avatar-mini" aria-label="Profile" onClick={() => nav("/profile")}>{initials(profile.full_name)}</button>}
        </div>
      )}
    </header>
  );
}

export function Sheet({ onClose, children, label }: { onClose: () => void; children: ReactNode; label: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <button className="sheet-close" aria-label="Close" onClick={onClose}><Icon name="x" size={18} /></button>
        {children}
      </section>
    </div>
  );
}

export const Spinner = () => <span className="spinner" role="progressbar" aria-label="Loading" />;
export const Skeleton = ({ h = 120, className = "" }: { h?: number; className?: string }) => <div className={`skeleton ${className}`} style={{ height: h }} aria-hidden />;
export const Loading = () => <div className="center-pad"><Spinner /></div>;

export function Empty({ icon = "sparkle", title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span><Icon name={icon} size={24} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ onRetry, text }: { onRetry?: () => void; text?: string }) {
  return <Empty icon="info" title="Couldn't load this" text={text ?? "Check your connection and try again."} action={onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>} />;
}

export function Avatar({ name, src, size = 44 }: { name: string; src?: string | null; size?: number }) {
  return src
    ? <img className="avatar" src={src} alt="" style={{ width: size, height: size }} loading="lazy" />
    : <span className="avatar ph" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>{initials(name)}</span>;
}

const LABELS: Record<OrderStatus, string> = {
  pending_payment: "Awaiting payment", paid: "Paid", cutting: "Cutting", assembly: "Assembly", fitting_review: "Fitting review",
  finishing: "Finishing", shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};
export const statusLabel = (s: OrderStatus) => LABELS[s];
export function StatusPill({ status }: { status: OrderStatus }) {
  const tone = status === "delivered" ? "ok" : status === "cancelled" || status === "refunded" ? "off" : status === "pending_payment" ? "warn" : "live";
  return <span className={`pill ${tone}`}>{LABELS[status]}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
