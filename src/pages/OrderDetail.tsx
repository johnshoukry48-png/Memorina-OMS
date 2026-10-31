import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getOrder, getOrderItems, claimTask, advanceStage, updateOrder, updateOrderFinancials,
  addOrderItem, updateOrderItem, deleteOrderItem, listEmployeesForStage, getOrderAssignmentHistory,
} from "../services/ordersService";
import { getNextStages } from "../services/workflowService";
import { listItemProgress, toggleItemProgress } from "../services/itemProgressService";
import { useAuth } from "../hooks/useAuth";
import type { Order, OrderItem, WorkflowStageCode, NewOrderItemInput, ItemProgress } from "../types/database";
import { StatusBadge } from "../components/StatusBadge";
import { OrderFiles } from "../components/OrderFiles";
import { OrderPayments } from "../components/OrderPayments";
import { OrderTimeline } from "../components/OrderTimeline";
import { describeError } from "../lib/errors";

const STAGE_LABEL_AR: Record<WorkflowStageCode, string> = {
  NEW: "جديد", DESIGN: "التصميم", PRINTING: "الطباعة", ASSEMBLY: "التجميع",
  PACKAGING: "التغليف", SHIPPING: "الشحن", DELIVERED: "تم التسليم",
  COLLECTED: "تم التحصيل", CANCELLED: "ملغي",
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

const ROLE_LABEL_AR: Record<string, string> = {
  designer: "التصميم", printing: "الطباعة", assembly: "التجميع",
  packaging: "التغليف", shipping: "الشحن",
};

function formatDuration(fromIso: string, toIso: string | null) {
  const from = new Date(fromIso).getTime();
  const to = toIso ? new Date(toIso).getTime() : Date.now();
  const mins = Math.round((to - from) / 60000);
  if (mins < 60) return `${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ساعة${mins % 60 ? ` و${mins % 60} دقيقة` : ""}`;
  const days = Math.floor(hours / 24);
  return `${days} يوم${hours % 24 ? ` و${hours % 24} ساعة` : ""}`;
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [progress, setProgress] = useState<ItemProgress[]>([]);
  const [assignments, setAssignments] = useState<Awaited<ReturnType<typeof getOrderAssignmentHistory>>>([]);
  const [nextStages, setNextStages] = useState<WorkflowStageCode[]>([]);
  const [stageEmployees, setStageEmployees] = useState<Record<string, { id: string; full_name: string }[]>>({});
  const [assignPick, setAssignPick] = useState<Record<string, string>>({});
  const [stageEmployeesError, setStageEmployeesError] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function load() {
    if (!id) return;
    const [o, its] = await Promise.all([getOrder(id), getOrderItems(id)]);
    setOrder(o);
    setItems(its);
    setProgress(its.length ? await listItemProgress(its.map((i) => i.id)) : []);
    setAssignments(await getOrderAssignmentHistory(id));
    const next = await getNextStages(o.current_stage);
    setNextStages(next);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const isAdminOrOM = profile?.role === "admin" || profile?.role === "order_manager";
  const canSeeMoney = !!order?.financials; // null for roles RLS hides it from
  const forwardStages = nextStages.filter((s) => s !== "CANCELLED");

  // Load the people who work at each possible next stage. This must depend
  // on the next-stages list itself (not just the current stage): that list
  // arrives a moment after the order does, and depending only on the order
  // meant this ran too early, found nothing to load, and never ran again.
  const forwardKey = forwardStages.join(",");
  useEffect(() => {
    if (!isAdminOrOM || forwardStages.length === 0) return;
    forwardStages.forEach((s) => {
      listEmployeesForStage(s)
        .then((list) => setStageEmployees((prev) => ({ ...prev, [s]: list })))
        .catch((err) => {
          console.error("Loading stage employees failed:", err);
          setStageEmployeesError((prev) => ({ ...prev, [s]: describeError(err) }));
        });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminOrOM, forwardKey]);

  async function handleClaim() {
    if (!id) return;
    setActing(true);
    setActionError(null);
    try {
      await claimTask(id);
      await load();
    } catch (err: any) {
      setActionError(describeError(err));
    } finally {
      setActing(false);
    }
  }

  async function handleAdvance(toStage: WorkflowStageCode) {
    if (!id) return;
    setActing(true);
    setActionError(null);
    try {
      await advanceStage(id, toStage, assignPick[toStage] || null);
      await load();
    } catch (err: any) {
      setActionError(describeError(err));
    } finally {
      setActing(false);
    }
  }

  async function handleToggleItem(itemId: string, completed: boolean) {
    if (!order) return;
    try {
      await toggleItemProgress(itemId, order.current_stage, completed);
      setProgress((prev) => {
        const others = prev.filter((p) => !(p.order_item_id === itemId && p.stage === order.current_stage));
        return [...others, { id: "", order_item_id: itemId, stage: order.current_stage, completed, completed_by: null, completed_at: null }];
      });
    } catch (err: any) {
      setActionError(describeError(err));
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">جارٍ التحميل...</div>;
  if (!order) return <div className="p-8 text-center text-gray-400">لم يتم العثور على الطلب</div>;

  const isMyStageUnclaimed = !order.assigned_user_id && profile?.role && STAGE_TO_ROLE[order.current_stage] === profile.role;
  const isAssignedToMe = order.assigned_user_id === profile?.id;
  const canCancel = (isAdminOrOM || isAssignedToMe) && order.status === "active";
  const canAdvance = isAdminOrOM || isAssignedToMe;
  const progressForCurrentStage = (itemId: string) =>
    progress.find((p) => p.order_item_id === itemId && p.stage === order.current_stage)?.completed || false;
  const canToggleItems = isAdminOrOM || isAssignedToMe;

  return (
    <div className="p-6 max-w-3xl">
      <Link to="/orders" className="text-sm text-gray-500 mb-4 inline-block">→ العودة للطلبات</Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">طلب #{order.order_number}</h1>
          <p className="text-gray-500 text-sm">{order.customer?.name} — {order.customer?.phone}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge stage={order.current_stage} />
          {isAdminOrOM && (
            <button onClick={() => setEditing((e) => !e)} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5">
              {editing ? "إلغاء التعديل" : "تعديل الطلب"}
            </button>
          )}
        </div>
      </div>

      {editing && order && (
        <OrderEditPanel
          order={order}
          items={items}
          onSaved={() => {
            setEditing(false);
            load();
          }}
        />
      )}

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
          <div className="space-y-2">
            {forwardStages.map((s) => (
              <div key={s} className="border border-gray-100 rounded-xl p-3 bg-gray-50/60">
                <p className="text-sm font-semibold mb-2">نقل الطلب إلى: {STAGE_LABEL_AR[s]}</p>

                {isAdminOrOM && (
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500 mb-1">مين يستلمه؟</label>
                    {stageEmployeesError[s] ? (
                      <p className="text-xs text-red-600">تعذر تحميل الموظفين: {stageEmployeesError[s]}</p>
                    ) : !stageEmployees[s] ? (
                      <p className="text-xs text-gray-400">جارٍ تحميل الموظفين...</p>
                    ) : (
                      <>
                        <select
                          value={assignPick[s] || ""}
                          onChange={(e) => setAssignPick((prev) => ({ ...prev, [s]: e.target.value }))}
                          className="w-full text-sm border border-gray-300 rounded-lg px-2 py-2 bg-white"
                        >
                          <option value="">للقسم كله — أي حد من القسم يستلمه</option>
                          {stageEmployees[s].map((emp) => (
                            <option key={emp.id} value={emp.id}>تحويل مباشر لـ {emp.full_name}</option>
                          ))}
                        </select>
                        {stageEmployees[s].length === 0 && (
                          <p className="text-xs text-gray-400 mt-1">لا يوجد موظفون نشطون في هذا القسم حاليًا — الطلب هيروح لقايمة القسم.</p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <button
                  onClick={() => handleAdvance(s)}
                  disabled={acting}
                  className="bg-memorina-teal text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {acting ? "جارٍ النقل..." : assignPick[s] ? "تأكيد التحويل للشخص" : "تأكيد النقل للقسم"}
                </button>
              </div>
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
              <th className="py-2">تم</th>
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
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={progressForCurrentStage(it.id)}
                    disabled={!canToggleItems || order.status !== "active"}
                    onChange={(e) => handleToggleItem(it.id, e.target.checked)}
                    className="w-4 h-4 accent-memorina-teal"
                  />
                </td>
                <td className="py-2">{it.name}</td>
                <td className="py-2">{it.size || "—"}</td>
                <td className="py-2">{it.quantity}</td>
                <td className="py-2">{it.unit_price.toFixed(2)}</td>
                <td className="py-2 font-medium">{it.total_price.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 mt-2">
          مربع "تم" يعكس إنجاز العنصر في مرحلة {STAGE_LABEL_AR[order.current_stage]} الحالية.
        </p>
      </div>

      {canSeeMoney && order.financials && (
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 space-y-2 text-sm">
          <Row label="المجموع الفرعي" value={order.financials.subtotal} />
          <Row label="الخصم" value={-order.financials.discount} />
          <Row label="تكلفة الشحن" value={order.financials.shipping_cost} />
          <Row label="الإجمالي الكلي" value={order.financials.grand_total} bold />
          <Row label="المدفوع" value={order.financials.total_paid} />
          <Row label="المتبقي" value={order.financials.remaining_balance} bold />
          {order.due_date && (
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="text-gray-500">تاريخ التسليم المطلوب</span>
              <span>{new Date(order.due_date).toLocaleDateString("ar-EG")}</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        {(isAdminOrOM || profile?.role === "shipping") && (
          <OrderPayments orderId={order.id} remainingBalance={order.financials?.remaining_balance} onPaymentAdded={load} />
        )}
        <OrderFiles orderId={order.id} />

        {assignments.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
            <h2 className="font-semibold mb-3">الوقت المستغرق لكل مرحلة</h2>
            <ul className="divide-y divide-gray-50 text-sm">
              {assignments.map((a) => (
                <li key={a.id} className="py-2 flex items-center justify-between">
                  <span>{a.user?.full_name} — {ROLE_LABEL_AR[a.role_at_assignment] || a.role_at_assignment}</span>
                  <span className="text-gray-500">
                    {formatDuration(a.claimed_at, a.released_at)}{!a.released_at && " (لسه شغال)"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

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

// Inline edit panel: order-level fields, discount/shipping, and items
// (add/edit/remove) — for cases where something changes mid-production.
function OrderEditPanel({ order, items, onSaved }: { order: Order; items: OrderItem[]; onSaved: () => void }) {
  const [dueDate, setDueDate] = useState(order.due_date ? order.due_date.slice(0, 10) : "");
  const [priority, setPriority] = useState(order.priority);
  const [shippingAddress, setShippingAddress] = useState(order.shipping_address || "");
  const [notes, setNotes] = useState(order.notes || "");
  const [discount, setDiscount] = useState(order.financials?.discount ?? 0);
  const [shippingCost, setShippingCost] = useState(order.financials?.shipping_cost ?? 0);
  const [editItems, setEditItems] = useState(items.map((i) => ({ ...i, _deleted: false, _isNew: false })));
  const [newItems, setNewItems] = useState<NewOrderItemInput[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateExisting(id: string, patch: Partial<OrderItem>) {
    setEditItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function removeExisting(id: string) {
    setEditItems((prev) => prev.map((it) => (it.id === id ? { ...it, _deleted: true } : it)));
  }

  function addNewItem() {
    setNewItems((prev) => [...prev, { name: "", quantity: 1, unit_price: 0, size: "" }]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateOrder(order.id, {
        due_date: dueDate || undefined,
        priority: priority as any,
        shipping_address: shippingAddress || null,
        notes: notes || null,
      });
      if (order.financials) {
        await updateOrderFinancials(order.id, { discount, shipping_cost: shippingCost });
      }
      for (const it of editItems) {
        if (it._deleted) {
          await deleteOrderItem(it.id);
        } else {
          await updateOrderItem(it.id, {
            name: it.name,
            size: it.size || undefined,
            quantity: it.quantity,
            unit_price: it.unit_price,
          });
        }
      }
      for (const ni of newItems) {
        if (ni.name && ni.quantity > 0) {
          await addOrderItem(order.id, ni);
        }
      }
      onSaved();
    } catch (err: any) {
      setError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white border border-memorina-teal/30 rounded-2xl shadow-sm p-5 mb-4">
      <h2 className="font-semibold mb-3">تعديل الطلب</h2>
      {error && <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <label className="block">
          <span className="block text-sm text-gray-700 mb-1">تاريخ التسليم</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="block text-sm text-gray-700 mb-1">الأولوية</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="low">منخفضة</option>
            <option value="normal">عادية</option>
            <option value="high">عالية</option>
            <option value="urgent">عاجلة</option>
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-sm text-gray-700 mb-1">عنوان الشحن</span>
          <input value={shippingAddress} onChange={(e) => setShippingAddress(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-sm text-gray-700 mb-1">ملاحظات</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        {order.financials && (
          <>
            <label className="block">
              <span className="block text-sm text-gray-700 mb-1">الخصم</span>
              <input type="number" onFocus={(e) => e.target.select()} min={0} step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
            <label className="block">
              <span className="block text-sm text-gray-700 mb-1">تكلفة الشحن</span>
              <input type="number" onFocus={(e) => e.target.select()} min={0} step="0.01" value={shippingCost} onChange={(e) => setShippingCost(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>
          </>
        )}
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">العناصر</span>
          <button type="button" onClick={addNewItem} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5">+ إضافة عنصر</button>
        </div>
        <div className="space-y-2">
          {editItems.filter((it) => !it._deleted).map((it) => (
            <div key={it.id} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
              <input value={it.name} onChange={(e) => updateExisting(it.id, { name: e.target.value })} className="sm:col-span-2 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <input value={it.size || ""} onChange={(e) => updateExisting(it.id, { size: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <input type="number" onFocus={(e) => e.target.select()} min={1} value={it.quantity} onChange={(e) => updateExisting(it.id, { quantity: Number(e.target.value) })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <div className="flex gap-1">
                <input type="number" onFocus={(e) => e.target.select()} min={0} step="0.01" value={it.unit_price} onChange={(e) => updateExisting(it.id, { unit_price: Number(e.target.value) })} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                <button type="button" onClick={() => removeExisting(it.id)} className="text-red-600 text-sm px-2">✕</button>
              </div>
            </div>
          ))}
          {newItems.map((ni, i) => (
            <div key={`new-${i}`} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
              <input placeholder="اسم المنتج" value={ni.name} onChange={(e) => setNewItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))} className="sm:col-span-2 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <input placeholder="المقاس" value={ni.size} onChange={(e) => setNewItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, size: e.target.value } : x)))} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <input type="number" onFocus={(e) => e.target.select()} min={1} placeholder="الكمية" value={ni.quantity} onChange={(e) => setNewItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, quantity: Number(e.target.value) } : x)))} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              <input type="number" onFocus={(e) => e.target.select()} min={0} step="0.01" placeholder="سعر الوحدة" value={ni.unit_price} onChange={(e) => setNewItems((prev) => prev.map((x, idx) => (idx === i ? { ...x, unit_price: Number(e.target.value) } : x)))} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
            </div>
          ))}
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="bg-memorina-teal text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
        {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
      </button>
    </div>
  );
}