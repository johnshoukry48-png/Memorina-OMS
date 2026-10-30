// Turns a Supabase/Postgrest error into something a non-technical
// person can read AND copy into a message to send for help — instead
// of a generic "something went wrong" that hides the real cause and
// forces a screenshot-and-wait round trip every time.
export function describeError(err: any): string {
  if (!err) return "خطأ غير معروف.";
  const parts = [err.message, err.details, err.hint].filter(Boolean);
  const detail = parts.join(" — ");

  // The most common real-world cause: an RLS policy rejected the
  // request, usually because the account's role isn't set correctly.
  if (err.code === "42501" || /row-level security/i.test(err.message || "")) {
    return `تم رفض العملية من قاعدة البيانات (غالبًا صلاحية الحساب غير مضبوطة صح). التفاصيل: ${detail}`;
  }
  return detail || "حدث خطأ غير متوقع.";
}
