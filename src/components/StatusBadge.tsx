import React from "react";
import type { WorkflowStageCode } from "../types/database";

const STAGE_STYLE: Record<WorkflowStageCode, string> = {
  NEW: "bg-blue-100 text-blue-800",
  DESIGN: "bg-purple-100 text-purple-800",
  PRINTING: "bg-orange-100 text-orange-800",
  ASSEMBLY: "bg-cyan-100 text-cyan-800",
  PACKAGING: "bg-yellow-100 text-yellow-800",
  SHIPPING: "bg-green-100 text-green-800",
  DELIVERED: "bg-emerald-100 text-emerald-900",
  COLLECTED: "bg-memorina-teal/15 text-memorina-teal",
  CANCELLED: "bg-red-100 text-red-800",
};

const STAGE_LABEL_AR: Record<WorkflowStageCode, string> = {
  NEW: "جديد",
  DESIGN: "التصميم",
  PRINTING: "الطباعة",
  ASSEMBLY: "التجميع",
  PACKAGING: "التغليف",
  SHIPPING: "الشحن",
  DELIVERED: "تم التسليم",
  COLLECTED: "تم التحصيل",
  CANCELLED: "ملغي",
};

export function StatusBadge({ stage }: { stage: WorkflowStageCode }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium ${STAGE_STYLE[stage]}`}>
      {STAGE_LABEL_AR[stage]}
    </span>
  );
}
