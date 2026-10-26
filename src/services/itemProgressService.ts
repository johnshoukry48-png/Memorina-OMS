import { supabase } from "../lib/supabaseClient";
import type { ItemProgress, WorkflowStageCode } from "../types/database";

export async function listItemProgress(orderItemIds: string[]) {
  if (orderItemIds.length === 0) return [];
  const { data, error } = await supabase
    .from("item_progress")
    .select("*")
    .in("order_item_id", orderItemIds);
  if (error) throw error;
  return data as ItemProgress[];
}

// Ticking the box for an item at a given stage. Authorization (must be
// admin/order_manager, or the assigned employee while the order sits at
// this exact stage) is enforced inside the database function.
export async function toggleItemProgress(orderItemId: string, stage: WorkflowStageCode, completed: boolean) {
  const { data, error } = await supabase.rpc("fn_toggle_item_progress", {
    p_order_item_id: orderItemId,
    p_stage: stage,
    p_completed: completed,
  });
  if (error) throw error;
  return data as ItemProgress;
}
