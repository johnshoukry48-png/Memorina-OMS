import React, { useEffect, useState } from "react";
import { listExpensesInRange, addExpense, deleteExpense } from "../services/expensesService";
import type { Expense, PaymentMethod } from "../types/database";

const METHOD_AR: Record<PaymentMethod, string> = {
  CASH: "نقدًا",
  INSTAPAY: "إنستاباي",
  VODAFONE_CASH: "فودافون كاش",
};

function monthLabel(d: Date) {
  return d.toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
}

function csvEscape(v: string) {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export default function Expenses() {
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rangeFrom = monthDate.toISOString();
  const rangeTo = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1).toISOString();

  async function load() {
    setLoading(true);
    try {
      setExpenses(await listExpensesInRange(rangeFrom, rangeTo));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthDate]);

  function shiftMonth(delta: number) {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!category || !amt || amt < 0) {
      setError("أدخل الفئة والمبلغ.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addExpense({ category, amount: amt, description: description || undefined, payment_method: method });
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

  async function handleDelete(id: string) {
    try {
      await deleteExpense(id);
      await load();
    } catch {
      setError("تعذر حذف المصروف.");
    }
  }

  function handleExportCsv() {
    const header = ["التاريخ", "الفئة", "المبلغ", "طريقة الدفع", "الوصف"];
    const rows = expenses.map((e) => [
      new Date(e.created_at).toLocaleDateString("ar-EG"),
      e.category,
      e.amount.toFixed(2),
      e.payment_method ? METHOD_AR[e.payment_method] : "",
      e.description || "",
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => csvEscape(String(c))).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `مصروفات-${monthDate.getFullYear()}-${monthDate.getMonth() + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byMethod: Record<string, number> = {};
  for (const e of expenses) {
    if (e.payment_method) byMethod[e.payment_method] = (byMethod[e.payment_method] || 0) + e.amount;
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold mb-1">المصروفات</h1>
      <p className="text-gray-500 text-sm mb-4">
        هذه الصفحة خاصة بالمدير فقط — كل بيانات المصروفات محفوظة دائمًا، وعرضها هنا مقسّم شهرًا بشهر فقط
        حتى يكون عندك حساب واضح لكل شهر لوحده. استخدم "تصدير" لحفظ نسخة لأي شهر كـ backup.
      </p>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => shiftMonth(-1)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">الشهر السابق ←</button>
        <span className="font-semibold">{monthLabel(monthDate)}</span>
        <button onClick={() => shiftMonth(1)} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">→ الشهر التالي</button>
      </div>

      <form onSubmit={handleAdd} className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
        <div className="flex flex-wrap gap-2 mb-2">
          <input placeholder="الفئة (طباعة، مواد خام...)" value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          <input type="number" min={0} step="0.01" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
            <option value="CASH">نقدًا</option>
            <option value="INSTAPAY">إنستاباي</option>
            <option value="VODAFONE_CASH">فودافون كاش</option>
          </select>
          <input placeholder="وصف (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} className="flex-1 min-w-[120px] rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
          <button disabled={saving} className="bg-memorina-teal text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50">
            {saving ? "..." : "إضافة مصروف"}
          </button>
        </div>
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}
      </form>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">مصروفات {monthLabel(monthDate)}</h2>
          <button onClick={handleExportCsv} className="text-xs border border-gray-300 rounded-lg px-3 py-1.5">تصدير CSV</button>
        </div>

        {loading ? (
          <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
        ) : expenses.length === 0 ? (
          <p className="text-gray-400 text-sm">لا توجد مصروفات مسجلة هذا الشهر.</p>
        ) : (
          <ul className="divide-y divide-gray-50 text-sm mb-3">
            {expenses.map((ex) => (
              <li key={ex.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-medium">{ex.category}</span>
                  {ex.description && <span className="text-gray-500"> — {ex.description}</span>}
                  {ex.payment_method && <span className="text-gray-400"> ({METHOD_AR[ex.payment_method]})</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span>{ex.amount.toFixed(2)} ج.م</span>
                  <button onClick={() => handleDelete(ex.id)} className="text-red-500 text-xs">حذف</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="pt-2 border-t border-gray-100 text-sm space-y-1">
          {Object.entries(byMethod).map(([k, v]) => (
            <div key={k} className="flex justify-between text-gray-600">
              <span>{METHOD_AR[k as PaymentMethod]}</span>
              <span>{v.toFixed(2)} ج.م</span>
            </div>
          ))}
          <div className="flex justify-between font-semibold pt-1">
            <span>الإجمالي</span>
            <span>{total.toFixed(2)} ج.م</span>
          </div>
        </div>
      </div>
    </div>
  );
}
