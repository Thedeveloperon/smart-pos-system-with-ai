import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  closeCashSession,
  fetchCurrentCashSession,
  openCashSession,
} from "@/lib/api";
import type { CashSession, DenominationCount, UserRole } from "./types";

interface CashSessionContextValue {
  session: CashSession | null;
  isSessionActive: boolean;
  canSell: boolean;
  startSession: (counts: DenominationCount[], total: number, cashierName: string) => Promise<void>;
  resetSession: () => void;
  initiateClosing: () => void;
  completeClosing: (counts: DenominationCount[], total: number, reason?: string) => Promise<void>;
  cancelClosing: () => void;
  getExpectedCash: () => number;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  auditLog: CashSession["auditLog"];
  cashSalesTotal: number;
  refreshSession: () => Promise<void>;
}

const CashSessionContext = createContext<CashSessionContextValue | null>(null);

export const useCashSession = () => {
  const ctx = useContext(CashSessionContext);
  if (!ctx) throw new Error("useCashSession must be used within CashSessionProvider");
  return ctx;
};

export const CashSessionProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<CashSession | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("cashier");

  const refreshSession = useCallback(async () => {
    try {
      const current = await fetchCurrentCashSession();
      setSession(current);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load cash session.");
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const startSession = useCallback(
    async (counts: DenominationCount[], total: number, cashierName: string) => {
      try {
        const nextSession = await openCashSession(counts, total);
        setSession(nextSession);
        toast.success(`Shift started for ${cashierName}.`);
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to open cash session.");
      }
    },
    []
  );

  const resetSession = useCallback(() => {
    setSession(null);
  }, []);

  const initiateClosing = useCallback(() => {
    setSession((prev) => (prev ? { ...prev, status: "closing" } : prev));
  }, []);

  const cancelClosing = useCallback(() => {
    setSession((prev) => (prev && prev.status === "closing" ? { ...prev, status: "active" } : prev));
  }, []);

  const completeClosing = useCallback(
    async (counts: DenominationCount[], total: number, reason?: string) => {
      if (!session) {
        return;
      }

      try {
        const closedSession = await closeCashSession(session.id, counts, total, reason);
        setSession(closedSession);
        toast.success("Cash session closed.");
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to close cash session.");
      }
    },
    [session]
  );

  const getExpectedCash = useCallback(() => {
    if (!session) {
      return 0;
    }

    return session.opening.total + session.cashSalesTotal;
  }, [session]);

  const isSessionActive = session?.status === "active";
  const canSell = isSessionActive;

  return (
    <CashSessionContext.Provider
      value={{
        session,
        isSessionActive,
        canSell,
        startSession,
        resetSession,
        initiateClosing,
        completeClosing,
        cancelClosing,
        getExpectedCash,
        userRole,
        setUserRole,
        auditLog: session?.auditLog || [],
        cashSalesTotal: session?.cashSalesTotal || 0,
        refreshSession,
      }}
    >
      {children}
    </CashSessionContext.Provider>
  );
};
