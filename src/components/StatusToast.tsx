import { ErrorBadge, Check, Info, Close } from "./StudioIcons";
export type NoticeKind = "success" | "error" | "info";
export interface Notice { id: number; kind: NoticeKind; message: string; }
export function StatusToast({ notice, onDismiss }: { notice: Notice | null; onDismiss: () => void }) {
  const Icon = notice?.kind === "error" ? ErrorBadge : notice?.kind === "success" ? Check : Info;
  return <div className="toast-region">
    {notice && <div className={"toast " + notice.kind} key={notice.id}
      role={notice.kind === "error" ? "alert" : "status"}
      aria-live={notice.kind === "error" ? "assertive" : "polite"} aria-atomic="true">
      <Icon size={16} aria-hidden="true" />
      <span>{notice.message}</span>
      <button className="icon-button" onClick={onDismiss} aria-label="Dismiss notification"><Close size={15} /></button>
    </div>}
  </div>;
}
