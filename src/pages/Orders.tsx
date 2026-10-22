import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listOrders } from "../services/ordersService";
import type { Order } from "../types/database";
import { StatusBadge } from "../components/StatusBadge";

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setOrders(await listOrders({ search: search || undefined }));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">الطلبات</h1>
        <Link to="/orders/new" className="bg-memorina-teal text-white rounded-lg px-4 py-2 text-sm font-medium">
          + طلب جديد
        </Link>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); load(); }}
        className="mb-4 flex gap-2"
      >
        <input
          placeholder="بحث برقم الطلب أو اسم العميل أو الهاتف"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2"
        />
        <button className="border border-gray-300 rounded-lg px-4 py-2 text-sm">بحث</button>
      </form>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-gray-500 border-b border-gray-100">
              <th className="p-3">رقم الطلب</th>
              <th className="p-3">العميل</th>
              <th className="p-3">المرحلة</th>
              <th className="p-3">الإجمالي</th>
              <th className="p-3">المتبقي</th>
              <th className="p-3">تاريخ التسليم</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-6 text-center text-gray-400">جارٍ التحميل...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={6} className="p-6 text-center text-gray-400">لا توجد طلبات بعد</td></tr>
            ) : (
              orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="p-3">
                    <Link to={`/orders/${o.id}`} className="font-medium text-gray-900">#{o.order_number}</Link>
                  </td>
                  <td className="p-3">{o.customer?.name}</td>
                  <td className="p-3"><StatusBadge stage={o.current_stage} /></td>
                  <td className="p-3">{o.grand_total.toFixed(2)} ج.م</td>
                  <td className="p-3">{o.remaining_balance.toFixed(2)} ج.م</td>
                  <td className="p-3 text-gray-500">
                    {o.due_date ? new Date(o.due_date).toLocaleDateString("ar-EG") : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
