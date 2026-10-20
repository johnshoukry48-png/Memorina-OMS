import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      setError("تعذر إرسال رابط إعادة التعيين. تحقق من البريد الإلكتروني.");
    } else {
      setSent(true);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <h1 className="text-xl font-bold text-center mb-1">نسيت كلمة المرور؟</h1>
        <p className="text-center text-gray-500 text-sm mb-6">
          أدخل بريدك الإلكتروني وسنرسل لك رابطًا لإعادة تعيين كلمة المرور.
        </p>

        {sent ? (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            تم إرسال الرابط، تحقق من بريدك الإلكتروني.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>
            )}
            <label className="block mb-4">
              <span className="block text-sm text-gray-700 mb-1">البريد الإلكتروني</span>
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-800"
              />
            </label>
            <button
              type="submit" disabled={submitting}
              className="w-full bg-gray-900 text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
            >
              {submitting ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
            </button>
          </form>
        )}

        <Link to="/login" className="block text-center text-sm text-gray-500 mt-4">← العودة لتسجيل الدخول</Link>
      </div>
    </div>
  );
}
