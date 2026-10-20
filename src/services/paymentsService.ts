import { supabase } from "../lib/supabaseClient";
import type { Payment, PaymentMethod } from "../types/database";

export async function listPayments(orderId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("*, recorder:profiles(full_name)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as Payment[];
}

// total_paid / remaining_balance are recomputed by a database trigger
// the instant this insert lands — nothing here calculates them.
export async function addPayment(orderId: string, amount: number, method: PaymentMethod, notes?: string) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("payments")
    .insert({ order_id: orderId, amount, method, notes: notes || null, recorded_by: userData.user?.id })
    .select("*, recorder:profiles(full_name)")
    .single();
  if (error) throw error;
  return data as unknown as Payment;
}
