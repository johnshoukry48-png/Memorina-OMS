import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { NotificationBell } from "../components/NotificationBell";

const ROLE_LABELS_AR: Record<string, string> = {
  admin: "مدير النظام",
  order_manager: "مسؤول الطلبات",
  designer: "مصمم",
  printing: "قسم الطباعة",
  assembly: "قسم التجميع",
  packaging: "قسم التغليف",
  shipping: "قسم الشحن",
};

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const canManageOrders = profile?.role === "admin" || profile?.role === "order_manager";
  const isProductionRole = ["designer", "printing", "assembly", "packaging", "shipping"].includes(profile?.role || "");

  const navItems: NavItem[] = [
    { to: "/", label: "الرئيسية", icon: "🏠", end: true },
    ...(canManageOrders
      ? [
          { to: "/orders", label: "الطلبات", icon: "📦" },
          { to: "/customers", label: "العملاء", icon: "👥" },
          { to: "/reports", label: "التقارير", icon: "📊" },
        ]
      : []),
    ...(isProductionRole ? [{ to: "/my-tasks", label: "مهامي", icon: "✅" }] : []),
  ];

  const desktopLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-lg px-3 py-2 text-sm ${isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`;

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center flex-1 py-2 text-xs gap-0.5 ${isActive ? "text-gray-900 font-medium" : "text-gray-400"}`;

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden sm:flex sm:flex-col sm:w-56 sm:fixed sm:inset-y-0 sm:right-0 bg-white border-l border-gray-100 p-4 justify-between">
        <div className="flex flex-col gap-1 w-full">
          <div className="mb-4">
            <p className="font-bold text-lg">ميمورينا</p>
            <p className="text-xs text-gray-500">{profile?.role ? ROLE_LABELS_AR[profile.role] : ""}</p>
          </div>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={desktopLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </div>
        <button onClick={signOut} className="text-sm text-gray-500 text-right">تسجيل الخروج</button>
      </aside>

      {/* Mobile top bar */}
      <div className="mobile-safe-top sm:hidden sticky top-0 z-10 flex items-center justify-between bg-white border-b border-gray-100 px-4 py-3">
        <span className="font-bold">ميمورينا</span>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button onClick={signOut} className="text-xs text-gray-500 px-2 py-1">خروج</button>
        </div>
      </div>

      <main className="sm:mr-56 pb-16 sm:pb-0">
        <div className="hidden sm:flex justify-end p-3">
          <NotificationBell />
        </div>
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-safe-bottom sm:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100 flex">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={mobileLinkClass}>
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
