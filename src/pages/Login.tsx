import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await signIn(email, password);
    setSubmitting(false);
    if (error) {
      setError(error);
    } else {
      navigate("/");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8"
      >
        <h1 className="text-2xl font-bold text-center mb-1 text-memorina-teal">Memorina</h1>
        <p className="text-center text-gray-500 mb-6">تسجيل الدخول لإدارة الطلبات</p>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
            {error}
          </div>
        )}

        <label className="block mb-4">
          <span className="block text-sm text-gray-700 mb-1">البريد الإلكتروني</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-memorina-teal"
          />
        </label>

        <label className="block mb-6">
          <span className="block text-sm text-gray-700 mb-1">كلمة المرور</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-memorina-teal"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-memorina-teal text-white rounded-lg py-2.5 font-medium disabled:opacity-50"
        >
          {submitting ? "جارٍ الدخول..." : "دخول"}
        </button>

        <Link to="/forgot-password" className="block text-center text-sm text-gray-500 mt-4">نسيت كلمة المرور؟</Link>
      </form>
    </div>
  );
}
