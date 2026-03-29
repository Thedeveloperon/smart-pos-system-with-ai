export interface Denomination {
  value: number;
  label: string;
}

export const SRI_LANKAN_DENOMINATIONS: Denomination[] = [
  { value: 5000, label: "5,000" },
  { value: 2000, label: "2,000" },
  { value: 1000, label: "1,000" },
  { value: 500, label: "500" },
  { value: 100, label: "100" },
  { value: 50, label: "50" },
  { value: 20, label: "20" },
  { value: 10, label: "10" },
  { value: 5, label: "5" },
  { value: 2, label: "2" },
  { value: 1, label: "1" },
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

export interface CashSession {
  id: string;
  cashierName: string;
  openedAt: Date;
  closedAt?: Date;
  opening: CashSessionEntry;
  closing?: CashSessionEntry;
  expectedCash?: number;
  difference?: number;
  differenceReason?: string;
  status: "active" | "closing" | "closed" | "locked";
  auditLog: AuditLogEntry[];
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
