import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { UserRole } from "../types/database";

interface Props {
  children: React.ReactNode;
  allowedRoles?: UserRole[]; // omit to allow any signed-in, role-assigned user
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <div className="p-8 text-center text-gray-500">جارٍ التحميل...</div>;
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (!profile || !profile.role || !profile.active) {
    return (
      <div className="p-8 text-center text-gray-600">
        حسابك بانتظار تفعيل الصلاحيات من المدير. تواصل مع الإدارة.
      </div>
    );
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
