import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { getDashboardStats, getTodaySummary, DashboardStats, TodaySummary } from "../services/dashboardService";
import { StatusBadge } from "../components/StatusBadge";
import type { WorkflowStageCode } from "../types/database";

const ROLE_LABELS_AR: Record<string, string> = {
  admin: "مدير النظام",
  order_manager: "مسؤول الطلبات",
  designer: "مصمم",
  printing: "قسم الطباعة",
  assembly: "قسم التجميع",
  packaging: "قسم التغليف",
  shipping: "قسم الشحن",
};

const STAGE_ORDER: WorkflowStageCode[] = ["NEW", "DESIGN", "PRINTING", "ASSEMBLY", "PACKAGING", "SHIPPING"];
const STAGE_LABEL_AR: Record<WorkflowStageCode, string> = {
  NEW: "جديد", DESIGN: "التصميم", PRINTING: "الطباعة", ASSEMBLY: "التجميع",
  PACKAGING: "التغليف", SHIPPING: "الشحن", DELIVERED: "تم التسليم",
  COLLECTED: "تم التحصيل", CANCELLED: "ملغي",
};

export default function Dashboard() {
  const { profile } = useAuth();
  const isAdminOrOM = profile?.role === "admin" || profile?.role === "order_manager";
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdminOrOM) return;
    Promise.all([getDashboardStats(), getTodaySummary()])
      .then(([s, t]) => {
        setStats(s);
        setSummary(t);
      })
      .catch((err) => {
        console.error("Dashboard load failed:", err);
        setLoadError(err?.message || "تعذر تحميل بيانات لوحة التحكم.");
      })
      .finally(() => setLoading(false));
  }, [isAdminOrOM]);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold">أهلاً، {profile?.full_name}</h1>
        <p className="text-gray-500 text-sm">{profile?.role ? ROLE_LABELS_AR[profile.role] : ""}</p>
      </div>

      {!isAdminOrOM ? (
        <Link to="/my-tasks" className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow max-w-xl block">
          <p className="font-semibold mb-1">مهامي</p>
          <p className="text-gray-500 text-sm">عرض المهام المتاحة ومهامك الحالية</p>
        </Link>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm max-w-xl">
          تعذر تحميل بيانات لوحة التحكم: {loadError}
        </div>
      ) : loading || !stats || !summary ? (
        <p className="text-gray-400">جارٍ التحميل...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <StatCard label="إجمالي الطلبات النشطة" value={stats.totalActive} />
            {STAGE_ORDER.map((s) => (
              <StatCard key={s} label={STAGE_LABEL_AR[s]} value={stats.byStage[s] || 0} />
            ))}
            <StatCard label="تم التسليم" value={stats.totalDelivered} />
            <StatCard label="تم التحصيل" value={stats.totalCollected} />
            <StatCard label="طلبات متأخرة" value={stats.overdue.length} highlight={stats.overdue.length > 0} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 mb-6">
            <MoneyCard label="مبيعات اليوم" value={summary.salesToday} />
            <MoneyCard label="مدفوعات اليوم" value={summary.paymentsToday} />
            <MoneyCard label="الرصيد المستحق" value={summary.outstandingBalance} />
            {summary.expensesToday !== undefined && (
              <MoneyCard label="مصروفات اليوم" value={summary.expensesToday} />
            )}
          </div>

          {stats.overdue.length > 0 && (
            <div className="bg-white border border-red-100 rounded-2xl shadow-sm p-5 mb-6">
              <h2 className="font-semibold mb-3 text-red-700">🔴 طلبات تحتاج إلى اهتمام</h2>
              <ul className="divide-y divide-gray-50">
                {stats.overdue.map((o) => (
                  <li key={o.id} className="py-2 flex items-center justify-between text-sm">
                    <Link to={`/orders/${o.id}`} className="font-medium">
                      #{o.order_number} — {o.customer?.name}
                    </Link>
                    <div className="flex items-center gap-2">
                      <StatusBadge stage={o.current_stage} />
                      <span className="text-gray-400 text-xs">
                        {o.due_date && new Date(o.due_date).toLocaleDateString("ar-EG")}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-3">
            <Link to="/orders" className="text-sm text-gray-700 border border-gray-300 rounded-lg px-4 py-2">عرض كل الطلبات</Link>
            <Link to="/reports" className="text-sm text-gray-700 border border-gray-300 rounded-lg px-4 py-2">التقارير</Link>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`bg-white border rounded-2xl p-4 shadow-sm ${highlight ? "border-red-200" : "border-gray-100"}`}>
      <p className={`text-2xl font-bold ${highlight ? "text-red-700" : ""}`}>{value}</p>
      <p className="text-gray-500 text-xs mt-1">{label}</p>
    </div>
  );
}

function MoneyCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm">
      <p className="text-xl font-bold">{value.toFixed(2)} ج.م</p>
      <p className="text-gray-500 text-xs mt-1">{label}</p>
    </div>
  );
}
