import { supabase } from "../lib/supabaseClient";
import type { AppNotification } from "../types/database";

export async function listNotifications(userId: string) {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data as AppNotification[];
}

export async function markAsRead(id: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markAllAsRead(userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

// Realtime subscription — calls onInsert for every new notification row
// belonging to this user, as it happens, no polling. Returns an unsubscribe
// function.
//
// IMPORTANT: Supabase's realtime client throws if you open a second
// subscription on the same channel topic while one is already active
// (e.g. the layout renders a notification bell for both the mobile top
// bar and the desktop bar — both stay mounted at once, just hidden with
// CSS, not unmounted). To make that safe, this keeps ONE real channel per
// userId and fans its events out to every caller; the channel itself is
// only opened on the first subscriber and only closed once the last one
// unsubscribes.
const activeChannels: Record<
  string,
  { channel: ReturnType<typeof supabase.channel>; listeners: Set<(n: AppNotification) => void> }
> = {};

export function subscribeToNotifications(userId: string, onInsert: (n: AppNotification) => void) {
  let entry = activeChannels[userId];

  if (!entry) {
    const listeners = new Set<(n: AppNotification) => void>();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as AppNotification;
          listeners.forEach((fn) => fn(row));
        }
      )
      .subscribe();
    entry = { channel, listeners };
    activeChannels[userId] = entry;
  }

  entry.listeners.add(onInsert);

  return () => {
    const e = activeChannels[userId];
    if (!e) return;
    e.listeners.delete(onInsert);
    if (e.listeners.size === 0) {
      supabase.removeChannel(e.channel);
      delete activeChannels[userId];
    }
  };
}
