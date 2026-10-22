import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

// Reached via the link Supabase emails from resetPasswordForEmail().
// supabase-js auto-detects the recovery token in the URL and creates
// a temporary session — this form just sets a new password on it.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirm) {
      setError("كلمتا المرور غير متطابقتين.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      setError("تعذر تحديث كلمة المرور. قد يكون الرابط منتهي الصلاحية — اطلب رابطًا جديدًا.");
    } else {
      navigate("/");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-xl font-bold text-center mb-6">تعيين كلمة مرور جديدة</h1>

        {error && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}

        <label className="block mb-4">
          <span className="block text-sm text-gray-700 mb-1">كلمة المرور الجديدة</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>
        <label className="block mb-6">
          <span className="block text-sm text-gray-700 mb-1">تأكيد كلمة المرور</span>
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        <button disabled={submitting} className="w-full bg-memorina-teal text-white rounded-lg py-2.5 font-medium disabled:opacity-50">
          {submitting ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}
        </button>
      </form>
    </div>
  );
}
