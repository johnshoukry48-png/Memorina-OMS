import React, { useEffect, useState } from "react";
import { listCustomers, createCustomer } from "../services/customersService";
import { describeError } from "../lib/errors";
import type { Customer } from "../types/database";

export default function Customers() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", phone: "", secondary_phone: "", address: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setCustomers(await listCustomers(search || undefined));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    load();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createCustomer(form);
      setForm({ name: "", phone: "", secondary_phone: "", address: "", notes: "" });
      setShowForm(false);
      load();
    } catch (err: any) {
      console.error("Create customer failed:", err);
      setError(`تعذر إضافة العميل. ${describeError(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">العملاء</h1>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="bg-memorina-teal text-white rounded-lg px-4 py-2 text-sm font-medium"
        >
          {showForm ? "إلغاء" : "+ عميل جديد"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white border border-gray-100 rounded-2xl p-5 mb-6 shadow-sm grid gap-3 sm:grid-cols-2">
          {error && <div className="sm:col-span-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
          <input required placeholder="الاسم" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2" />
          <input required placeholder="رقم الهاتف" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2" />
          <input placeholder="رقم هاتف إضافي" value={form.secondary_phone} onChange={(e) => setForm({ ...form, secondary_phone: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2" />
          <input placeholder="العنوان" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-lg border border-gray-300 px-3 py-2" />
          <textarea placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="sm:col-span-2 rounded-lg border border-gray-300 px-3 py-2" />
          <button disabled={saving} className="sm:col-span-2 bg-memorina-teal text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
            {saving ? "جارٍ الحفظ..." : "حفظ العميل"}
          </button>
        </form>
      )}

      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          placeholder="بحث بالاسم أو الهاتف"
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
              <th className="p-3">الاسم</th>
              <th className="p-3">الهاتف</th>
              <th className="p-3">العنوان</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3} className="p-6 text-center text-gray-400">جارٍ التحميل...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={3} className="p-6 text-center text-gray-400">لا يوجد عملاء بعد</td></tr>
            ) : (
              customers.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3">{c.phone}</td>
                  <td className="p-3 text-gray-500">{c.address || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
