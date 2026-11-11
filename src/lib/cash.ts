import type { CashIssueKind } from "@/convex/schema";

/** Problema de efectivo tal como lo devuelve el backend. */
export type CashIssueView = {
  kind: CashIssueKind;
  amount: number;
  note: string;
  at: number;
  by: string;
  byName: string | null;
  /** Orden (local) afectada, cuando el caso es de una tienda puntual. */
  orderId?: string;
  resolvedAt?: number;
  resolvedByName: string | null;
};

export const CASH_ISSUE_LABELS: Record<
  CashIssueKind,
  { label: string; hint: string }
> = {
  shortfall: {
    label: "Faltante de efectivo",
    hint: "El comprador pagó menos de lo que correspondía.",
  },
  incomplete: {
    label: "Pago incompleto al local",
    hint: "El local recibió menos de lo que le correspondía.",
  },
  refund: {
    label: "Devolución por cancelación",
    hint: "Hay que devolver efectivo de un pedido cancelado.",
  },
  claim: {
    label: "Reclamo de efectivo",
    hint: "Alguna de las partes dejó un reclamo abierto.",
  },
};
