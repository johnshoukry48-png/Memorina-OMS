import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listCustomers, createCustomer } from "../services/customersService";
import { createOrderWithItems } from "../services/ordersService";
import type { Customer, NewOrderItemInput } from "../types/database";

const emptyItem: NewOrderItemInput = { name: "", quantity: 1, unit_price: 0, size: "" };

export default function OrderNew() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("normal");
  const [shippingAddress, setShippingAddress] = useState("");
  const [discount, setDiscount] = useState(0);
  const [shippingCost, setShippingCost] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<NewOrderItemInput[]>([{ ...emptyItem }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCustomers().then(setCustomers);
  }, []);

  function updateItem(index: number, patch: Partial<NewOrderItemInput>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const estimatedSubtotal = items.reduce((sum, it) => sum + (it.quantity || 0) * (it.unit_price || 0), 0);
  const estimatedTotal = estimatedSubtotal - discount + shippingCost;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (customerMode === "existing" && !customerId) {
      setError("اختر العميل أولاً.");
      return;
    }
    if (customerMode === "new" && (!newCustomerName || !newCustomerPhone)) {
      setError("أدخل اسم ورقم هاتف العميل الجديد.");
      return;
    }
    if (items.length === 0 || items.some((it) => !it.name || it.quantity <= 0)) {
      setError("أضف عنصرًا واحدًا على الأقل بكمية صحيحة.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let finalCustomerId = customerId;
      if (customerMode === "new") {
        const created = await createCustomer({
          name: newCustomerName,
          phone: newCustomerPhone,
          address: newCustomerAddress || undefined,
        });
        finalCustomerId = created.id;
      }

      const order = await createOrderWithItems({
        customer_id: finalCustomerId,
        due_date: dueDate || undefined, // empty = server defaults to +10 days
        priority,
        shipping_address: shippingAddress || undefined,
        discount,
        shipping_cost: shippingCost,
        notes: notes || undefined,
        items,
      });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError("تعذر إنشاء الطلب. تحقق من البيانات وحاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-bold mb-6">طلب جديد</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex gap-2 mb-1">
            <button
              type="button"
              onClick={() => setCustomerMode("existing")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium border ${customerMode === "existing" ? "bg-memorina-teal text-white border-memorina-teal" : "border-gray-300 text-gray-600"}`}
            >
              عميل موجود
            </button>
            <button
              type="button"
              onClick={() => setCustomerMode("new")}
              className={`flex-1 rounded-lg py-2 text-sm font-medium border ${customerMode === "new" ? "bg-memorina-teal text-white border-memorina-teal" : "border-gray-300 text-gray-600"}`}
            >
              عميل جديد
            </button>
          </div>

          {customerMode === "existing" ? (
            <label className="block sm:col-span-2">
              <span className="block text-sm text-gray-700 mb-1">العميل</span>
              <select required value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
                <option value="">اختر عميلاً</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label className="block">
                <span className="block text-sm text-gray-700 mb-1">اسم العميل</span>
                <input required value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="block">
                <span className="block text-sm text-gray-700 mb-1">رقم الهاتف</span>
                <input required value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-sm text-gray-700 mb-1">العنوان (اختياري)</span>
                <input value={newCustomerAddress} onChange={(e) => setNewCustomerAddress(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
              </label>
            </>
          )}

          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">تاريخ التسليم المطلوب</span>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            <span className="block text-xs text-gray-400 mt-1">لو سبته فاضي، هيتحدد تلقائي بعد 10 أيام من النهاردة — وتقدر تعدله في أي وقت.</span>
          </label>

          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">الأولوية</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
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
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">عناصر الطلب</h2>
            <button type="button" onClick={addItem} className="text-sm border border-gray-300 rounded-lg px-3 py-1.5">+ إضافة عنصر</button>
          </div>

          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-5 gap-2 border-b border-gray-50 pb-3 last:border-0">
                <input placeholder="اسم المنتج" required value={item.name} onChange={(e) => updateItem(i, { name: e.target.value })} className="sm:col-span-2 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                <input placeholder="المقاس" value={item.size} onChange={(e) => updateItem(i, { size: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                <input type="number" onFocus={(e) => e.target.select()} min={1} placeholder="الكمية" value={item.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                <div className="flex gap-1">
                  <input type="number" onFocus={(e) => e.target.select()} min={0} step="0.01" placeholder="سعر الوحدة" value={item.unit_price} onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })} className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(i)} className="text-red-600 text-sm px-2">✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">الخصم</span>
            <input type="number" onFocus={(e) => e.target.select()} min={0} step="0.01" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block">
            <span className="block text-sm text-gray-700 mb-1">تكلفة الشحن</span>
            <input type="number" onFocus={(e) => e.target.select()} min={0} step="0.01" value={shippingCost} onChange={(e) => setShippingCost(Number(e.target.value))} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block sm:col-span-2">
            <span className="block text-sm text-gray-700 mb-1">ملاحظات</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>

          <div className="sm:col-span-2 flex justify-between text-sm pt-2 border-t border-gray-100">
            <span className="text-gray-500">الإجمالي التقديري (سيُحسب فعليًا من الخادم بعد الحفظ)</span>
            <span className="font-semibold">{estimatedTotal.toFixed(2)} ج.م</span>
          </div>
        </div>

        <button disabled={saving} className="w-full bg-memorina-teal text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
          {saving ? "جارٍ الحفظ..." : "حفظ الطلب"}
        </button>
      </form>
    </div>
  );
}
