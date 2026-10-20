import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listMyStageOrders, claimTask } from "../services/ordersService";
import { useAuth } from "../hooks/useAuth";
import type { Order } from "../types/database";
import { StatusBadge } from "../components/StatusBadge";

export default function MyTasks() {
  const { profile } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setOrders(await listMyStageOrders());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleClaim(orderId: string) {
    setClaimingId(orderId);
    setError(null);
    try {
      await claimTask(orderId);
      load();
    } catch (err: any) {
      setError(err?.message || "تعذر استلام المهمة، حاول مرة أخرى.");
    } finally {
      setClaimingId(null);
    }
  }

  const available = orders.filter((o) => !o.assigned_user_id);
  const mine = orders.filter((o) => o.assigned_user_id === profile?.id);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-6">مهامي</h1>

      {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      <section className="mb-8">
        <h2 className="font-semibold mb-3 text-gray-700">مهامي الحالية</h2>
        {loading ? (
          <p className="text-gray-400">جارٍ التحميل...</p>
        ) : mine.length === 0 ? (
          <p className="text-gray-400">لا توجد مهام بحوزتك حاليًا.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((o) => (
              <Link
                key={o.id}
                to={`/orders/${o.id}`}
                className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm hover:shadow"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">#{o.order_number}</span>
                  <StatusBadge stage={o.current_stage} />
                </div>
                <p className="text-sm text-gray-600">{o.customer?.name}</p>
                {o.due_date && (
                  <p className="text-xs text-gray-400 mt-1">
                    التسليم: {new Date(o.due_date).toLocaleDateString("ar-EG")}
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-semibold mb-3 text-gray-700">مهام متاحة</h2>
        {loading ? (
          <p className="text-gray-400">جارٍ التحميل...</p>
        ) : available.length === 0 ? (
          <p className="text-gray-400">لا توجد مهام متاحة حاليًا.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {available.map((o) => (
              <div key={o.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">#{o.order_number}</span>
                  <StatusBadge stage={o.current_stage} />
                </div>
                <p className="text-sm text-gray-600 mb-1">{o.customer?.name}</p>
                {o.due_date && (
                  <p className="text-xs text-gray-400 mb-3">
                    التسليم: {new Date(o.due_date).toLocaleDateString("ar-EG")}
                  </p>
                )}
                <button
                  onClick={() => handleClaim(o.id)}
                  disabled={claimingId === o.id}
                  className="w-full bg-gray-900 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                >
                  {claimingId === o.id ? "جارٍ الاستلام..." : "استلام المهمة"}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
