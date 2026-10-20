import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import {
  listNotifications,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
} from "../services/notificationsService";
import type { AppNotification } from "../types/database";

export function NotificationBell() {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    listNotifications(profile.id).then(setNotifications);

    const unsubscribe = subscribeToNotifications(profile.id, (n) => {
      setNotifications((prev) => [n, ...prev]);
    });
    return unsubscribe;
  }, [profile?.id]);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  async function handleOpen() {
    setOpen((o) => !o);
  }

  async function handleMarkAllRead() {
    if (!profile?.id) return;
    await markAllAsRead(profile.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
  }

  async function handleClickOne(n: AppNotification) {
    if (!n.read_at) {
      await markAsRead(n.id);
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
    }
  }

  return (
    <div className="relative">
      <button onClick={handleOpen} className="relative rounded-lg p-2 hover:bg-gray-100" aria-label="الإشعارات">
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-80 max-w-[85vw] max-h-96 overflow-y-auto bg-white border border-gray-100 rounded-2xl shadow-lg z-20">
          <div className="flex items-center justify-between p-3 border-b border-gray-50">
            <span className="font-semibold text-sm">الإشعارات</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="text-xs text-gray-500">تعليم الكل كمقروء</button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 text-center">لا توجد إشعارات</p>
          ) : (
            <ul className="divide-y divide-gray-50">
              {notifications.map((n) => (
                <li key={n.id} className={!n.read_at ? "bg-blue-50/40" : ""}>
                  {n.order_id ? (
                    <Link
                      to={`/orders/${n.order_id}`}
                      onClick={() => handleClickOne(n)}
                      className="block p-3 text-sm hover:bg-gray-50"
                    >
                      <p>{n.message_ar}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString("ar-EG")}</p>
                    </Link>
                  ) : (
                    <button onClick={() => handleClickOne(n)} className="block w-full text-right p-3 text-sm hover:bg-gray-50">
                      <p>{n.message_ar}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString("ar-EG")}</p>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
