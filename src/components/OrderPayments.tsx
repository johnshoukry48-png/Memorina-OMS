import React, { useEffect, useState } from "react";
import { listPayments, addPayment, updatePayment, deletePayment } from "../services/paymentsService";
import { useAuth } from "../hooks/useAuth";
import { describeError } from "../lib/errors";
import type { Payment, PaymentMethod } from "../types/database";

const METHOD_AR: Record<PaymentMethod, string> = {
  CASH: "نقدًا",
  INSTAPAY: "إنستاباي",
  VODAFONE_CASH: "فودافون كاش",
};

export function OrderPayments({
  orderId,
  remainingBalance,
  onPaymentAdded,
}: {
  orderId: string;
  remainingBalance?: number;
  onPaymentAdded?: () => void;
}) {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");

  async function load() {
    setLoading(true);
    try {
      setPayments(await listPayments(orderId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Convenience: pre-fill the amount field with whatever's still owed,
  // e.g. when the customer pays off the rest before delivery — still
  // editable, just a sensible starting point.
  useEffect(() => {
    if (remainingBalance && remainingBalance > 0 && !amount) {
      setAmount(remainingBalance.toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingBalance]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      setError("أدخل مبلغًا صحيحًا.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addPayment(orderId, amt, method, notes || undefined);
      setAmount("");
      setNotes("");
      await load();
      onPaymentAdded?.();
    } catch (err: any) {
      setError(err?.message || "تعذر تسجيل الدفعة.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(id: string) {
    const amt = Number(editAmount);
    if (!amt || amt <= 0) return;
    try {
      await updatePayment(id, { amount: amt });
      setEditingId(null);
      await load();
      onPaymentAdded?.();
    } catch (err) {
      console.error("Edit payment failed:", err);
      setError(`تعذر تعديل الدفعة. ${describeError(err)}`);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deletePayment(id);
      await load();
      onPaymentAdded?.();
    } catch (err) {
      console.error("Delete payment failed:", err);
      setError(`تعذر حذف الدفعة. ${describeError(err)}`);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
      <h2 className="font-semibold mb-3">المدفوعات</h2>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-3">
        <input
          type="number" onFocus={(e) => e.target.select()} min={0} step="0.01" placeholder="المبلغ"
          value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
        <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
          <option value="CASH">نقدًا</option>
          <option value="INSTAPAY">إنستاباي</option>
          <option value="VODAFONE_CASH">فودافون كاش</option>
        </select>
        <input
          placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)}
          className="flex-1 min-w-[120px] rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
        <button disabled={saving} className="bg-memorina-teal text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
          {saving ? "..." : "تسجيل الدفعة"}
        </button>
      </form>
      {remainingBalance !== undefined && remainingBalance > 0 && (
        <p className="text-xs text-gray-400 mb-2">المبلغ معبّأ تلقائيًا بالمتبقي ({remainingBalance.toFixed(2)} ج.م) — عدّله لو الدفعة جزء بس.</p>
      )}

      {error && <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

      {loading ? (
        <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
      ) : payments.length === 0 ? (
        <p className="text-gray-400 text-sm">لا توجد دفعات مسجلة بعد.</p>
      ) : (
        <ul className="divide-y divide-gray-50 text-sm">
          {payments.map((p) => (
            <li key={p.id} className="py-2 flex items-center justify-between">
              {editingId === p.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="number" onFocus={(e) => e.target.select()} min={0} step="0.01" value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                  />
                  <button onClick={() => handleSaveEdit(p.id)} className="text-memorina-teal text-xs">حفظ</button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 text-xs">إلغاء</button>
                </div>
              ) : (
                <>
                  <div>
                    <span className="font-medium">{p.amount.toFixed(2)} ج.م</span>
                    <span className="text-gray-500"> — {METHOD_AR[p.method]}</span>
                    {p.notes && <span className="text-gray-400"> — {p.notes}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs">
                      {new Date(p.created_at).toLocaleDateString("ar-EG")} — {p.recorder?.full_name}
                    </span>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => { setEditingId(p.id); setEditAmount(String(p.amount)); }}
                          className="text-xs text-gray-500"
                        >
                          تعديل
                        </button>
                        <button onClick={() => handleDelete(p.id)} className="text-xs text-red-500">حذف</button>
                      </>
                    )}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
