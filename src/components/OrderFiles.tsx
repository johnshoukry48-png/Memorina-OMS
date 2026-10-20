import React, { useEffect, useRef, useState } from "react";
import { listFiles, uploadFile, getFileDownloadUrl } from "../services/filesService";
import type { OrderFile, FileCategory } from "../types/database";
import { useAuth } from "../hooks/useAuth";

const CATEGORY_AR: Record<FileCategory, string> = {
  CUSTOMER_REFERENCE: "مرجع من العميل",
  DESIGN: "تصميم",
  PRINTING: "طباعة",
  SHIPPING: "شحن",
  OTHER: "أخرى",
};

// Which categories each role is allowed to upload, per RLS in
// 004_files_comments_timeline.sql. Admin/order_manager can upload any.
const ROLE_UPLOAD_CATEGORIES: Record<string, FileCategory[]> = {
  admin: ["CUSTOMER_REFERENCE", "DESIGN", "PRINTING", "SHIPPING", "OTHER"],
  order_manager: ["CUSTOMER_REFERENCE", "DESIGN", "PRINTING", "SHIPPING", "OTHER"],
  designer: ["DESIGN"],
  printing: ["PRINTING"],
  shipping: ["SHIPPING"],
};

export function OrderFiles({ orderId }: { orderId: string }) {
  const { profile } = useAuth();
  const [files, setFiles] = useState<OrderFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<FileCategory>("OTHER");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const allowedCategories = ROLE_UPLOAD_CATEGORIES[profile?.role || ""] || [];

  async function load() {
    setLoading(true);
    try {
      setFiles(await listFiles(orderId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadFile(orderId, category, file);
      if (inputRef.current) inputRef.current.value = "";
      await load();
    } catch {
      setError("تعذر رفع الملف — تأكد أن نوع الملف مسموح لدورك الوظيفي.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(f: OrderFile) {
    const url = await getFileDownloadUrl(f.storage_path);
    window.open(url, "_blank");
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-5 mb-4">
      <h2 className="font-semibold mb-3">الملفات</h2>

      {allowedCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FileCategory)}
            className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          >
            {allowedCategories.map((c) => (
              <option key={c} value={c}>{CATEGORY_AR[c]}</option>
            ))}
          </select>
          <input ref={inputRef} type="file" onChange={handleUpload} disabled={uploading} className="text-sm" />
        </div>
      )}

      {error && <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>}

      {loading ? (
        <p className="text-gray-400 text-sm">جارٍ التحميل...</p>
      ) : files.length === 0 ? (
        <p className="text-gray-400 text-sm">لا توجد ملفات بعد.</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {files.map((f) => (
            <li key={f.id} className="py-2 flex items-center justify-between text-sm">
              <div>
                <p className="font-medium">{f.file_name}</p>
                <p className="text-gray-400 text-xs">
                  {CATEGORY_AR[f.category]} — {f.uploader?.full_name} — {new Date(f.created_at).toLocaleDateString("ar-EG")}
                </p>
              </div>
              <button onClick={() => handleDownload(f)} className="text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 text-xs">
                تنزيل
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
