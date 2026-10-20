import { supabase } from "../lib/supabaseClient";
import type { Order, OrderItem, NewOrderItemInput } from "../types/database";

export async function listOrders(filters?: { search?: string; stage?: string }) {
  let query = supabase
    .from("orders")
    .select("*, customer:customers(*)")
    .order("created_at", { ascending: false });

  if (filters?.stage) {
    query = query.eq("current_stage", filters.stage);
  }
  const { data, error } = await query;
  if (error) throw error;

  let rows = data as Order[];
  if (filters?.search) {
    const s = filters.search.toLowerCase();
    rows = rows.filter(
      (o) =>
        String(o.order_number).includes(s) ||
        o.customer?.name?.toLowerCase().includes(s) ||
        o.customer?.phone?.includes(s)
    );
  }
  return rows;
}

export async function getOrder(id: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("*, customer:customers(*)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as Order;
}

export async function getOrderItems(orderId: string) {
  const { data, error } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as OrderItem[];
}

// Creates the order, then its items. Totals are computed server-side by
// triggers the moment the items are inserted — nothing here calculates
// subtotal/grand_total itself.
export async function createOrderWithItems(input: {
  customer_id: string;
  due_date?: string;
  priority?: string;
  shipping_address?: string;
  discount?: number;
  shipping_cost?: number;
  notes?: string;
  items: NewOrderItemInput[];
}) {
  const { data: userData } = await supabase.auth.getUser();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_id: input.customer_id,
      due_date: input.due_date || null,
      priority: (input.priority as any) || "normal",
      shipping_address: input.shipping_address || null,
      discount: input.discount ?? 0,
      shipping_cost: input.shipping_cost ?? 0,
      notes: input.notes || null,
      created_by: userData.user?.id,
    })
    .select()
    .single();
  if (orderError) throw orderError;

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from("order_items").insert(
      input.items.map((item) => ({ ...item, order_id: order.id }))
    );
    if (itemsError) throw itemsError;
  }

  return getOrder(order.id);
}

export async function claimTask(orderId: string) {
  const { data, error } = await supabase.rpc("fn_claim_task", { p_order_id: orderId });
  if (error) throw error;
  return data as Order;
}

export async function advanceStage(orderId: string, toStage: string) {
  const { data, error } = await supabase.rpc("fn_advance_stage", {
    p_order_id: orderId,
    p_to_stage: toStage,
  });
  if (error) throw error;
  return data as Order;
}

// Orders visible to the current user at their own workflow stage
// (RLS already restricts this — no extra filtering needed here).
export async function listMyStageOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("*, customer:customers(*)")
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data as Order[];
}
