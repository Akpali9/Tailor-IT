import Icon from "./Icon";
import { money } from "@/lib/format";
import type { Product } from "@/lib/types";

export function ProductCard({ product, brand, saved, onToggle, onOpen, variant = "scroll" }: {
  product: Product; brand: string; saved?: boolean; onToggle?: () => void; onOpen: () => void; variant?: "scroll" | "grid";
}) {
  return (
    <article className={variant === "scroll" ? "piece-card" : "wardrobe-item"} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()} aria-label={`${product.name}, ${money(product.price_minor, product.currency)}`}>
      <div className="thumb">
        <img src={product.image_urls[0]} alt="" loading="lazy" />
        {variant === "grid" && <span className="category-tag">{product.category}</span>}
        {onToggle && <button className={saved ? "saved" : ""} aria-label={saved ? "Remove from saved" : "Save piece"} aria-pressed={saved} onClick={(e) => { e.stopPropagation(); onToggle(); }}><Icon name="heart" size={15} /></button>}
      </div>
      <span className="brand-line">{brand}</span>
      <h3>{product.name}</h3>
      <p>{[product.fabric, product.color].filter(Boolean).join(" · ")}</p>
      <strong>{money(product.price_minor, product.currency)}</strong>
    </article>
  );
}
