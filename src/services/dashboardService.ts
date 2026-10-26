import { supabase } from "../lib/supabaseClient";
import type { WorkflowStageCode, Order } from "../types/database";

export interface DashboardStats {
  totalActive: number;
  byStage: Record<WorkflowStageCode, number>;
  totalDelivered: number;
  totalCollected: number;
  overdue: Order[];
}

// Two lightweight queries: stage counts from the view (cheap, no
// joins), and the overdue list from `orders` directly (needs the
// customer name for display). Fine for a small business's order volume.
export async function getDashboardStats(): Promise<DashboardStats> {
  const { data: rows, error } = await supabase
    .from("v_orders_dashboard")
    .select("current_stage, status");
  if (error) throw error;

  const byStage: Record<string, number> = {};
  let totalActive = 0;
  let totalDelivered = 0;
  let totalCollected = 0;
  for (const r of rows as any[]) {
    if (r.status === "active") {
      totalActive++;
      byStage[r.current_stage] = (byStage[r.current_stage] || 0) + 1;
    }
    if (r.current_stage === "DELIVERED") totalDelivered++;
    if (r.current_stage === "COLLECTED") totalCollected++;
  }

  const { data: overdueRows, error: overdueError } = await supabase
    .from("orders")
    .select("*, customer:customers(*)")
    .eq("status", "active")
    .lt("due_date", new Date().toISOString())
    .order("due_date", { ascending: true });
  if (overdueError) throw overdueError;

  return {
    totalActive,
    byStage: byStage as Record<WorkflowStageCode, number>,
    totalDelivered,
    totalCollected,
    overdue: overdueRows as Order[],
  };
}

export interface TodaySummary {
  salesToday: number;
  paymentsToday: number;
  outstandingBalance: number;
  expensesToday?: number; // present only for admin — RLS returns nothing to anyone else
}

export async function getTodaySummary(): Promise<TodaySummary> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const isoStart = startOfDay.toISOString();

  const [ordersToday, paymentsToday, activeOrders, expensesToday] = await Promise.all([
    supabase.from("orders").select("financials:order_financials(grand_total)").gte("order_date", isoStart),
    supabase.from("payments").select("amount").gte("created_at", isoStart),
    supabase.from("orders").select("financials:order_financials(remaining_balance)").eq("status", "active"),
    supabase.from("expenses").select("amount").gte("created_at", isoStart),
  ]);

  const fin = (o: any) => (Array.isArray(o.financials) ? o.financials[0] : o.financials);
  const salesToday = (ordersToday.data || []).reduce((s, o: any) => s + Number(fin(o)?.grand_total || 0), 0);
  const paymentsTotal = (paymentsToday.data || []).reduce((s, p: any) => s + Number(p.amount), 0);
  const outstanding = (activeOrders.data || []).reduce((s, o: any) => s + Number(fin(o)?.remaining_balance || 0), 0);
  const expenses = expensesToday.data
    ? (expensesToday.data as any[]).reduce((s, e: any) => s + Number(e.amount), 0)
    : undefined;

  return { salesToday, paymentsToday: paymentsTotal, outstandingBalance: outstanding, expensesToday: expenses };
}
