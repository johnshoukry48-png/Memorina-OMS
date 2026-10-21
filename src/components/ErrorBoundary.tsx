import React from "react";

interface Props {
  children: React.ReactNode;
}
interface State {
  error: Error | null;
}

// Without this, any uncaught error during render (a failed query, a bad
// prop, a missing table from a skipped migration) unmounts the whole
// React tree with no message — exactly a "blank white screen" bug report
// with no way to diagnose it. This catches that and shows the real error.
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("Unhandled error in app:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" style={{ padding: 24, fontFamily: "sans-serif", textAlign: "right" }}>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
            حصل خطأ غير متوقع
          </h1>
          <p style={{ color: "#6b7280", marginBottom: 12 }}>
            جرب تعمل تحديث للصفحة. لو المشكلة استمرت، ابعت الرسالة دي لمن يهمه الأمر:
          </p>
          <pre
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
              whiteSpace: "pre-wrap",
              direction: "ltr",
              textAlign: "left",
            }}
          >
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
