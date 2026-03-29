import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import type { CashSession, AuditLogEntry, DenominationCount, UserRole } from "./types";

interface CashSessionContextValue {
  session: CashSession | null;
  isSessionActive: boolean;
  canSell: boolean;
  startSession: (counts: DenominationCount[], total: number, cashierName: string) => void;
  resetSession: () => void;
  initiateClosing: () => void;
  completeClosing: (counts: DenominationCount[], total: number, reason?: string) => void;
  cancelClosing: () => void;
  getExpectedCash: () => number;
  addSaleToCash: (amount: number, paymentMethod: string) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  auditLog: AuditLogEntry[];
  cashSalesTotal: number;
}

const CashSessionContext = createContext<CashSessionContextValue | null>(null);

const STORAGE_KEYS = {
  session: "smartpos.cash-session",
  cashSalesTotal: "smartpos.cash-sales-total",
  userRole: "smartpos.user-role",
} as const;

type StoredCashSession = Omit<CashSession, "openedAt" | "closedAt" | "opening" | "closing" | "auditLog"> & {
  openedAt: string;
  closedAt?: string;
  opening: Omit<CashSession["opening"], "submittedAt" | "approvedAt"> & {
    submittedAt: string;
    approvedAt?: string;
  };
  closing?: Omit<NonNullable<CashSession["closing"]>, "submittedAt" | "approvedAt"> & {
    submittedAt: string;
    approvedAt?: string;
  };
  auditLog: Array<Omit<AuditLogEntry, "performedAt"> & { performedAt: string }>;
};

const toStoredSession = (session: CashSession): StoredCashSession => ({
  ...session,
  openedAt: session.openedAt.toISOString(),
  closedAt: session.closedAt?.toISOString(),
  opening: {
    ...session.opening,
    submittedAt: session.opening.submittedAt.toISOString(),
    approvedAt: session.opening.approvedAt?.toISOString(),
  },
  closing: session.closing
    ? {
        ...session.closing,
        submittedAt: session.closing.submittedAt.toISOString(),
        approvedAt: session.closing.approvedAt?.toISOString(),
      }
    : undefined,
  auditLog: session.auditLog.map((entry) => ({
    ...entry,
    performedAt: entry.performedAt.toISOString(),
  })),
});

const fromStoredSession = (session: StoredCashSession): CashSession => ({
  ...session,
  openedAt: new Date(session.openedAt),
  closedAt: session.closedAt ? new Date(session.closedAt) : undefined,
  opening: {
    ...session.opening,
    submittedAt: new Date(session.opening.submittedAt),
    approvedAt: session.opening.approvedAt ? new Date(session.opening.approvedAt) : undefined,
  },
  closing: session.closing
    ? {
        ...session.closing,
        submittedAt: new Date(session.closing.submittedAt),
        approvedAt: session.closing.approvedAt ? new Date(session.closing.approvedAt) : undefined,
      }
    : undefined,
  auditLog: session.auditLog.map((entry) => ({
    ...entry,
    performedAt: new Date(entry.performedAt),
  })),
});

export const useCashSession = () => {
  const ctx = useContext(CashSessionContext);
  if (!ctx) throw new Error("useCashSession must be used within CashSessionProvider");
  return ctx;
};

export const CashSessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<CashSession | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.session);
    if (!stored) {
      return null;
    }

    try {
      return fromStoredSession(JSON.parse(stored) as StoredCashSession);
    } catch {
      return null;
    }
  });
  const [cashSalesTotal, setCashSalesTotal] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.cashSalesTotal);
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.userRole);
    if (stored === "cashier" || stored === "manager" || stored === "admin") {
      return stored;
    }
    return "cashier";
  });

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(toStoredSession(session)));
    } else {
      localStorage.removeItem(STORAGE_KEYS.session);
    }
  }, [session]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.cashSalesTotal, String(cashSalesTotal));
  }, [cashSalesTotal]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.userRole, userRole);
  }, [userRole]);

  const isSessionActive = session?.status === "active";
  const canSell = isSessionActive;

  const addAuditEntry = (action: string, details: string, amount?: number): AuditLogEntry => ({
    id: crypto.randomUUID(),
    action,
    performedBy: session?.cashierName || "System",
    performedAt: new Date(),
    details,
    amount,
  });

  const startSession = useCallback((counts: DenominationCount[], total: number, cashierName: string) => {
    const entry = addAuditEntry("SESSION_OPENED", `Opening cash: Rs. ${total.toLocaleString()}`, total);
    const newSession: CashSession = {
      id: crypto.randomUUID(),
      cashierName,
      openedAt: new Date(),
      opening: {
        counts,
        total,
        submittedBy: cashierName,
        submittedAt: new Date(),
      },
      status: "active",
      auditLog: [{ ...entry, performedBy: cashierName }],
    };
    setSession(newSession);
    setCashSalesTotal(0);
  }, []);

  const resetSession = useCallback(() => {
    setSession(null);
    setCashSalesTotal(0);
  }, []);

  const initiateClosing = useCallback(() => {
    setSession(prev => prev ? { ...prev, status: "closing" } : null);
  }, []);

  const cancelClosing = useCallback(() => {
    setSession(prev => prev ? { ...prev, status: "active" } : null);
  }, []);

  const getExpectedCash = useCallback(() => {
    if (!session) return 0;
    return session.opening.total + cashSalesTotal;
  }, [session, cashSalesTotal]);

  const completeClosing = useCallback((counts: DenominationCount[], total: number, reason?: string) => {
    setSession(prev => {
      if (!prev) return null;
      const expected = prev.opening.total + cashSalesTotal;
      const difference = total - expected;
      const entry = addAuditEntry(
        "SESSION_CLOSED",
        `Closing cash: Rs. ${total.toLocaleString()}. Expected: Rs. ${expected.toLocaleString()}. Difference: Rs. ${difference.toLocaleString()}${reason ? `. Reason: ${reason}` : ""}`,
        total
      );
      return {
        ...prev,
        closedAt: new Date(),
        closing: {
          counts,
          total,
          submittedBy: prev.cashierName,
          submittedAt: new Date(),
        },
        expectedCash: expected,
        difference,
        differenceReason: reason,
        status: "closed" as const,
        auditLog: [...prev.auditLog, { ...entry, performedBy: prev.cashierName }],
      };
    });
  }, [cashSalesTotal]);

  const addSaleToCash = useCallback((amount: number, paymentMethod: string) => {
    if (paymentMethod === "cash") {
      setCashSalesTotal(prev => prev + amount);
    }
    setSession(prev => {
      if (!prev) return null;
      const entry: AuditLogEntry = {
        id: crypto.randomUUID(),
        action: "SALE_COMPLETED",
        performedBy: prev.cashierName,
        performedAt: new Date(),
        details: `Sale Rs. ${amount.toLocaleString()} via ${paymentMethod}`,
        amount,
      };
      return { ...prev, auditLog: [...prev.auditLog, entry] };
    });
  }, []);

  return (
    <CashSessionContext.Provider value={{
      session,
      isSessionActive,
      canSell,
      startSession,
      resetSession,
      initiateClosing,
      completeClosing,
      cancelClosing,
      getExpectedCash,
      addSaleToCash,
      userRole,
      setUserRole,
      auditLog: session?.auditLog || [],
      cashSalesTotal,
    }}>
      {children}
    </CashSessionContext.Provider>
  );
};
