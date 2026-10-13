import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "@/state/Auth";
import type { Ad, AppNotification, DesignerStats, Measurements, Order, OrderEvent, Payment, Product, StylistMessage } from "./types";

const must = <T,>(r: { data: T | null; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

export interface DesignerCard {
  user_id: string; brand_name: string; specialty: string | null; followers_count: number; verified: boolean;
  accepting_orders: boolean; avatar_url: string | null; cover_url: string | null;
}

export const useProducts = () => useQuery({
  queryKey: ["products"],
  queryFn: async () => must(await supabase.from("products").select("*").eq("status", "live").order("created_at", { ascending: false }).limit(200)) as Product[],
});

export const useDesigners = () => useQuery({
  queryKey: ["designers"],
  queryFn: async (): Promise<DesignerCard[]> => {
    const [d, p] = await Promise.all([
      supabase.from("designer_profiles").select("user_id,brand_name,specialty,followers_count,verified,accepting_orders,cover_url").limit(300),
      supabase.from("profiles").select("id,avatar_url").eq("role", "designer").limit(300),
    ]);
    const avatars = new Map((must(p) as { id: string; avatar_url: string | null }[]).map((x) => [x.id, x.avatar_url]));
    return (must(d) as Omit<DesignerCard, "avatar_url">[]).map((x) => ({ ...x, avatar_url: avatars.get(x.user_id) ?? null }));
  },
});

export const useFavorites = () => {
  const { session } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["favorites"], enabled: !!session,
    queryFn: async () => new Set((must(await supabase.from("favorites").select("product_id")) as { product_id: string }[]).map((r) => r.product_id)),
  });
  const toggle = useMutation({
    mutationFn: async (productId: string) => {
      const has = q.data?.has(productId);
      if (has) must(await supabase.from("favorites").delete().eq("product_id", productId).eq("user_id", session!.user.id));
      else must(await supabase.from("favorites").insert({ product_id: productId, user_id: session!.user.id }));
    },
    onMutate: async (productId: string) => {
      await qc.cancelQueries({ queryKey: ["favorites"] });
      const prev = qc.getQueryData<Set<string>>(["favorites"]) ?? new Set();
      const next = new Set(prev); next.has(productId) ? next.delete(productId) : next.add(productId);
      qc.setQueryData(["favorites"], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(["favorites"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["favorites"] }),
  });
  return { ids: q.data ?? new Set<string>(), toggle: toggle.mutate };
};

export const useFollows = () => {
  const { session } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["follows"], enabled: !!session,
    queryFn: async () => new Set((must(await supabase.from("follows").select("designer_id")) as { designer_id: string }[]).map((r) => r.designer_id)),
  });
  const toggle = useMutation({
    mutationFn: async (designerId: string) => {
      if (q.data?.has(designerId)) must(await supabase.from("follows").delete().eq("designer_id", designerId).eq("client_id", session!.user.id));
      else must(await supabase.from("follows").insert({ designer_id: designerId, client_id: session!.user.id }));
    },
    onMutate: async (id: string) => {
      const prev = qc.getQueryData<Set<string>>(["follows"]) ?? new Set();
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id);
      qc.setQueryData(["follows"], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx && qc.setQueryData(["follows"], ctx.prev),
    onSettled: () => { qc.invalidateQueries({ queryKey: ["follows"] }); qc.invalidateQueries({ queryKey: ["designers"] }); },
  });
  return { ids: q.data ?? new Set<string>(), toggle: toggle.mutate };
};

export const useMeasurements = () => {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["measurements"], enabled: !!session,
    queryFn: async () => (await supabase.from("measurements").select("*").maybeSingle()).data as Measurements | null,
  });
};

export const useOrders = () => {
  const { session } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!session) return;
    const ch = supabase.channel("orders-live").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
      qc.invalidateQueries({ queryKey: ["orders"] }); qc.invalidateQueries({ queryKey: ["order"] }); qc.invalidateQueries({ queryKey: ["designer-stats"] });
    }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [session, qc]);
  return useQuery({
    queryKey: ["orders"], enabled: !!session,
    queryFn: async () => must(await supabase.from("orders").select("*, client:profiles!client_id(full_name,avatar_url)").order("created_at", { ascending: false }).limit(200)) as Order[],
  });
};

export const useOrder = (id: string | undefined) => useQuery({
  queryKey: ["order", id], enabled: !!id,
  queryFn: async () => {
    const [o, e, p] = await Promise.all([
      supabase.from("orders").select("*, client:profiles!client_id(full_name,avatar_url)").eq("id", id!).single(),
      supabase.from("order_events").select("*").eq("order_id", id!).order("id"),
      supabase.from("payments").select("*").eq("order_id", id!).order("created_at", { ascending: false }),
    ]);
    return { order: must(o) as Order, events: must(e) as OrderEvent[], payments: must(p) as Payment[] };
  },
});

export const useNotifications = () => {
  const { session } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!session) return;
    const ch = supabase.channel("notifs-live").on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` },
      () => qc.invalidateQueries({ queryKey: ["notifications"] })).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [session, qc]);
  return useQuery({
    queryKey: ["notifications"], enabled: !!session,
    queryFn: async () => must(await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100)) as AppNotification[],
  });
};

export const useAds = (placement: "home_banner" | "feed_card" | "designer_home" | "interstitial") => {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["ads", placement], enabled: !!session, staleTime: 5 * 60_000,
    queryFn: async () => (must(await supabase.rpc("get_ads", { p_placement: placement })) ?? []) as Ad[],
  });
};

export const useDesignerStats = () => {
  const { profile } = useAuth();
  return useQuery({
    queryKey: ["designer-stats"], enabled: profile?.role === "designer",
    queryFn: async () => must(await supabase.rpc("designer_stats")) as DesignerStats,
  });
};

export const useMyProducts = () => {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["my-products"], enabled: !!session,
    queryFn: async () => must(await supabase.from("products").select("*").eq("designer_id", session!.user.id).neq("status", "archived").order("created_at", { ascending: false })) as Product[],
  });
};

export const useStylistHistory = () => useQuery({
  queryKey: ["stylist"],
  queryFn: async () => (must(await supabase.from("stylist_messages").select("*").order("id", { ascending: false }).limit(30)) as StylistMessage[]).reverse(),
});

export const usePlatformSettings = () => useQuery({
  queryKey: ["settings"], staleTime: 10 * 60_000,
  queryFn: async () => Object.fromEntries((must(await supabase.from("platform_settings").select("key,value")) as { key: string; value: unknown }[]).map((r) => [r.key, r.value])) as Record<string, unknown>,
});

export const brandOf = (designers: DesignerCard[] | undefined, id: string) => designers?.find((d) => d.user_id === id)?.brand_name ?? "Independent designer";
