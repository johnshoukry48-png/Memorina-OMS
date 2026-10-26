import { supabase } from "../lib/supabaseClient";
import type { Order, OrderItem, NewOrderItemInput, OrderFinancials } from "../types/database";

const ORDER_SELECT = "*, customer:customers(*), financials:order_financials(*)";

// Supabase returns a to-one embed as an array in some client/version
// combinations; order_financials' PK *is* order_id so it's always one
// row (or none, if RLS hides it for this role) — normalize either shape
// to a single object or null.
function normalizeOrder(row: any): Order {
  const financials = Array.isArray(row.financials) ? row.financials[0] ?? null : row.financials ?? null;
  return { ...row, financials } as Order;
}

export async function listOrders(filters?: { search?: string; stage?: string }) {
  let query = supabase.from("orders").select(ORDER_SELECT).order("created_at", { ascending: false });

  if (filters?.stage) {
    query = query.eq("current_stage", filters.stage);
  }
  const { data, error } = await query;
  if (error) throw error;

  let rows = (data as any[]).map(normalizeOrder);
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
  const { data, error } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).single();
  if (error) throw error;
  return normalizeOrder(data);
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

// Creates the order, then its items, then (if provided) the discount/
// shipping cost. Totals are always computed server-side by triggers —
// nothing here calculates subtotal/grand_total itself. due_date is
// optional: leave it out and the database defaults it to 10 days from
// today (still editable afterwards).
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

  if (input.discount || input.shipping_cost) {
    const { error: finError } = await supabase
      .from("order_financials")
      .update({ discount: input.discount ?? 0, shipping_cost: input.shipping_cost ?? 0 })
      .eq("order_id", order.id);
    if (finError) throw finError;
  }

  return getOrder(order.id);
}

// Editing an existing order: core fields plus discount/shipping_cost.
// Item add/remove/edit are separate calls below.
export async function updateOrder(
  orderId: string,
  patch: Partial<Pick<Order, "due_date" | "priority" | "shipping_address" | "shipping_company" | "tracking_number" | "notes">>
) {
  const { error } = await supabase.from("orders").update(patch).eq("id", orderId);
  if (error) throw error;
}

export async function updateOrderFinancials(orderId: string, patch: Partial<Pick<OrderFinancials, "discount" | "shipping_cost">>) {
  const { error } = await supabase.from("order_financials").update(patch).eq("order_id", orderId);
  if (error) throw error;
}

export async function addOrderItem(orderId: string, item: NewOrderItemInput) {
  const { error } = await supabase.from("order_items").insert({ ...item, order_id: orderId });
  if (error) throw error;
}

export async function updateOrderItem(itemId: string, patch: Partial<NewOrderItemInput>) {
  const { error } = await supabase.from("order_items").update(patch).eq("id", itemId);
  if (error) throw error;
}

export async function deleteOrderItem(itemId: string) {
  const { error } = await supabase.from("order_items").delete().eq("id", itemId);
  if (error) throw error;
}

export async function claimTask(orderId: string) {
  const { data, error } = await supabase.rpc("fn_claim_task", { p_order_id: orderId });
  if (error) throw error;
  return data as Order;
}

// assignToUserId: leave undefined/null to send it to the department
// queue for anyone to self-claim (unchanged default behavior); pass a
// specific profile id to hand it directly to that person instead
// (admin/order_manager only — the database rejects it from anyone else).
export async function advanceStage(orderId: string, toStage: string, assignToUserId?: string | null) {
  const { data, error } = await supabase.rpc("fn_advance_stage", {
    p_order_id: orderId,
    p_to_stage: toStage,
    p_assign_to_user_id: assignToUserId || null,
  });
  if (error) throw error;
  return data as Order;
}

// Active employees who work at a given workflow stage — used to build
// the "assign directly to" picker when moving an order forward.
export async function listEmployeesForStage(stage: string) {
  const { data: mapping, error: mapError } = await supabase
    .from("role_stage_map")
    .select("role")
    .eq("stage", stage)
    .single();
  if (mapError || !mapping) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", mapping.role)
    .eq("active", true)
    .order("full_name");
  if (error) throw error;
  return data as { id: string; full_name: string }[];
}

// Orders visible to the current user at their own workflow stage
// (RLS already restricts this — no extra filtering needed here).
export async function listMyStageOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .order("due_date", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data as any[]).map(normalizeOrder);
}

// How long each person has held this order at each stage — pulled from
// order_assignments (claimed_at → released_at, or "still in progress"
// if not yet released).
export async function getOrderAssignmentHistory(orderId: string) {
  const { data, error } = await supabase
    .from("order_assignments")
    .select("*, user:profiles(full_name)")
    .eq("order_id", orderId)
    .order("claimed_at", { ascending: true });
  if (error) throw error;
  return data as {
    id: string;
    user_id: string;
    role_at_assignment: string;
    claimed_at: string;
    released_at: string | null;
    user?: { full_name: string } | null;
  }[];
}
