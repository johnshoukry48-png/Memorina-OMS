import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getOrder, getOrderItems, claimTask, advanceStage } from "../services/ordersService";
import { getNextStages } from "../services/workflowService";
import { useAuth } from "../hooks/useAuth";
import type { Order, OrderItem, WorkflowStageCode } from "../types/database";
import { StatusBadge } from "../components/StatusBadge";
import { OrderFiles } from "../components/OrderFiles";
import { OrderPayments } from "../components/OrderPayments";
import { OrderExpenses } from "../components/OrderExpenses";
import { OrderTimeline } from "../components/OrderTimeline";

const STAGE_LABEL_AR: Record<WorkflowStageCode, string> = {
  NEW: "جديد", DESIGN: "التصميم", PRINTING: "الطباعة", ASSEMBLY: "التجميع",
  PACKAGING: "التغليف", SHIPPING: "الشحن", DELIVERED: "تم التسليم", CANCELLED: "ملغي",
};

// Mirrors supabase/migrations/003_workflow_task_assignment.sql's role_stage_map.
// Only used here to decide whether to show the "claim" button — the actual
// authorization check happens server-side in fn_claim_task, not here.
const STAGE_TO_ROLE: Partial<Record<WorkflowStageCode, string>> = {
  DESIGN: "designer",
  PRINTING: "printing",
  ASSEMBLY: "assembly",
  PACKAGING: "packaging",
  SHIPPING: "shipping",
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [nextStages, setNextStages] = useState<WorkflowStageCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    const [o, its] = await Promise.all([getOrder(id), getOrderItems(id)]);
    setOrder(o);
    setItems(its);
    setNextStages(await getNextStages(o.current_stage));
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleClaim() {
    if (!id) return;
    setActing(true);
    setActionError(null);
    try {
      await claimTask(id);
      await load();
    } catch (err: any) {
      setActionError(err?.message || "تعذر استلام المهمة.");
    } finally {
      setActing(false);
    }
  }

  async function handleAdvance(toStage: WorkflowStageCode) {
    if (!id) return;
    setActing(true);
    setActionError(null);
    try {
      await advanceStage(id, toStage);
      await load();
    } catch (err: any) {
      setActionError(err?.message || "تعذر نقل الطلب لهذه المرحلة.");
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">جارٍ التحميل...</div>;
  if (!order) return <div className="p-8 text-center text-gray-400">لم يتم العثور على الطلب</div>;

  const isAdminOrOM = profile?.role === "admin" || profile?.role === "order_manager";
  const isMyStageUnclaimed = !order.assigned_user_id && profile?.role && STAGE_TO_ROLE[order.current_stage] === profile.role;
  const isAssignedToMe = order.assigned_user_id === profile?.id;
  const forwardStages = nextStages.filter((s) => s !== "CANCELLED");
  const canCancel = (isAdminOrOM || isAssignedToMe) && order.status === "active";
  const canAdvance = isAdminOrOM || isAssignedToMe;

  return (
    <div className="p-6 max-w-3xl">
      <Link to="/orders" className="text-sm text-gray-500 mb-4 inline-block">→ العودة للطلبات</Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">طلب #{order.order_number}</h1>
          <p className="text-gray-500 text-sm">{order.customer?.name} — {order.customer?.phone}</p>
        </div>
        <StatusBadge stage={order.current_stage} />
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
        <h2 className="font-semibold mb-3">إجراءات سير العمل</h2>
        {actionError && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{actionError}</div>}

        {order.status !== "active" ? (
          <p className="text-gray-500 text-sm">لا توجد إجراءات متاحة — حالة الطلب: {order.status === "completed" ? "مكتمل" : "ملغي"}</p>
        ) : isMyStageUnclaimed ? (
          <button onClick={handleClaim} disabled={acting} className="bg-memorina-teal text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            {acting ? "جارٍ الاستلام..." : "استلام المهمة"}
          </button>
        ) : canAdvance ? (
          <div className="flex flex-wrap gap-2">
            {forwardStages.map((s) => (
              <button
                key={s}
                onClick={() => handleAdvance(s)}
                disabled={acting}
                className="bg-memorina-teal text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                نقل إلى: {STAGE_LABEL_AR[s]}
              </button>
            ))}
            {canCancel && (
              <button
                onClick={() => handleAdvance("CANCELLED")}
                disabled={acting}
                className="border border-red-300 text-red-700 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                إلغاء الطلب
              </button>
            )}
            {forwardStages.length === 0 && !canCancel && (
              <p className="text-gray-400 text-sm">لا توجد مرحلة تالية.</p>
            )}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">لا توجد إجراءات متاحة لك على هذا الطلب حاليًا.</p>
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
        <h2 className="font-semibold mb-3">العناصر</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-gray-500 border-b border-gray-100">
              <th className="py-2">المنتج</th>
              <th className="py-2">المقاس</th>
              <th className="py-2">الكمية</th>
              <th className="py-2">سعر الوحدة</th>
              <th className="py-2">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2">{it.name}</td>
                <td className="py-2">{it.size || "—"}</td>
                <td className="py-2">{it.quantity}</td>
                <td className="py-2">{it.unit_price.toFixed(2)}</td>
                <td className="py-2 font-medium">{it.total_price.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-2 text-sm">
        <Row label="المجموع الفرعي" value={order.subtotal} />
        <Row label="الخصم" value={-order.discount} />
        <Row label="تكلفة الشحن" value={order.shipping_cost} />
        <Row label="الإجمالي الكلي" value={order.grand_total} bold />
        <Row label="المدفوع" value={order.total_paid} />
        <Row label="المتبقي" value={order.remaining_balance} bold />
        {order.due_date && (
          <div className="flex justify-between pt-2 border-t border-gray-100">
            <span className="text-gray-500">تاريخ التسليم المطلوب</span>
            <span>{new Date(order.due_date).toLocaleDateString("ar-EG")}</span>
          </div>
        )}
      </div>

      <div className="mt-4">
        {isAdminOrOM && <OrderPayments orderId={order.id} onPaymentAdded={load} />}
        <OrderFiles orderId={order.id} />
        {profile?.role === "admin" && <OrderExpenses orderId={order.id} grandTotal={order.grand_total} />}
        <OrderTimeline orderId={order.id} />
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold" : "text-gray-600"}`}>
      <span>{label}</span>
      <span>{value.toFixed(2)} ج.م</span>
    </div>
  );
}
