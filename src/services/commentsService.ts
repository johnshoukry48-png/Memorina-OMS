import { supabase } from "../lib/supabaseClient";
import type { Comment } from "../types/database";

export async function listComments(orderId: string) {
  const { data, error } = await supabase
    .from("comments")
    .select("*, user:profiles(full_name)")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as unknown as Comment[];
}

export async function addComment(orderId: string, message: string) {
  const { data: userData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("comments")
    .insert({ order_id: orderId, message, user_id: userData.user?.id })
    .select("*, user:profiles(full_name)")
    .single();
  if (error) throw error;
  return data as unknown as Comment;
}
