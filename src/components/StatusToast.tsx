import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export type NoticeKind = "success" | "error" | "info";

export interface Notice {
  id: number;
  kind: NoticeKind;
  message: string;
}

export function StatusToast({
  notice,
  onDismiss,
}: {
  notice: Notice | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;
  const Icon = notice.kind === "success"
    ? CheckCircle2
    : notice.kind === "error"
      ? AlertCircle
      : Info;

  return (
    <div
      key={notice.id}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"}
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-5 sm:bottom-5 sm:max-w-md z-[120] rounded-xl border border-[var(--border-color)] bg-[#272d3a] shadow-[0_20px_60px_rgba(0,0,0,0.55)] px-4 py-3 flex items-start gap-3"
    >
      <Icon
        size={18}
        className={
          "shrink-0 mt-0.5 " +
          (notice.kind === "error"
            ? "text-rose-400"
            : notice.kind === "success"
              ? "text-emerald-400"
              : "text-[var(--accent)]")
        }
        aria-hidden="true"
      />
      <span className="text-sm leading-relaxed text-[var(--text-main)] flex-1">
        {notice.message}
      </span>
      <button
        type="button"
        aria-label="Dismiss notification"
        title="Dismiss"
        onClick={onDismiss}
        className="shrink-0 p-1 -mr-1 text-[var(--text-muted)] hover:text-white rounded-md"
      >
        <X size={16} />
      </button>
    </div>
  );
}
