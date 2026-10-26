import React, { useEffect, useState } from "react";
import { listAuditLogs } from "../services/auditService";
import { listComments, addComment } from "../services/commentsService";
import type { AuditLog, Comment } from "../types/database";

const ACTION_LABEL_AR: Record<string, (log: AuditLog) => string> = {
  order_created: () => "تم إنشاء الطلب",
  stage_changed: (l) => `تم نقل الطلب إلى مرحلة ${STAGE_AR[l.to_value || ""] || l.to_value}`,
  task_claimed: () => "تم استلام المهمة",
  file_uploaded: (l) => `تم رفع ملف (${CATEGORY_AR[l.to_value || ""] || l.to_value})`,
  payment_recorded: (l) => `تم تسجيل دفعة (${l.to_value})`,
};

const STAGE_AR: Record<string, string> = {
  NEW: "جديد", DESIGN: "التصميم", PRINTING: "الطباعة", ASSEMBLY: "التجميع",
  PACKAGING: "التغليف", SHIPPING: "الشحن", DELIVERED: "تم التسليم",
  COLLECTED: "تم التحصيل", CANCELLED: "ملغي",
};

const CATEGORY_AR: Record<string, string> = {
  CUSTOMER_REFERENCE: "مرجع من العميل", DESIGN: "تصميم", PRINTING: "طباعة",
  SHIPPING: "شحن", OTHER: "أخرى",
};

type FeedItem =
  | { kind: "log"; at: string; log: AuditLog }
  | { kind: "comment"; at: string; comment: Comment };

export function OrderTimeline({ orderId }: { orderId: string }) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [logs, comments] = await Promise.all([listAuditLogs(orderId), listComments(orderId)]);
    const merged: FeedItem[] = [
      ...logs.map((log): FeedItem => ({ kind: "log", at: log.created_at, log })),
      ...comments.map((comment): FeedItem => ({ kind: "comment", at: comment.created_at, comment })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    setItems(merged);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setPosting(true);
    setError(null);
    try {
      await addComment(orderId, message.trim());
      setMessage("");
      await load();
    } catch {
      setError("تعذر إرسال التعليق.");
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5">
      <h2 className="font-semibold mb-3">سجل النشاط والتعليقات</h2>

      {loading ? (
        <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-sm">لا يوجد نشاط بعد.</p>
      ) : (
        <ul className="space-y-3 mb-4 max-h-96 overflow-y-auto">
          {items.map((item) =>
            item.kind === "log" ? (
              <li key={`log-${item.log.id}`} className="text-sm">
                <span className="text-gray-400 text-xs block">
                  {new Date(item.log.created_at).toLocaleString("ar-EG")} — {item.log.user?.full_name || "النظام"}
                </span>
                <span className="text-gray-700">
                  {(ACTION_LABEL_AR[item.log.action]?.(item.log)) || item.log.action}
                </span>
              </li>
            ) : (
              <li key={`comment-${item.comment.id}`} className="text-sm bg-gray-50 rounded-lg p-2.5">
                <span className="text-gray-400 text-xs block">
                  {new Date(item.comment.created_at).toLocaleString("ar-EG")} — {item.comment.user?.full_name}
                </span>
                <span className="text-gray-800">{item.comment.message}</span>
              </li>
            )
          )}
        </ul>
      )}

      {error && <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

      <form onSubmit={handlePost} className="flex gap-2">
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="اكتب تعليقًا..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button disabled={posting} className="bg-memorina-teal text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
          إرسال
        </button>
      </form>
    </div>
  );
}
