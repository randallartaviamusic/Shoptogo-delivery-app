import { Button } from "@/components/ui/button";
import { CASH_ISSUE_LABELS } from "@/lib/cash";
import type { CashIssueView } from "@/lib/cash";
import { money, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

/** Rastro visible de un problema de efectivo: monto, autor, fecha y estado. */
export function CashIssueNote({
  issue,
  onResolve,
  className,
}: {
  issue: CashIssueView;
  onResolve?: () => void;
  className?: string;
}) {
  const meta = CASH_ISSUE_LABELS[issue.kind];
  const resolved = Boolean(issue.resolvedAt);
  return (
    <div
      className={cn(
        "rounded-xl border p-2.5 text-[11px] leading-relaxed",
        resolved
          ? "border-border/70 bg-secondary/30 text-muted-foreground"
          : "border-primary/30 bg-primary/[0.07]",
        className,
      )}
    >
      <p
        className={cn(
          "flex items-center gap-1.5 font-semibold",
          resolved ? "text-muted-foreground" : "text-primary",
        )}
      >
        {resolved ? (
          <CheckCircle2 className="size-3.5" />
        ) : (
          <AlertTriangle className="size-3.5" />
        )}
        {meta.label}
        {issue.amount > 0 ? ` · ${money(issue.amount)}` : ""}
      </p>
      <p className="mt-1 text-muted-foreground">{issue.note}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">
        {issue.byName ?? "Usuario"} · {relativeTime(issue.at)}
        {resolved && (
          <>
            {" "}
            · Cerrado por {issue.resolvedByName ?? "el equipo"} ·{" "}
            {relativeTime(issue.resolvedAt ?? issue.at)}
          </>
        )}
      </p>
      {!resolved && onResolve && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1.5 h-7 px-2 text-[11px] text-primary hover:bg-primary/10"
          onClick={onResolve}
        >
          Marcar como resuelto
        </Button>
      )}
    </div>
  );
}
