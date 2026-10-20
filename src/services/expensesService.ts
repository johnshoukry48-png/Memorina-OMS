import { supabase } from "../lib/supabaseClient";
import type { Expense } from "../types/database";

// Every function here only ever succeeds for admin — RLS on the
// `expenses` table rejects everyone else, this is not a UI-only gate.
export async function listExpenses(orderId: string) {
  const { data, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Expense[];
}

export async function addExpense(input: {
  order_id: string;
  category: string;
  amount: number;
  description?: string;
  payment_method?: string;
}) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("expenses")
    .insert({ ...input, created_by: userData.user?.id })
    .select()
    .single();
  if (error) throw error;
  return data as Expense;
}
