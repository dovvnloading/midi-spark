import { AlertCircle, Check, Info, X } from "lucide-react";
export type NoticeKind = "success" | "error" | "info";
export interface Notice { id: number; kind: NoticeKind; message: string; }
export function StatusToast({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  const Icon = notice?.kind === "error" ? AlertCircle : notice?.kind === "success" ? Check : Info;
  return <div className="toast-region" aria-live="polite" aria-atomic="true">
    {notice && <div className={"toast " + notice.kind} key={notice.id}><Icon size={16} aria-hidden="true" /><span>{notice.message}</span><button className="icon-button" onClick={onDismiss} aria-label="Dismiss notification"><X size={15} /></button></div>}
  </div>;
}
