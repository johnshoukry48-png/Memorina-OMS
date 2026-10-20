import { supabase } from "../lib/supabaseClient";
import type { WorkflowStageCode } from "../types/database";

// The legal next stage(s) from a given stage, read from
// workflow_transitions — never hardcoded, so an admin can extend the
// workflow later purely in the database without a code change.
export async function getNextStages(fromStage: WorkflowStageCode) {
  const { data, error } = await supabase
    .from("workflow_transitions")
    .select("to_stage")
    .eq("from_stage", fromStage);
  if (error) throw error;
  return (data ?? []).map((r) => r.to_stage as WorkflowStageCode);
}
