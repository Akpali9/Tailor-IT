import { useNavigate } from "react-router-dom";
import { Button, Empty, ErrorState, Header, Skeleton } from "@/components/ui";
import Icon from "@/components/Icon";
import { useMyProducts } from "@/lib/queries";
import { money } from "@/lib/format";

export default function Collection() {
  const nav = useNavigate();
  const { data, isLoading, isError, refetch } = useMyProducts();
  return (
    <>
      <Header title="Collection" subtitle="Manage pieces available for AI try-on" />
      <Button className="full" onClick={() => nav("/collection/new")}><Icon name="plus" /> Add a new piece</Button>
      {isError ? <ErrorState onRetry={() => refetch()} /> : isLoading ? <div className="wardrobe-grid"><Skeleton h={240} /><Skeleton h={240} /></div>
        : (data ?? []).length === 0 ? <Empty icon="hanger" title="Your collection is empty" text="Add your first piece with photos and a price to start getting virtual try-ons and orders." />
        : <div className="wardrobe-grid designer-collection">{data!.map((p) => (
            <article className="wardrobe-item" key={p.id} role="button" tabIndex={0} onClick={() => nav(`/collection/${p.id}`)}>
              <div className="thumb">{p.image_urls[0] ? <img src={p.image_urls[0]} alt="" loading="lazy" /> : <span className="img-ph" />}<span className={`category-tag ${p.status}`}>{p.status === "live" ? "LIVE" : "DRAFT"}</span></div>
              <small className="brand-line">{p.category}{p.customizable ? " · Customizable" : " · Original edition"}</small>
              <h3>{p.name}</h3><p>{p.tryon_count} virtual try-ons</p><strong>{money(p.price_minor, p.currency)}</strong>
            </article>
          ))}</div>}
    </>
  );
}
