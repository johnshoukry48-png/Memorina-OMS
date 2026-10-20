import React, { useEffect, useState } from "react";
import { listExpenses, addExpense } from "../services/expensesService";
import type { Expense } from "../types/database";

// Rendered only for admin (see OrderDetail) — RLS on `expenses` would
// reject anyone else's queries here anyway, this is defense in depth.
export function OrderExpenses({ orderId, grandTotal }: { orderId: string; grandTotal: number }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setExpenses(await listExpenses(orderId));
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
    if (!category || !amt || amt < 0) {
      setError("أدخل الفئة والمبلغ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addExpense({ order_id: orderId, category, amount: amt, description: description || undefined });
      setCategory("");
      setAmount("");
      setDescription("");
      await load();
    } catch {
      setError("تعذر تسجيل المصروف.");
    } finally {
      setSaving(false);
    }
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const netResult = grandTotal - totalExpenses;

  return (
    <div className="bg-white border border-amber-100 bg-amber-50/40 rounded-2xl shadow-sm p-5 mb-4">
      <h2 className="font-semibold mb-1">المصروفات (خاص بالمدير)</h2>
      <p className="text-xs text-gray-500 mb-3">هذا القسم غير مرئي لمسؤول الطلبات أو الموظفين.</p>

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-2 mb-3">
        <input placeholder="الفئة (طباعة، شحن...)" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
        <input type="number" min={0} step="0.01" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
        <input placeholder="وصف (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} className="flex-1 min-w-[120px] rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
        <button disabled={saving} className="bg-gray-900 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
          {saving ? "..." : "إضافة مصروف"}
        </button>
      </form>

      {error && <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

      {loading ? (
        <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
      ) : (
        <>
          {expenses.length === 0 ? (
            <p className="text-gray-400 text-sm mb-3">لا توجد مصروفات مسجلة على هذا الطلب.</p>
          ) : (
            <ul className="divide-y divide-gray-100 text-sm mb-3">
              {expenses.map((ex) => (
                <li key={ex.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-medium">{ex.category}</span>
                    {ex.description && <span className="text-gray-500"> — {ex.description}</span>}
                  </div>
                  <span>{ex.amount.toFixed(2)} ج.م</span>
                </li>
              ))}
            </ul>
          )}
          <div className="pt-2 border-t border-amber-200 text-sm space-y-1">
            <div className="flex justify-between text-gray-600">
              <span>إجمالي المصروفات</span>
              <span>{totalExpenses.toFixed(2)} ج.م</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>صافي الربح</span>
              <span>{netResult.toFixed(2)} ج.م</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
