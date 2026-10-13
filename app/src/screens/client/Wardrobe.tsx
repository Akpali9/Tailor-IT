import { useMemo, useState } from "react";
import { Header, Skeleton, Empty, ErrorState } from "@/components/ui";
import Icon from "@/components/Icon";
import { ProductCard } from "@/components/ProductCard";
import ProductSheet from "@/components/ProductSheet";
import { brandOf, useDesigners, useFavorites, useProducts } from "@/lib/queries";
import type { Product } from "@/lib/types";

export default function Wardrobe() {
  const products = useProducts();
  const designers = useDesigners();
  const favs = useFavorites();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"All" | "Women" | "Men" | "Unisex">("All");
  const [savedOnly, setSavedOnly] = useState(false);
  const [open, setOpen] = useState<Product | null>(null);

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (products.data ?? []).filter((p) =>
      (cat === "All" || p.category === cat) && (!savedOnly || favs.ids.has(p.id)) &&
      (!term || `${p.name} ${p.fabric ?? ""} ${p.color ?? ""} ${brandOf(designers.data, p.designer_id)}`.toLowerCase().includes(term)));
  }, [products.data, designers.data, q, cat, savedOnly, favs.ids]);

  return (
    <>
      <Header title="Wardrobe" subtitle="Discover exceptional independent fashion" />
      <div className="search-box"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pieces, fabrics, designers" aria-label="Search" /></div>
      <div className="pills">
        {(["All", "Women", "Men", "Unisex"] as const).map((x) => <button key={x} className={cat === x ? "active" : ""} onClick={() => setCat(x)}>{x === "All" ? "All pieces" : x}</button>)}
        <button className={savedOnly ? "active" : ""} aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}><Icon name="heart" size={13} /> Saved</button>
      </div>
      {products.isError ? <ErrorState onRetry={() => products.refetch()} />
        : products.isLoading ? <div className="wardrobe-grid"><Skeleton h={260} /><Skeleton h={260} /><Skeleton h={260} /><Skeleton h={260} /></div>
        : list.length === 0 ? <Empty icon="search" title={savedOnly ? "Nothing saved yet" : "No matches"} text={savedOnly ? "Tap the heart on a piece to save it here." : "Try a different search or filter."} />
        : <div className="wardrobe-grid">{list.map((p) => <ProductCard key={p.id} variant="grid" product={p} brand={brandOf(designers.data, p.designer_id)} saved={favs.ids.has(p.id)} onToggle={() => favs.toggle(p.id)} onOpen={() => setOpen(p)} />)}</div>}
      {open && <ProductSheet product={open} onClose={() => setOpen(null)} />}
    </>
  );
}
