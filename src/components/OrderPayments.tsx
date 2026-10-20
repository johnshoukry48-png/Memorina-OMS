import React, { useEffect, useState } from "react";
import { listPayments, addPayment } from "../services/paymentsService";
import type { Payment, PaymentMethod } from "../types/database";

const METHOD_AR: Record<PaymentMethod, string> = {
  CASH: "نقدًا",
  INSTAPAY: "إنستاباي",
  VODAFONE_CASH: "فودافون كاش",
};

export function OrderPayments({ orderId, onPaymentAdded }: { orderId: string; onPaymentAdded?: () => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
      <h2 className="font-semibold mb-3">المدفوعات</h2>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-3">
        <input
          type="number" min={0} step="0.01" placeholder="المبلغ"
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
        <button disabled={saving} className="bg-gray-900 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
          {saving ? "..." : "تسجيل الدفعة"}
        </button>
      </form>

      {error && <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

      {loading ? (
        <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
      ) : payments.length === 0 ? (
        <p className="text-gray-400 text-sm">لا توجد دفعات مسجلة بعد.</p>
      ) : (
        <ul className="divide-y divide-gray-50 text-sm">
          {payments.map((p) => (
            <li key={p.id} className="py-2 flex items-center justify-between">
              <div>
                <span className="font-medium">{p.amount.toFixed(2)} ج.م</span>
                <span className="text-gray-500"> — {METHOD_AR[p.method]}</span>
                {p.notes && <span className="text-gray-400"> — {p.notes}</span>}
              </div>
              <span className="text-gray-400 text-xs">
                {new Date(p.created_at).toLocaleDateString("ar-EG")} — {p.recorder?.full_name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
