import { supabase } from "../lib/supabaseClient";

export interface ReportRange {
  from: string; // ISO date
  to: string;   // ISO date
}

export async function getOrdersByStatus() {
  const { data, error } = await supabase.from("orders").select("current_stage, status");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const r of data as any[]) {
    const key = r.status === "active" ? r.current_stage : r.status;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export async function getOrdersByEmployee() {
  const { data, error } = await supabase
    .from("orders")
    .select("assigned_user_id, assignee:profiles(full_name)")
    .not("assigned_user_id", "is", null);
  if (error) throw error;
  const counts: Record<string, { name: string; count: number }> = {};
  for (const r of data as any[]) {
    const id = r.assigned_user_id;
    if (!counts[id]) counts[id] = { name: r.assignee?.full_name || "—", count: 0 };
    counts[id].count++;
  }
  return Object.values(counts);
}

export async function getSalesReport(range: ReportRange) {
  const { data, error } = await supabase
    .from("orders")
    .select("grand_total")
    .gte("order_date", range.from)
    .lte("order_date", range.to);
  if (error) throw error;
  return (data as any[]).reduce((s, o) => s + Number(o.grand_total), 0);
}

export async function getPaymentsReport(range: ReportRange) {
  const { data, error } = await supabase
    .from("payments")
    .select("amount, method")
    .gte("created_at", range.from)
    .lte("created_at", range.to);
  if (error) throw error;
  const byMethod: Record<string, number> = { CASH: 0, INSTAPAY: 0, VODAFONE_CASH: 0 };
  let total = 0;
  for (const p of data as any[]) {
    byMethod[p.method] = (byMethod[p.method] || 0) + Number(p.amount);
    total += Number(p.amount);
  }
  return { total, byMethod };
}

export async function getOutstandingBalance() {
  const { data, error } = await supabase.from("orders").select("remaining_balance").eq("status", "active");
  if (error) throw error;
  return (data as any[]).reduce((s, o) => s + Number(o.remaining_balance), 0);
}

// Admin-only in practice: RLS on `expenses` returns nothing to anyone else.
export async function getExpensesReport(range: ReportRange) {
  const { data, error } = await supabase
    .from("expenses")
    .select("category, amount")
    .gte("created_at", range.from)
    .lte("created_at", range.to);
  if (error) throw error;
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of data as any[]) {
    byCategory[e.category] = (byCategory[e.category] || 0) + Number(e.amount);
    total += Number(e.amount);
  }
  return { total, byCategory };
}
