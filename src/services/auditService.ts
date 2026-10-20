import { supabase } from "../lib/supabaseClient";
import type { AuditLog } from "../types/database";

export async function listAuditLogs(orderId: string) {
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, user:profiles(full_name)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as unknown as AuditLog[];
}
