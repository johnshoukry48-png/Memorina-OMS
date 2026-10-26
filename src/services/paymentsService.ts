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

// Admin-only at the RLS level (see migrations 005/008) — for fixing a
// mistake in a previously recorded payment. Prefer recording a new
// payment for a genuine additional/remaining payment; editing is for
// correcting errors, so the history stays trustworthy.
export async function updatePayment(id: string, patch: Partial<Pick<Payment, "amount" | "method" | "notes">>) {
  const { error } = await supabase.from("payments").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletePayment(id: string) {
  const { error } = await supabase.from("payments").delete().eq("id", id);
  if (error) throw error;
}
