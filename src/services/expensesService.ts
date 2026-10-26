import { supabase } from "../lib/supabaseClient";
import type { Expense } from "../types/database";

// Every function here only ever succeeds for admin — RLS on the
// `expenses` table rejects everyone else, this is not a UI-only gate.

// All expenses within a date range (inclusive), regardless of category
// or whether they're tied to an order. Used by the standalone Expenses
// page, scoped to whichever month is being viewed.
export async function listExpensesInRange(fromIso: string, toIso: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Expense[];
}

export async function addExpense(input: {
  order_id?: string | null;
  category: string;
  amount: number;
  description?: string;
  payment_method?: string;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("expenses")
    .insert({ ...input, order_id: input.order_id ?? null, created_by: userData.user?.id })
    .select()
    .single();
  if (error) throw error;
  return data as Expense;
}

export async function deleteExpense(id: string) {
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) throw error;
}
