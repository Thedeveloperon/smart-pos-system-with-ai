export interface Denomination {
  value: number;
  label: string;
  kind: "note" | "coin";
  imagePath: string;
}

export const SRI_LANKAN_DENOMINATIONS: Denomination[] = [
  { value: 5000, label: "5,000", kind: "note", imagePath: "/images/denominations/lkr/notes/rs-5000-note.svg" },
  { value: 2000, label: "2,000", kind: "note", imagePath: "/images/denominations/lkr/notes/rs-2000-note.svg" },
  { value: 1000, label: "1,000", kind: "note", imagePath: "/images/denominations/lkr/notes/rs-1000-note.svg" },
  { value: 500, label: "500", kind: "note", imagePath: "/images/denominations/lkr/notes/rs-500-note.svg" },
  { value: 100, label: "100", kind: "note", imagePath: "/images/denominations/lkr/notes/rs-100-note.svg" },
  { value: 50, label: "50", kind: "note", imagePath: "/images/denominations/lkr/notes/rs-50-note.svg" },
  { value: 20, label: "20", kind: "note", imagePath: "/images/denominations/lkr/notes/rs-20-note.svg" },
  { value: 10, label: "10", kind: "coin", imagePath: "/images/denominations/lkr/coins/rs-10-coin.svg" },
  { value: 5, label: "5", kind: "coin", imagePath: "/images/denominations/lkr/coins/rs-5-coin.svg" },
  { value: 2, label: "2", kind: "coin", imagePath: "/images/denominations/lkr/coins/rs-2-coin.svg" },
  { value: 1, label: "1", kind: "coin", imagePath: "/images/denominations/lkr/coins/rs-1-coin.svg" },
];

export interface DenominationCount {
  denomination: number;
  quantity: number;
}

export interface CashSessionEntry {
  counts: DenominationCount[];
  total: number;
  submittedBy: string;
  submittedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
}

export interface CashDrawerState {
  counts: DenominationCount[];
  total: number;
  updatedAt?: Date;
}

export interface CashSession {
  id: string;
  cashierName: string;
  shiftNumber: number;
  openedAt: Date;
  closedAt?: Date;
  opening: CashSessionEntry;
  closing?: CashSessionEntry;
  expectedCash?: number;
  difference?: number;
  differenceReason?: string;
  status: "active" | "closing" | "closed" | "locked";
  auditLog: AuditLogEntry[];
  cashSalesTotal: number;
  drawer: CashDrawerState;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  performedBy: string;
  performedAt: Date;
  details: string;
  amount?: number;
}

export type UserRole = "cashier" | "manager" | "admin";
