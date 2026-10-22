import React, { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  getOrdersByStatus,
  getOrdersByEmployee,
  getSalesReport,
  getPaymentsReport,
  getOutstandingBalance,
  getExpensesReport,
} from "../services/reportsService";

const STAGE_LABEL_AR: Record<string, string> = {
  NEW: "جديد", DESIGN: "التصميم", PRINTING: "الطباعة", ASSEMBLY: "التجميع",
  PACKAGING: "التغليف", SHIPPING: "الشحن", DELIVERED: "تم التسليم",
  completed: "مكتمل", cancelled: "ملغي",
};

const METHOD_AR: Record<string, string> = { CASH: "نقدًا", INSTAPAY: "إنستاباي", VODAFONE_CASH: "فودافون كاش" };

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function Reports() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [from, setFrom] = useState(isoDateOnly(new Date(Date.now() - 30 * 24 * 3600 * 1000)));
  const [to, setTo] = useState(isoDateOnly(new Date()));
  const [loading, setLoading] = useState(true);

  const [byStatus, setByStatus] = useState<Record<string, number>>({});
  const [byEmployee, setByEmployee] = useState<{ name: string; count: number }[]>([]);
  const [sales, setSales] = useState(0);
  const [payments, setPayments] = useState<{ total: number; byMethod: Record<string, number> }>({ total: 0, byMethod: {} });
  const [outstanding, setOutstanding] = useState(0);
  const [expenses, setExpenses] = useState<{ total: number; byCategory: Record<string, number> } | null>(null);

  async function load() {
    setLoading(true);
    const range = { from: `${from}T00:00:00.000Z`, to: `${to}T23:59:59.999Z` };
    try {
      const [status, employee, salesTotal, paymentsTotal, outstandingTotal] = await Promise.all([
        getOrdersByStatus(),
        getOrdersByEmployee(),
        getSalesReport(range),
        getPaymentsReport(range),
        getOutstandingBalance(),
      ]);
      setByStatus(status);
      setByEmployee(employee);
      setSales(salesTotal);
      setPayments(paymentsTotal);
      setOutstanding(outstandingTotal);

      if (isAdmin) {
        setExpenses(await getExpensesReport(range));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const netResult = expenses ? sales - expenses.total : null;

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">التقارير</h1>

      <div className="flex flex-wrap items-end gap-2 mb-6">
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">من</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" />
        </label>
        <label className="text-sm">
          <span className="block text-gray-600 mb-1">إلى</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5" />
        </label>
        <button onClick={load} className="bg-memorina-teal text-white rounded-lg px-4 py-1.5 text-sm font-medium">تطبيق</button>
      </div>

      {loading ? (
        <p className="text-gray-400">جارٍ التحميل...</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <ReportCard title="الطلبات حسب الحالة">
            <Table rows={Object.entries(byStatus).map(([k, v]) => [STAGE_LABEL_AR[k] || k, String(v)])} />
          </ReportCard>

          <ReportCard title="الطلبات حسب الموظف">
            <Table rows={byEmployee.map((e) => [e.name, String(e.count)])} />
          </ReportCard>

          <ReportCard title="المبيعات (حسب الفترة)">
            <p className="text-2xl font-bold">{sales.toFixed(2)} ج.م</p>
          </ReportCard>

          <ReportCard title="المدفوعات (حسب الفترة)">
            <p className="text-2xl font-bold mb-2">{payments.total.toFixed(2)} ج.م</p>
            <Table rows={Object.entries(payments.byMethod).map(([k, v]) => [METHOD_AR[k] || k, Number(v).toFixed(2)])} />
          </ReportCard>

          <ReportCard title="الرصيد المستحق">
            <p className="text-2xl font-bold">{outstanding.toFixed(2)} ج.م</p>
          </ReportCard>

          {isAdmin && expenses && (
            <ReportCard title="المصروفات (خاص بالمدير)" highlight>
              <p className="text-2xl font-bold mb-2">{expenses.total.toFixed(2)} ج.م</p>
              <Table rows={Object.entries(expenses.byCategory).map(([k, v]) => [k, Number(v).toFixed(2)])} />
            </ReportCard>
          )}

          {isAdmin && netResult !== null && (
            <ReportCard title="صافي الربح (خاص بالمدير)" highlight>
              <p className="text-2xl font-bold">{netResult.toFixed(2)} ج.م</p>
            </ReportCard>
          )}
        </div>
      )}
    </div>
  );
}

function ReportCard({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`bg-white border rounded-2xl shadow-sm p-5 ${highlight ? "border-amber-200 bg-amber-50/40" : "border-gray-100"}`}>
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Table({ rows }: { rows: [string, string][] }) {
  if (rows.length === 0) return <p className="text-gray-400 text-sm">لا توجد بيانات</p>;
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k} className="border-b border-gray-50 last:border-0">
            <td className="py-1.5 text-gray-600">{k}</td>
            <td className="py-1.5 text-left font-medium">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
