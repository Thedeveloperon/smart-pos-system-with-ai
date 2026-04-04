import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  DollarSign,
  LifeBuoy,
  Layers3,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  ShoppingCart,
  FileDown,
  FileText,
  UserRound,
  Wallet,
} from "lucide-react";
import {
  adminActivateDevice,
  adminDeactivateDevice,
  adminExtendDeviceGrace,
  adminForceLicenseResync,
  adminMassRevokeDevices,
  adminReactivateDevice,
  adminRevokeDevice,
  adminTransferDeviceSeat,
  exportAdminLicenseAuditLogs,
  createAdminManualBillingInvoice,
  fetchAiPendingManualPayments,
  runAdminEmergencyAction,
  fetchAdminManualBillingDailyReconciliation,
  fetchAdminManualBillingInvoices,
  fetchAdminLicenseAuditLogs,
  fetchAdminLicensingShops,
  fetchAdminManualBillingPayments,
  runAdminBillingStateReconciliation,
  fetchDailySalesReport,
  fetchLowStockReport,
  fetchPaymentBreakdownReport,
  fetchSupportTriageReport,
  fetchTopItemsReport,
  fetchTransactionsReport,
  recordAdminManualBillingPayment,
  rejectAdminManualBillingPayment,
  type AiPendingManualPaymentItem,
  verifyAiManualPayment,
  verifyAdminManualBillingPayment,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type ManagerReportsDrawerProps = {
  open: boolean;
  onClose: () => void;
  refreshToken?: number;
  onRefundSale?: (saleId: string) => void;
  isSuperAdmin?: boolean;
};

type TransactionsItem = Awaited<ReturnType<typeof fetchTransactionsReport>>["items"][number];
type PaymentBreakdownItem = Awaited<ReturnType<typeof fetchPaymentBreakdownReport>>["items"][number];
type TopItem = Awaited<ReturnType<typeof fetchTopItemsReport>>["items"][number];
type LowStockItem = Awaited<ReturnType<typeof fetchLowStockReport>>["items"][number];
type SupportTriageData = Awaited<ReturnType<typeof fetchSupportTriageReport>>;
type AdminLicensingShopData = Awaited<ReturnType<typeof fetchAdminLicensingShops>>;
type AdminLicensingAuditData = Awaited<ReturnType<typeof fetchAdminLicenseAuditLogs>>;
type AdminManualBillingInvoicesData = Awaited<ReturnType<typeof fetchAdminManualBillingInvoices>>;
type AdminManualBillingPaymentsData = Awaited<ReturnType<typeof fetchAdminManualBillingPayments>>;
type AdminManualBillingReconciliationData = Awaited<ReturnType<typeof fetchAdminManualBillingDailyReconciliation>>;
type AdminBillingStateReconciliationData = Awaited<ReturnType<typeof runAdminBillingStateReconciliation>>;

type ReportData = {
  summary: Awaited<ReturnType<typeof fetchDailySalesReport>> | null;
  transactions: TransactionsItem[];
  payments: PaymentBreakdownItem[];
  topItems: TopItem[];
  lowStock: LowStockItem[];
  support: SupportTriageData | null;
  adminShops: AdminLicensingShopData | null;
  adminAudit: AdminLicensingAuditData | null;
  manualInvoices: AdminManualBillingInvoicesData | null;
  manualPayments: AdminManualBillingPaymentsData | null;
  manualReconciliation: AdminManualBillingReconciliationData | null;
  billingStateReconciliation: AdminBillingStateReconciliationData | null;
};

type PromptDialogConfig = {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
};

type PromptDialogState = PromptDialogConfig & {
  value: string;
  error: string | null;
};

type ConfirmDialogConfig = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmDialogState = ConfirmDialogConfig;

type ShareDialogState = {
  title: string;
  description?: string;
  activationKey?: string;
  successUrl?: string;
};

const marketingInvoiceMetadataPrefix = "MARKETING_REQUEST:";
const marketingPaymentSubmissionPrefix = "MARKETING_PAYMENT_SUBMISSION:";

const isMarketingBillingRecord = (notes?: string | null) => {
  const normalized = (notes || "").trim();
  if (!normalized) {
    return false;
  }

  return normalized.includes(marketingInvoiceMetadataPrefix) || normalized.includes(marketingPaymentSubmissionPrefix);
};

const money = (value: number) => `Rs. ${value.toLocaleString()}`;
const today = new Date();
const defaultFromDate = new Date(today);
defaultFromDate.setDate(today.getDate() - 6);

const formatDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const parseDateInput = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
};

const formatDate = (value: string) => {
  const parsed = parseDateInput(value);
  return parsed ? parsed.toLocaleDateString() : value;
};

const escapeCsvValue = (value: string | number | null | undefined) => {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
};

const escapeHtml = (value: string | number | null | undefined) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const downloadCsvFile = (filename: string, rows: string[][]) => {
  const blob = new Blob([rows.map((row) => row.map(escapeCsvValue).join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const downloadTextFile = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], {
    type: mimeType || "text/plain;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const openPrintableReport = (title: string, bodyHtml: string) => {
  const printWindow = window.open("", "_blank", "width=1100,height=900");
  if (!printWindow) {
    return;
  }

  printWindow.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          @page { size: A4; margin: 18mm; }
          body { font-family: Arial, sans-serif; color: #111827; margin: 0; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
          .title { font-size: 24px; font-weight: 700; margin: 0 0 4px; }
          .muted { color: #6b7280; font-size: 12px; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
          .card .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .08em; }
          .card .value { font-size: 18px; font-weight: 700; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th, td { border-bottom: 1px solid #e5e7eb; padding: 8px 6px; text-align: left; vertical-align: top; }
          th { font-size: 11px; text-transform: uppercase; color: #6b7280; }
          .section { margin-top: 18px; }
          .section h2 { font-size: 16px; margin: 0 0 8px; }
          .footer { margin-top: 18px; font-size: 11px; color: #6b7280; }
        </style>
      </head>
      <body>
        ${bodyHtml}
        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

const StatCard = ({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) => (
  <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="rounded-2xl bg-primary/10 p-3 text-primary">{icon}</div>
    </div>
  </div>
);

const BadgeTone = ({ method }: { method: string }) => {
  const normalizedMethod = method.trim().toLowerCase();
  const variant: "default" | "secondary" | "outline" =
    normalizedMethod === "cash" ? "default" : normalizedMethod === "card" ? "secondary" : "outline";
  return <Badge variant={variant} className="capitalize text-[10px]">{normalizedMethod.replaceAll("_", " ")}</Badge>;
};

const ManagerReportsDrawer = ({
  open,
  onClose,
  refreshToken = 0,
  onRefundSale,
  isSuperAdmin = false,
}: ManagerReportsDrawerProps) => {
  const [fromDate, setFromDate] = useState(formatDateInput(defaultFromDate));
  const [toDate, setToDate] = useState(formatDateInput(today));
  const [auditSearch, setAuditSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData>({
    summary: null,
    transactions: [],
    payments: [],
    topItems: [],
    lowStock: [],
    support: null,
    adminShops: null,
    adminAudit: null,
    manualInvoices: null,
    manualPayments: null,
    manualReconciliation: null,
    billingStateReconciliation: null,
  });
  const [promptState, setPromptState] = useState<PromptDialogState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);
  const [shareState, setShareState] = useState<ShareDialogState | null>(null);
  const [aiVerifyReference, setAiVerifyReference] = useState("");
  const [isVerifyingAiPayment, setIsVerifyingAiPayment] = useState(false);
  const [verifyingAiPaymentId, setVerifyingAiPaymentId] = useState<string | null>(null);
  const [pendingAiPayments, setPendingAiPayments] = useState<AiPendingManualPaymentItem[]>([]);
  const [loadingPendingAiPayments, setLoadingPendingAiPayments] = useState(false);
  const [supportSection, setSupportSection] = useState("overview");
  const [billingSection, setBillingSection] = useState("ledger");
  const promptResolveRef = useRef<((value: string | null) => void) | null>(null);
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  const openPromptDialog = useCallback((config: PromptDialogConfig) => {
    return new Promise<string | null>((resolve) => {
      promptResolveRef.current = resolve;
      setPromptState({
        ...config,
        value: config.defaultValue ?? "",
        error: null,
      });
    });
  }, []);

  const cancelPromptDialog = useCallback(() => {
    promptResolveRef.current?.(null);
    promptResolveRef.current = null;
    setPromptState(null);
  }, []);

  const submitPromptDialog = useCallback(() => {
    if (!promptState) {
      return;
    }

    const value = promptState.value.trim();
    if (promptState.required !== false && !value) {
      setPromptState((current) => (current ? { ...current, error: "This field is required." } : current));
      return;
    }

    const validationError = promptState.validate?.(value) || null;
    if (validationError) {
      setPromptState((current) => (current ? { ...current, error: validationError } : current));
      return;
    }

    promptResolveRef.current?.(value);
    promptResolveRef.current = null;
    setPromptState(null);
  }, [promptState]);

  const openConfirmDialog = useCallback((config: ConfirmDialogConfig) => {
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmState(config);
    });
  }, []);

  const cancelConfirmDialog = useCallback(() => {
    confirmResolveRef.current?.(false);
    confirmResolveRef.current = null;
    setConfirmState(null);
  }, []);

  const acceptConfirmDialog = useCallback(() => {
    confirmResolveRef.current?.(true);
    confirmResolveRef.current = null;
    setConfirmState(null);
  }, []);

  const copyTextToClipboard = useCallback(async (value: string, successMessage: string) => {
    if (!value) {
      return;
    }

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        toast.success(successMessage);
        return;
      } catch {
        // fallback below
      }
    }

    toast.info("Clipboard not available. Copy manually from the dialog.");
  }, []);

  useEffect(() => {
    return () => {
      promptResolveRef.current?.(null);
      confirmResolveRef.current?.(false);
      promptResolveRef.current = null;
      confirmResolveRef.current = null;
    };
  }, []);

  const loadPendingAiPayments = useCallback(
    async (quiet = false) => {
      if (!isSuperAdmin) {
        setPendingAiPayments([]);
        return;
      }

      setLoadingPendingAiPayments(true);
      try {
        const response = await fetchAiPendingManualPayments(80);
        setPendingAiPayments(response.items);
      } catch (error) {
        console.error(error);
        if (!quiet) {
          toast.error(error instanceof Error ? error.message : "Failed to load pending AI payment requests.");
        }
      } finally {
        setLoadingPendingAiPayments(false);
      }
    },
    [isSuperAdmin]
  );

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      let summary: Awaited<ReturnType<typeof fetchDailySalesReport>> | null = null;
      let transactions: TransactionsItem[] = [];
      let payments: PaymentBreakdownItem[] = [];
      let topItems: TopItem[] = [];
      let lowStock: LowStockItem[] = [];

      if (!isSuperAdmin) {
        const [summaryResponse, transactionsResponse, paymentsResponse, topItemsResponse, lowStockResponse] =
          await Promise.all([
            fetchDailySalesReport(fromDate, toDate),
            fetchTransactionsReport(fromDate, toDate, 50),
            fetchPaymentBreakdownReport(fromDate, toDate),
            fetchTopItemsReport(fromDate, toDate, 8),
            fetchLowStockReport(12, 5),
          ]);

        summary = summaryResponse;
        transactions = transactionsResponse.items;
        payments = paymentsResponse.items;
        topItems = topItemsResponse.items;
        lowStock = lowStockResponse.items;
      }

      let support: SupportTriageData | null = null;
      let adminShops: AdminLicensingShopData | null = null;
      let adminAudit: AdminLicensingAuditData | null = null;
      let manualInvoices: AdminManualBillingInvoicesData | null = null;
      let manualPayments: AdminManualBillingPaymentsData | null = null;
      let manualReconciliation: AdminManualBillingReconciliationData | null = null;

      if (isSuperAdmin) {
        [support, adminShops, adminAudit, manualInvoices, manualPayments, manualReconciliation] = await Promise.all([
          fetchSupportTriageReport(30),
          fetchAdminLicensingShops(),
          fetchAdminLicenseAuditLogs({ take: 50 }),
          fetchAdminManualBillingInvoices({ take: 30 }),
          fetchAdminManualBillingPayments({ take: 30 }),
          fetchAdminManualBillingDailyReconciliation({ date: toDate, currency: "LKR", take: 30 }),
        ]);
      }

      setReport((current) => ({
        summary,
        transactions,
        payments,
        topItems,
        lowStock,
        support,
        adminShops,
        adminAudit,
        manualInvoices,
        manualPayments,
        manualReconciliation,
        billingStateReconciliation: current.billingStateReconciliation,
      }));
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load reports.");
    } finally {
      setLoading(false);
    }
  }, [fromDate, isSuperAdmin, toDate]);

  const refreshSupportData = useCallback(() => {
    void loadReports();
    if (isSuperAdmin) {
      void loadPendingAiPayments(true);
    }
  }, [isSuperAdmin, loadPendingAiPayments, loadReports]);

  const handleVerifyAiPayment = useCallback(
    async (payload: { paymentId?: string; externalReference?: string }, clearReferenceInput = false) => {
      const paymentId = payload.paymentId?.trim();
      const externalReference = payload.externalReference?.trim();
      if (!paymentId && !externalReference) {
        toast.error("Payment ID or external reference is required.");
        return;
      }

      setIsVerifyingAiPayment(true);
      setVerifyingAiPaymentId(paymentId ?? "__by_reference__");
      try {
        const result = await verifyAiManualPayment({
          payment_id: paymentId,
          external_reference: externalReference,
        });
        await loadPendingAiPayments(true);
        toast.success(
          result.payment_status === "succeeded"
            ? "AI payment verified and credits added."
            : `AI payment status: ${result.payment_status.replaceAll("_", " ")}.`,
        );
        if (clearReferenceInput) {
          setAiVerifyReference("");
        }
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to verify AI payment.");
      } finally {
        setIsVerifyingAiPayment(false);
        setVerifyingAiPaymentId(null);
      }
    },
    [loadPendingAiPayments]
  );

  const handleVerifyAiPaymentByReference = useCallback(async () => {
    const rawReference = aiVerifyReference.trim();
    if (!rawReference) {
      toast.error("Enter a submitted or external reference.");
      return;
    }

    const normalizedReference = rawReference.toLowerCase();
    const findMatches = (items: AiPendingManualPaymentItem[]) =>
      items.filter((item) => {
        const externalReference = (item.external_reference || "").trim().toLowerCase();
        const submittedReference = (item.submitted_reference || "").trim().toLowerCase();
        return externalReference === normalizedReference || submittedReference === normalizedReference;
      });

    let matches = findMatches(pendingAiPayments);
    if (matches.length === 0) {
      try {
        const refreshed = await fetchAiPendingManualPayments(200);
        setPendingAiPayments(refreshed.items);
        matches = findMatches(refreshed.items);
      } catch {
        // Keep existing message path below.
      }
    }

    if (matches.length === 0) {
      toast.error("No pending payment matched this reference. Refresh and try again.");
      return;
    }

    if (matches.length > 1) {
      toast.error("Multiple pending payments share this reference. Verify from the exact row.");
      return;
    }

    const target = matches[0];
    await handleVerifyAiPayment(
      {
        paymentId: target.payment_id,
      },
      true
    );
  }, [aiVerifyReference, handleVerifyAiPayment, pendingAiPayments]);

  const handleSearchAuditLogs = useCallback(async () => {
    try {
      const adminAudit = await fetchAdminLicenseAuditLogs({
        search: auditSearch,
        take: 100,
      });

      setReport((current) => ({
        ...current,
        adminAudit,
      }));
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to search audit logs.");
    }
  }, [auditSearch]);

  const handleRevokeDevice = useCallback(
    async (deviceCode: string) => {
      const reason = await openPromptDialog({
        title: "Revoke Device",
        description: `Provide a reason for revoking ${deviceCode}.`,
        label: "Reason",
        placeholder: "policy_violation",
        confirmLabel: "Revoke",
      });
      if (!reason) {
        return;
      }

      try {
        await adminRevokeDevice(deviceCode, reason);
        toast.success(`Revoked ${deviceCode}`);
        await loadReports();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to revoke device.");
      }
    },
    [loadReports, openPromptDialog]
  );

  const handleReactivateDevice = useCallback(
    async (deviceCode: string) => {
      const reason = await openPromptDialog({
        title: "Reactivate Device",
        description: `Provide a reason for reactivating ${deviceCode}.`,
        label: "Reason",
        placeholder: "device_restored",
        confirmLabel: "Reactivate",
      });
      if (!reason) {
        return;
      }

      try {
        await adminReactivateDevice(deviceCode, reason);
        toast.success(`Reactivated ${deviceCode}`);
        await loadReports();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to reactivate device.");
      }
    },
    [loadReports, openPromptDialog]
  );

  const handleDeactivateDevice = useCallback(
    async (deviceCode: string) => {
      const reason = await openPromptDialog({
        title: "Deactivate Device",
        description: `Provide a reason for deactivating ${deviceCode}.`,
        label: "Reason",
        placeholder: "seat_recovery",
        confirmLabel: "Deactivate",
      });
      if (!reason) {
        return;
      }

      try {
        await adminDeactivateDevice(deviceCode, reason);
        toast.success(`Deactivated ${deviceCode}`);
        await loadReports();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to deactivate device.");
      }
    },
    [loadReports, openPromptDialog]
  );

  const handleActivateDevice = useCallback(
    async (deviceCode: string) => {
      const reason = await openPromptDialog({
        title: "Activate Device",
        description: `Provide a reason for activating ${deviceCode}.`,
        label: "Reason",
        placeholder: "manual_reactivation",
        confirmLabel: "Activate",
      });
      if (!reason) {
        return;
      }

      try {
        await adminActivateDevice(deviceCode, reason);
        toast.success(`Activated ${deviceCode}`);
        await loadReports();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to activate device.");
      }
    },
    [loadReports, openPromptDialog]
  );

  const handleTransferSeat = useCallback(
    async (deviceCode: string, currentShopCode: string) => {
      const fallbackTargetShopCode =
        report.adminShops?.items.find((shop) => shop.shop_code !== currentShopCode)?.shop_code || "default";
      const targetShopCode = await openPromptDialog({
        title: "Transfer Seat",
        description: `Enter target shop code for device ${deviceCode}.`,
        label: "Target shop code",
        defaultValue: fallbackTargetShopCode,
        confirmLabel: "Continue",
        validate: (value) => {
          if (value === currentShopCode) {
            return "Target shop must be different from current shop.";
          }

          return null;
        },
      });
      if (!targetShopCode) {
        return;
      }

      const reason = await openPromptDialog({
        title: "Transfer Seat",
        description: `Provide a reason for moving ${deviceCode} to ${targetShopCode}.`,
        label: "Reason",
        placeholder: "branch_reassignment",
        confirmLabel: "Transfer",
      });
      if (!reason) {
        return;
      }

      try {
        await adminTransferDeviceSeat(deviceCode, targetShopCode, reason, "support-ui");
        toast.success(`Transferred ${deviceCode} to ${targetShopCode}.`);
        await loadReports();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to transfer seat.");
      }
    },
    [loadReports, openPromptDialog, report.adminShops?.items]
  );

  const handleEmergencyAction = useCallback(
    async (
      deviceCode: string,
      action: "lock_device" | "revoke_token" | "force_reauth",
      label: string
    ) => {
      const actorNote = await openPromptDialog({
        title: label,
        description: `Provide a reason for ${label.toLowerCase()} on ${deviceCode}.`,
        label: "Reason",
        placeholder: "security_response",
        confirmLabel: label,
      });
      if (!actorNote) {
        return;
      }

      try {
        await runAdminEmergencyAction(deviceCode, action, actorNote, "security-ui");
        toast.success(`${label} executed for ${deviceCode}.`);
        await loadReports();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : `Failed to run ${label.toLowerCase()}.`);
      }
    },
    [loadReports, openPromptDialog]
  );

  const handleExtendGrace = useCallback(
    async (deviceCode: string) => {
      const reason = await openPromptDialog({
        title: "Extend Grace",
        description: `Provide a reason for extending grace on ${deviceCode}.`,
        label: "Reason",
        placeholder: "billing_delay",
        confirmLabel: "Continue",
      });
      if (!reason) {
        return;
      }

      const daysInput = await openPromptDialog({
        title: "Extend Grace",
        description: "Enter grace extension days (1-30).",
        label: "Days",
        defaultValue: "3",
        confirmLabel: "Continue",
        validate: (value) => {
          const parsed = Number(value);
          if (!Number.isFinite(parsed) || parsed < 1 || parsed > 30) {
            return "Grace extension days must be between 1 and 30.";
          }

          return null;
        },
      });
      if (!daysInput) {
        return;
      }

      const days = Number(daysInput);
      let stepUpApprovedBy: string | undefined;
      let stepUpApprovalNote: string | undefined;
      if (days >= 7) {
        stepUpApprovedBy = (await openPromptDialog({
          title: "Step-Up Approval Required",
          description: "Enter the approver username for this high-risk extension.",
          label: "Approver username",
          confirmLabel: "Continue",
        })) || undefined;
        if (!stepUpApprovedBy) {
          return;
        }

        stepUpApprovalNote = (await openPromptDialog({
          title: "Step-Up Approval Required",
          description: "Enter approval note from the step-up approver.",
          label: "Approval note",
          placeholder: "approved for billing exception",
          confirmLabel: "Submit",
        })) || undefined;
        if (!stepUpApprovalNote) {
          return;
        }
      }

      try {
        await adminExtendDeviceGrace(
          deviceCode,
          days,
          reason,
          "support-ui",
          "manual_extend_grace",
          stepUpApprovedBy,
          stepUpApprovalNote
        );
        toast.success(`Extended grace for ${deviceCode}`);
        await loadReports();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to extend grace.");
      }
    },
    [loadReports, openPromptDialog]
  );

  const handleMassRevoke = useCallback(async () => {
    const prefill = (report.adminShops?.items ?? [])
      .flatMap((shop) => shop.devices.filter((device) => device.device_status.toLowerCase() === "active"))
      .slice(0, 3)
      .map((device) => device.device_code)
      .join(",");
    const rawCodes = await openPromptDialog({
      title: "Mass Revoke Devices",
      description: "Enter one or more device codes separated by commas.",
      label: "Device codes",
      defaultValue: prefill,
      confirmLabel: "Continue",
      validate: (value) => {
        const codes = value
          .split(",")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
        return codes.length === 0 ? "At least one device code is required." : null;
      },
    });
    if (!rawCodes) {
      return;
    }

    const deviceCodes = rawCodes
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const actorNote = await openPromptDialog({
      title: "Mass Revoke Devices",
      description: "Provide a reason for this bulk revoke operation.",
      label: "Reason",
      placeholder: "suspected_multi_device_compromise",
      confirmLabel: "Continue",
    });
    if (!actorNote) {
      return;
    }

    const stepUpApprovedBy = await openPromptDialog({
      title: "Step-Up Approval Required",
      description: "Enter approver username.",
      label: "Approver username",
      confirmLabel: "Continue",
    });
    if (!stepUpApprovedBy) {
      return;
    }

    const stepUpApprovalNote = await openPromptDialog({
      title: "Step-Up Approval Required",
      description: "Enter approval note.",
      label: "Approval note",
      confirmLabel: "Mass Revoke",
    });
    if (!stepUpApprovalNote) {
      return;
    }

    try {
      const result = await adminMassRevokeDevices(
        deviceCodes,
        actorNote,
        "security-ui",
        "manual_mass_revoke",
        stepUpApprovedBy,
        stepUpApprovalNote
      );
      toast.success(`Mass revoke completed: ${result.revoked_count} revoked, ${result.already_revoked_count} already revoked.`);
      await loadReports();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to run mass revoke.");
    }
  }, [loadReports, openPromptDialog, report.adminShops?.items]);

  const handleResyncShop = useCallback(
    async (shopCode: string) => {
      const actorNote = await openPromptDialog({
        title: "Force License Resync",
        description: `Provide a reason for forcing resync on shop ${shopCode}.`,
        label: "Reason",
        placeholder: "manual_sync_after_billing_update",
        confirmLabel: "Resync",
      });
      if (!actorNote) {
        return;
      }

      try {
        await adminForceLicenseResync(shopCode, actorNote);
        toast.success(`Forced resync for ${shopCode}`);
        await loadReports();
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to force license resync.");
      }
    },
    [loadReports, openPromptDialog]
  );

  const handleExportAuditLogs = useCallback(async (format: "csv" | "json") => {
    try {
      const result = await exportAdminLicenseAuditLogs({
        search: auditSearch,
        take: 500,
        format,
      });
      downloadTextFile(result.filename, result.content, result.mimeType);
      toast.success(`Exported audit logs (${format.toUpperCase()}).`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to export audit logs.");
    }
  }, [auditSearch]);

  const handleCreateManualInvoice = useCallback(async () => {
    const suggestedShopCode = report.adminShops?.items[0]?.shop_code || "default";
    const shopCodeInput = await openPromptDialog({
      title: "Create Invoice",
      description: "Enter shop code for this invoice.",
      label: "Shop code",
      defaultValue: suggestedShopCode,
      confirmLabel: "Continue",
    });
    if (!shopCodeInput) {
      return;
    }

    const amountInput = await openPromptDialog({
      title: "Create Invoice",
      description: "Enter invoice amount due (LKR).",
      label: "Amount due",
      defaultValue: "5000",
      confirmLabel: "Continue",
      validate: (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return "Invoice amount must be greater than zero.";
        }

        return null;
      },
    });
    if (!amountInput) {
      return;
    }
    const amountDue = Number(amountInput);

    const dueDateInput = await openPromptDialog({
      title: "Create Invoice",
      description: "Enter due date in YYYY-MM-DD format.",
      label: "Due date",
      defaultValue: formatDateInput(new Date()),
      confirmLabel: "Continue",
      validate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : "Due date must be in YYYY-MM-DD format.",
    });
    if (!dueDateInput) {
      return;
    }

    const notes = await openPromptDialog({
      title: "Create Invoice",
      description: "Optional notes for this invoice.",
      label: "Notes (optional)",
      required: false,
      confirmLabel: "Continue",
    });
    if (notes === null) {
      return;
    }

    const actorNote = await openPromptDialog({
      title: "Create Invoice",
      description: "Actor note is required for audit.",
      label: "Actor note",
      confirmLabel: "Create Invoice",
    });
    if (!actorNote) {
      return;
    }

    try {
      await createAdminManualBillingInvoice({
        shop_code: shopCodeInput,
        amount_due: amountDue,
        currency: "LKR",
        due_at: `${dueDateInput}T00:00:00Z`,
        notes: notes || undefined,
        actor: "support-ui",
        reason_code: "manual_billing_invoice_created",
        actor_note: actorNote,
      });
      toast.success("Manual billing invoice created.");
      await loadReports();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to create invoice.");
    }
  }, [loadReports, openPromptDialog, report.adminShops]);

  const handleRecordManualPayment = useCallback(async (prefillInvoiceNumber?: string) => {
    const invoiceNumber = prefillInvoiceNumber?.trim() || await openPromptDialog({
      title: "Record Payment",
      description: "Enter invoice number (for example LIC-DEFAULT-...).",
      label: "Invoice number",
      confirmLabel: "Continue",
    });
    if (!invoiceNumber) {
      return;
    }

    const methodInput = await openPromptDialog({
      title: "Record Payment",
      description: "Method rules: cash requires reference. bank_deposit/bank_transfer require reference + deposit slip URL.",
      label: "Payment method",
      defaultValue: "bank_deposit",
      confirmLabel: "Continue",
      validate: (value) => {
        const normalized = value.toLowerCase();
        return normalized === "cash" || normalized === "bank_deposit" || normalized === "bank_transfer"
          ? null
          : "Method must be cash, bank_deposit, or bank_transfer.";
      },
    });
    if (!methodInput) {
      return;
    }

    const method = methodInput.toLowerCase() as "cash" | "bank_deposit" | "bank_transfer";

    const amountInput = await openPromptDialog({
      title: "Record Payment",
      description: "Enter received amount (LKR).",
      label: "Amount",
      defaultValue: "5000",
      confirmLabel: "Continue",
      validate: (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return "Payment amount must be greater than zero.";
        }

        return null;
      },
    });
    if (!amountInput) {
      return;
    }

    const amount = Number(amountInput);

    const bankReference = await openPromptDialog({
      title: "Record Payment",
      description: "Reference number is required for cash, bank_deposit, and bank_transfer.",
      label: "Reference number",
      confirmLabel: "Continue",
    });
    if (!bankReference) {
      return;
    }

    let depositSlipUrl: string | null = null;
    if (method !== "cash") {
      depositSlipUrl = await openPromptDialog({
        title: "Record Payment",
        description: "Deposit slip URL is required for bank_deposit and bank_transfer.",
        label: "Deposit slip URL",
        placeholder: "https://...",
        confirmLabel: "Continue",
        validate: (value) => {
          const normalized = value.trim();
          if (!normalized) {
            return "Deposit slip URL is required.";
          }

          try {
            const parsed = new URL(normalized);
            return parsed.protocol === "http:" || parsed.protocol === "https:"
              ? null
              : "Deposit slip URL must use http or https.";
          } catch {
            return "Deposit slip URL must be a valid absolute URL.";
          }
        },
      });
      if (!depositSlipUrl) {
        return;
      }
    }

    const notes = await openPromptDialog({
      title: "Record Payment",
      description: "Optional notes for this payment.",
      label: "Notes (optional)",
      required: false,
      confirmLabel: "Continue",
    });
    if (notes === null) {
      return;
    }

    const actorNote = await openPromptDialog({
      title: "Record Payment",
      description: "Actor note is required for audit.",
      label: "Actor note",
      confirmLabel: "Record Payment",
    });
    if (!actorNote) {
      return;
    }

    try {
      await recordAdminManualBillingPayment({
        invoice_number: invoiceNumber,
        method,
        amount,
        currency: "LKR",
        bank_reference: bankReference || undefined,
        deposit_slip_url: depositSlipUrl || undefined,
        notes: notes || undefined,
        actor: "support-ui",
        reason_code: "manual_payment_pending_verification",
        actor_note: actorNote,
      });
      toast.success("Payment recorded and pending verification.");
      await loadReports();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to record payment.");
    }
  }, [loadReports, openPromptDialog]);

  const handleVerifyManualPayment = useCallback(async (prefillPaymentId?: string) => {
    const paymentId = prefillPaymentId?.trim() || await openPromptDialog({
      title: "Verify Payment",
      description: "Enter payment ID to verify.",
      label: "Payment ID",
      confirmLabel: "Continue",
    });
    if (!paymentId) {
      return;
    }

    const actorNote = await openPromptDialog({
      title: "Verify Payment",
      description: "Actor note is required for verification.",
      label: "Actor note",
      confirmLabel: "Continue",
    });
    if (!actorNote) {
      return;
    }

    const extendDaysInput = await openPromptDialog({
      title: "Verify Payment",
      description: "Extend subscription by days (1-365).",
      label: "Extension days",
      defaultValue: "30",
      confirmLabel: "Continue",
      validate: (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 365) {
          return "Extension days must be between 1 and 365.";
        }

        return null;
      },
    });
    if (!extendDaysInput) {
      return;
    }

    const customerEmail = await openPromptDialog({
      title: "Verify Payment",
      description: "Optional customer email for access delivery.",
      label: "Customer email (optional)",
      required: false,
      confirmLabel: "Verify Payment",
    });
    if (customerEmail === null) {
      return;
    }

    const extendDays = Number(extendDaysInput);

    try {
      const verification = await verifyAdminManualBillingPayment(paymentId, {
        reason_code: "manual_payment_verified",
        actor_note: actorNote,
        reason: actorNote,
        extend_days: Math.round(extendDays),
        customer_email: customerEmail || undefined,
        actor: "billing-ui",
      });
      const issuedActivationKey = verification.activation_entitlement?.activation_entitlement_key?.trim() || "";
      const accessSuccessUrl = verification.access_delivery?.success_page_url?.trim() || "";
      const accessEmail = verification.access_delivery?.email_delivery;

      if (issuedActivationKey) {
        await copyTextToClipboard(issuedActivationKey, "Activation key copied.");
        toast.success("Payment verified. New activation key issued.");
      } else {
        toast.success("Payment verified and subscription updated.");
      }

      if (issuedActivationKey || accessSuccessUrl) {
        setShareState({
          title: "Customer Access Details",
          description: "Share these details with the customer for device activation.",
          activationKey: issuedActivationKey || undefined,
          successUrl: accessSuccessUrl || undefined,
        });
      }

      if (accessEmail?.status === "sent") {
        toast.success(
          accessEmail.recipient_email
            ? `Access email sent to ${accessEmail.recipient_email}.`
            : "Access email sent."
        );
      } else if (accessEmail?.status === "failed") {
        toast.warning(
          accessEmail.reason
            ? `Access email delivery failed: ${accessEmail.reason}`
            : "Access email delivery failed."
        );
      } else if (accessEmail?.status === "skipped" && accessEmail.reason === "no_recipient_email") {
        toast.info("Access email skipped: no recipient email configured.");
      }

      await loadReports();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to verify payment.");
    }
  }, [copyTextToClipboard, loadReports, openPromptDialog]);

  const handleRejectManualPayment = useCallback(async (prefillPaymentId?: string) => {
    const paymentId = prefillPaymentId?.trim() || await openPromptDialog({
      title: "Reject Payment",
      description: "Enter payment ID to reject.",
      label: "Payment ID",
      confirmLabel: "Continue",
    });
    if (!paymentId) {
      return;
    }

    const actorNote = await openPromptDialog({
      title: "Reject Payment",
      description: "Actor note is required for rejection.",
      label: "Actor note",
      confirmLabel: "Reject Payment",
    });
    if (!actorNote) {
      return;
    }

    try {
      await rejectAdminManualBillingPayment(paymentId, {
        reason_code: "manual_payment_rejected",
        actor_note: actorNote,
        reason: actorNote,
        actor: "billing-ui",
      });
      toast.success("Payment rejected.");
      await loadReports();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to reject payment.");
    }
  }, [loadReports, openPromptDialog]);

  const handleRunManualBillingReconciliation = useCallback(async () => {
    const reconciliationDate = await openPromptDialog({
      title: "Run Reconciliation",
      description: "Enter reconciliation date in YYYY-MM-DD format.",
      label: "Date",
      defaultValue: toDate,
      confirmLabel: "Continue",
      validate: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : "Date must be in YYYY-MM-DD format.",
    });
    if (!reconciliationDate) {
      return;
    }

    const expectedInput = await openPromptDialog({
      title: "Run Reconciliation",
      description: "Optional expected verified bank total (LKR).",
      label: "Expected total (optional)",
      required: false,
      defaultValue: "",
      confirmLabel: "Run",
      validate: (value) => {
        if (!value) {
          return null;
        }

        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0
          ? null
          : "Expected total must be a positive number.";
      },
    });
    if (expectedInput === null) {
      return;
    }

    let expectedTotal: number | undefined;
    if (expectedInput) {
      expectedTotal = Number(expectedInput);
    }

    try {
      const manualReconciliation = await fetchAdminManualBillingDailyReconciliation({
        date: reconciliationDate,
        currency: "LKR",
        expectedTotal,
        take: 30,
      });
      setReport((current) => ({
        ...current,
        manualReconciliation,
      }));

      if (manualReconciliation.has_mismatch) {
        toast.warning("Reconciliation completed with mismatches. Review alert causes.");
      } else {
        toast.success("Reconciliation completed with no mismatch.");
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to run reconciliation.");
    }
  }, [openPromptDialog, toDate]);

  const handleRunBillingStateReconciliation = useCallback(async () => {
    const applyUpdates = await openConfirmDialog({
      title: "Billing Drift Reconciliation",
      description: "Apply reconciliation updates now? Choose cancel for preview-only dry run.",
      confirmLabel: "Apply Updates",
      cancelLabel: "Preview Only",
    });
    const dryRun = !applyUpdates;

    const reason = await openPromptDialog({
      title: "Billing Drift Reconciliation",
      description: "Reason is required for audit.",
      label: "Reason",
      defaultValue: dryRun ? "preview webhook-miss drift" : "reconcile webhook-miss drift",
      confirmLabel: dryRun ? "Run Preview" : "Run Apply",
    });
    if (!reason) {
      return;
    }

    try {
      const result = await runAdminBillingStateReconciliation({
        dry_run: dryRun,
        reason,
        reason_code: "manual_admin_billing_reconciliation",
        actor_note: reason,
        actor: "billing-ui",
      });
      setReport((current) => ({
        ...current,
        billingStateReconciliation: result,
      }));

      if (dryRun) {
        toast.info(
          `Preview found ${result.drift_candidates} drift candidate(s) and ${result.webhook_failures_detected} failed webhook event(s).`
        );
      } else if (result.subscriptions_reconciled > 0) {
        toast.success(
          `Reconciled ${result.subscriptions_reconciled} subscription(s); ${result.webhook_failures_detected} webhook failure(s) detected.`
        );
      } else {
        toast.success("Billing drift reconciliation completed. No subscription updates were needed.");
      }

      await loadReports();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to run billing drift reconciliation.");
    }
  }, [loadReports, openConfirmDialog, openPromptDialog]);

  useEffect(() => {
    if (!open) {
      return;
    }

    void loadReports();
    if (isSuperAdmin) {
      void loadPendingAiPayments(true);
    }
  }, [isSuperAdmin, loadPendingAiPayments, open, loadReports, refreshToken]);

  const overview = useMemo(() => {
    const cashierMap = new Map<string, number>();
    for (const item of report.transactions) {
      const label = item.cashier_full_name || item.cashier_username || "Unknown";
      cashierMap.set(label, (cashierMap.get(label) || 0) + item.net_collected);
    }

    return Array.from(cashierMap.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4);
  }, [report.transactions]);

  const pendingMarketingPaymentsCount = useMemo(() => {
    return (report.manualPayments?.items ?? []).filter(
      (payment) => payment.status === "pending_verification" && isMarketingBillingRecord(payment.notes),
    ).length;
  }, [report.manualPayments?.items]);

  const handleExportSalesCsv = () => {
    if (report.transactions.length === 0) {
      toast.info("No sales data to export.");
      return;
    }

    downloadCsvFile(`sales-report-${fromDate}-to-${toDate}.csv`, [
      ["Manager Reports", ""],
      ["Range", `${fromDate} to ${toDate}`],
      ["Sales Count", report.summary?.sales_count ?? 0],
      ["Gross Sales", report.summary?.gross_sales_total ?? 0],
      ["Net Sales", report.summary?.net_sales_total ?? 0],
      [],
      ["Sale No", "Cashier", "Timestamp", "Status", "Items", "Grand Total", "Paid Total", "Net Collected"],
      ...report.transactions.map((sale) => [
        sale.sale_number,
        sale.cashier_full_name || sale.cashier_username || "Unknown",
        sale.timestamp,
        sale.status,
        sale.items_count,
        sale.grand_total,
        sale.paid_total,
        sale.net_collected,
      ]),
    ]);
  };

  const handleExportItemsCsv = () => {
    if (report.topItems.length === 0) {
      toast.info("No item data to export.");
      return;
    }

    downloadCsvFile(`items-report-${fromDate}-to-${toDate}.csv`, [
      ["Manager Reports", ""],
      ["Range", `${fromDate} to ${toDate}`],
      [],
      ["Item", "Sold Qty", "Refunded Qty", "Net Qty", "Net Sales"],
      ...report.topItems.map((item) => [
        item.product_name,
        item.sold_quantity,
        item.refunded_quantity,
        item.net_quantity,
        item.net_sales,
      ]),
    ]);
  };

  const handleExportStockCsv = () => {
    if (report.lowStock.length === 0) {
      toast.info("No stock alerts to export.");
      return;
    }

    downloadCsvFile(`stock-report-${fromDate}-to-${toDate}.csv`, [
      ["Manager Reports", ""],
      ["Range", `${fromDate} to ${toDate}`],
      [],
      ["Product", "SKU", "Barcode", "Qty On Hand", "Alert Level", "Deficit"],
      ...report.lowStock.map((item) => [
        item.product_name,
        item.sku || "-",
        item.barcode || "-",
        item.quantity_on_hand,
        item.alert_level,
        item.deficit,
      ]),
    ]);
  };

  const handleExportSalesPdf = () => {
    if (report.transactions.length === 0) {
      toast.info("No sales data to export.");
      return;
    }

    const rows = report.transactions
      .map(
        (sale) => `
          <tr>
            <td>${escapeHtml(sale.sale_number)}</td>
            <td>${escapeHtml(sale.cashier_full_name || sale.cashier_username || "Unknown")}</td>
            <td>${escapeHtml(new Date(sale.timestamp).toLocaleString())}</td>
            <td>${escapeHtml(sale.status)}</td>
            <td style="text-align:right">${escapeHtml(sale.items_count)}</td>
            <td style="text-align:right">${escapeHtml(money(sale.grand_total))}</td>
            <td style="text-align:right">${escapeHtml(money(sale.paid_total))}</td>
          </tr>
        `
      )
      .join("");

    openPrintableReport(
      "Sales Report",
      `
        <div class="header">
          <div>
            <h1 class="title">Sales Report</h1>
            <div class="muted">Range: ${escapeHtml(fromDate)} to ${escapeHtml(toDate)}</div>
          </div>
          <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
        <div class="grid">
          <div class="card"><div class="label">Sales Count</div><div class="value">${escapeHtml(report.summary?.sales_count ?? 0)}</div></div>
          <div class="card"><div class="label">Gross Sales</div><div class="value">${escapeHtml(money(report.summary?.gross_sales_total ?? 0))}</div></div>
          <div class="card"><div class="label">Net Sales</div><div class="value">${escapeHtml(money(report.summary?.net_sales_total ?? 0))}</div></div>
          <div class="card"><div class="label">Low Stock</div><div class="value">${escapeHtml(report.lowStock.length)}</div></div>
        </div>
        <div class="section">
          <h2>Transactions</h2>
          <table>
            <thead>
              <tr>
                <th>Bill</th>
                <th>Cashier</th>
                <th>Time</th>
                <th>Status</th>
                <th style="text-align:right">Items</th>
                <th style="text-align:right">Total</th>
                <th style="text-align:right">Paid</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="footer">Use the browser print dialog and choose Save as PDF.</div>
      `
    );
  };

  const handleExportItemsPdf = () => {
    if (report.topItems.length === 0) {
      toast.info("No item data to export.");
      return;
    }

    const rows = report.topItems
      .map(
        (item, index) => `
          <tr>
            <td>${escapeHtml(index + 1)}</td>
            <td>${escapeHtml(item.product_name)}</td>
            <td style="text-align:right">${escapeHtml(item.sold_quantity)}</td>
            <td style="text-align:right">${escapeHtml(item.refunded_quantity)}</td>
            <td style="text-align:right">${escapeHtml(item.net_quantity)}</td>
            <td style="text-align:right">${escapeHtml(money(item.net_sales))}</td>
          </tr>
        `
      )
      .join("");

    openPrintableReport(
      "Items Report",
      `
        <div class="header">
          <div>
            <h1 class="title">Items Report</h1>
            <div class="muted">Range: ${escapeHtml(fromDate)} to ${escapeHtml(toDate)}</div>
          </div>
          <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
        <div class="section">
          <h2>Top Items</h2>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th style="text-align:right">Sold Qty</th>
                <th style="text-align:right">Refunded Qty</th>
                <th style="text-align:right">Net Qty</th>
                <th style="text-align:right">Net Sales</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="footer">Use the browser print dialog and choose Save as PDF.</div>
      `
    );
  };

  const handleExportStockPdf = () => {
    if (report.lowStock.length === 0) {
      toast.info("No stock alerts to export.");
      return;
    }

    const rows = report.lowStock
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(item.sku || "-")}</td>
            <td>${escapeHtml(item.barcode || "-")}</td>
            <td style="text-align:right">${escapeHtml(item.quantity_on_hand)}</td>
            <td style="text-align:right">${escapeHtml(item.alert_level)}</td>
            <td style="text-align:right">${escapeHtml(item.deficit)}</td>
          </tr>
        `
      )
      .join("");

    openPrintableReport(
      "Stock Report",
      `
        <div class="header">
          <div>
            <h1 class="title">Stock Report</h1>
            <div class="muted">Range: ${escapeHtml(fromDate)} to ${escapeHtml(toDate)}</div>
          </div>
          <div class="muted">Generated ${escapeHtml(new Date().toLocaleString())}</div>
        </div>
        <div class="section">
          <h2>Low Stock Alerts</h2>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Barcode</th>
                <th style="text-align:right">Qty On Hand</th>
                <th style="text-align:right">Alert Level</th>
                <th style="text-align:right">Deficit</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div class="footer">Use the browser print dialog and choose Save as PDF.</div>
      `
    );
  };

  return (
    <>
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent
        side="right"
        className="inset-0 h-screen w-screen max-w-none rounded-none border-0 p-0 flex flex-col overflow-hidden sm:max-w-none sm:w-screen"
      >
        <div className="border-b border-border bg-pos-header px-6 py-5 text-pos-header-foreground shrink-0">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <SheetHeader className="space-y-2 text-left">
              <SheetTitle className="flex items-center gap-2 text-xl font-semibold">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {isSuperAdmin ? "License Manager" : "Manager Reports"}
              </SheetTitle>
              <SheetDescription className="text-pos-header-foreground/70">
                {isSuperAdmin
                  ? "Admin license controls, support operations, payment verification, and audit workflows."
                  : "Simple operational reports with cashier names, sales totals, payment mix, and stock alerts."}
              </SheetDescription>
            </SheetHeader>

            <Button
              variant="outline"
              onClick={onClose}
              className="border-border bg-background text-foreground hover:bg-muted lg:shrink-0"
            >
              Close
            </Button>
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-[420px]">
              <Input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="bg-background text-foreground"
              />
              <Input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="bg-background text-foreground"
              />
            </div>
            <Button onClick={refreshSupportData} disabled={loading || loadingPendingAiPayments} className="w-fit">
              <RefreshCw className={`h-4 w-4 ${loading || loadingPendingAiPayments ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-6 px-6 py-6">
            {!isSuperAdmin && (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={<CalendarDays className="h-5 w-5" />}
                  label="Sales Count"
                  value={String(report.summary?.sales_count ?? 0)}
                  hint={`${formatDate(fromDate)} to ${formatDate(toDate)}`}
                />
                <StatCard
                  icon={<DollarSign className="h-5 w-5" />}
                  label="Gross Sales"
                  value={money(report.summary?.gross_sales_total ?? 0)}
                  hint="Total before refunds"
                />
                <StatCard
                  icon={<Wallet className="h-5 w-5" />}
                  label="Net Sales"
                  value={money(report.summary?.net_sales_total ?? 0)}
                  hint="Sales minus refunds"
                />
                <StatCard
                  icon={<AlertTriangle className="h-5 w-5" />}
                  label="Low Stock"
                  value={String(report.lowStock.length)}
                  hint="Products at or below alert level"
                />
              </div>
            )}

            <Tabs defaultValue={isSuperAdmin ? "support" : "overview"} className="space-y-4">
              {!isSuperAdmin && (
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="sales">Sales</TabsTrigger>
                  <TabsTrigger value="items">Items</TabsTrigger>
                  <TabsTrigger value="stock">Stock</TabsTrigger>
                </TabsList>
              )}

              {!isSuperAdmin && (
                <>
              <TabsContent value="overview" className="space-y-4">
                <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
                  <div className="rounded-2xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold">Cashier Performance</p>
                    </div>
                    <div className="space-y-3 p-4">
                      {overview.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No sales recorded for this range.</p>
                      ) : (
                        overview.map(([name, total]) => (
                          <div key={name} className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <UserRound className="h-4 w-4" />
                              </div>
                              <div>
                                <p className="font-medium">{name}</p>
                                <p className="text-xs text-muted-foreground">Net collected</p>
                              </div>
                            </div>
                            <p className="font-semibold">{money(total)}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card shadow-sm">
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm font-semibold">Payment Mix</p>
                    </div>
                    <div className="space-y-3 p-4">
                      {report.payments.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No payment data available.</p>
                      ) : (
                        report.payments.map((item) => (
                          <div key={item.method} className="rounded-xl border border-border bg-background px-4 py-3">
                            <div className="flex items-center justify-between">
                              <BadgeTone method={item.method} />
                              <p className="font-semibold">{money(item.net_amount)}</p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Paid {money(item.paid_amount)} · Reversed {money(item.reversed_amount)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="sales" className="space-y-4">
                <div className="rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <ShoppingCart className="h-4 w-4 text-primary" />
                      Transactions
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportSalesCsv}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileDown className="h-4 w-4" />
                        Sales CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportSalesPdf}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileText className="h-4 w-4" />
                        Sales PDF
                      </Button>
                      <Badge variant="secondary">{report.transactions.length}</Badge>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                    <TableRow>
                      <TableHead>Bill</TableHead>
                      <TableHead>Cashier</TableHead>
                      <TableHead>Time</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                    <TableBody>
                    {loading ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                            Loading reports...
                          </TableCell>
                        </TableRow>
                      ) : report.transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                            No sales in this period.
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.transactions.map((sale) => (
                          <TableRow key={sale.sale_id}>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">{sale.sale_number}</p>
                                <div className="flex flex-wrap gap-1">
                                  <Badge variant="outline" className="text-[10px] capitalize">
                                    {sale.status}
                                  </Badge>
                                  {sale.payment_breakdown.map((payment) => (
                                    <BadgeTone key={`${sale.sale_id}-${payment.method}`} method={payment.method} />
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <p className="font-medium">
                                  {sale.cashier_full_name || sale.cashier_username || "Unknown"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {sale.cashier_username || "No username"}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(sale.timestamp).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {money(sale.grand_total)}
                              <p className="text-xs font-normal text-muted-foreground">
                                Paid {money(sale.paid_total)}
                              </p>
                            </TableCell>
                            <TableCell className="text-right">
                              {(sale.status === "completed" || sale.status === "refundedpartially") && onRefundSale ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onRefundSale(sale.sale_id)}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                  Refund
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Unavailable</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="items" className="space-y-4">
                <div className="rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Layers3 className="h-4 w-4 text-primary" />
                      Top Items
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportItemsCsv}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileDown className="h-4 w-4" />
                        Items CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportItemsPdf}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileText className="h-4 w-4" />
                        Items PDF
                      </Button>
                      <Badge variant="secondary">{report.topItems.length}</Badge>
                    </div>
                  </div>

                  <div className="divide-y divide-border">
                    {report.topItems.length === 0 ? (
                      <div className="p-6 text-center text-muted-foreground">No item movement in this range.</div>
                    ) : (
                      report.topItems.map((item, index) => (
                        <div key={item.product_id} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <span className="text-xs font-semibold">#{index + 1}</span>
                            </div>
                            <div>
                              <p className="font-medium">{item.product_name}</p>
                              <p className="text-xs text-muted-foreground">
                                Sold {item.sold_quantity} · Refunded {item.refunded_quantity}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">{money(item.net_sales)}</p>
                            <p className="text-xs text-muted-foreground">Net qty {item.net_quantity}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="stock" className="space-y-4">
                <div className="rounded-2xl border border-border bg-card shadow-sm">
                  <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Package className="h-4 w-4 text-primary" />
                      Low Stock Alerts
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportStockCsv}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileDown className="h-4 w-4" />
                        Stock CSV
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportStockPdf}
                        className="border-border bg-background text-foreground hover:bg-muted"
                      >
                        <FileText className="h-4 w-4" />
                        Stock PDF
                      </Button>
                      <Badge variant="secondary">{report.lowStock.length}</Badge>
                    </div>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>SKU / Barcode</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Alert</TableHead>
                        <TableHead className="text-right">Deficit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.lowStock.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                            No low-stock items right now.
                          </TableCell>
                        </TableRow>
                      ) : (
                        report.lowStock.map((item) => (
                          <TableRow key={item.product_id}>
                            <TableCell className="font-medium">{item.product_name}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {item.sku || "-"}
                              {item.barcode ? ` | ${item.barcode}` : ""}
                            </TableCell>
                            <TableCell className="text-right">{item.quantity_on_hand}</TableCell>
                            <TableCell className="text-right">{item.alert_level}</TableCell>
                            <TableCell className="text-right font-semibold text-destructive">
                              {item.deficit}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
                </>
              )}

              {isSuperAdmin && (
                <TabsContent value="support" className="space-y-4">
                  <Tabs value={supportSection} onValueChange={setSupportSection} className="space-y-4">
                    <div className="sticky top-0 z-20 -mx-6 border-y border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                      <TabsList className="grid w-full grid-cols-2 gap-2 lg:grid-cols-5">
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="devices">Devices</TabsTrigger>
                        <TabsTrigger value="aiPayments">AI Payments</TabsTrigger>
                        <TabsTrigger value="billing">Billing</TabsTrigger>
                        <TabsTrigger value="auditLogs">Audit Logs</TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="overview" className="mt-0 space-y-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                        <StatCard
                          icon={<LifeBuoy className="h-5 w-5" />}
                          label="Active Devices"
                          value={String(report.support?.devices.active_devices ?? 0)}
                          hint="Currently healthy devices"
                        />
                        <StatCard
                          icon={<AlertTriangle className="h-5 w-5" />}
                          label="Grace Devices"
                          value={String(report.support?.devices.grace_devices ?? 0)}
                          hint="Need billing attention soon"
                        />
                        <StatCard
                          icon={<ShieldCheck className="h-5 w-5" />}
                          label="Suspended Devices"
                          value={String(report.support?.devices.suspended_devices ?? 0)}
                          hint="Checkout/refund blocked"
                        />
                        <StatCard
                          icon={<Activity className="h-5 w-5" />}
                          label="Validation Failures"
                          value={String(report.support?.alerts.validation_failures_in_window ?? 0)}
                          hint={`Last ${report.support?.window_minutes ?? 30} minutes`}
                        />
                        <StatCard
                          icon={<ShieldAlert className="h-5 w-5" />}
                          label="Security Anomalies"
                          value={String(report.support?.alerts.security_anomalies_in_window ?? 0)}
                          hint="Cross-signal anomaly events"
                        />
                        <StatCard
                          icon={<ShieldX className="h-5 w-5" />}
                          label="Proof Failures"
                          value={String(report.support?.alerts.sensitive_action_proof_failures_in_window ?? 0)}
                          hint="Invalid device signatures"
                        />
                      </div>

                      <div className="grid gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-border bg-card shadow-sm">
                          <div className="border-b border-border px-4 py-3">
                            <p className="text-sm font-semibold">License Activity</p>
                          </div>
                          <div className="space-y-3 p-4 text-sm">
                            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                              <span>Activations</span>
                              <span className="font-semibold">{report.support?.activity.activations_in_window ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                              <span>Deactivations</span>
                              <span className="font-semibold">{report.support?.activity.deactivations_in_window ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                              <span>Heartbeats</span>
                              <span className="font-semibold">{report.support?.activity.heartbeats_in_window ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                              <span>Webhook failures</span>
                              <span className="font-semibold">{report.support?.alerts.webhook_failures_in_window ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                              <span>Impossible-travel signals</span>
                              <span className="font-semibold">{report.support?.alerts.auth_impossible_travel_signals_in_window ?? 0}</span>
                            </div>
                            <div className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                              <span>Concurrent-device signals</span>
                              <span className="font-semibold">{report.support?.alerts.auth_concurrent_device_signals_in_window ?? 0}</span>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl border border-border bg-card shadow-sm">
                          <div className="border-b border-border px-4 py-3">
                            <p className="text-sm font-semibold">Top Alert Causes</p>
                          </div>
                          <div className="space-y-3 p-4">
                            {(report.support?.alerts.top_validation_failures.length || 0) === 0 &&
                            (report.support?.alerts.top_webhook_failures.length || 0) === 0 &&
                            (report.support?.alerts.top_security_anomalies.length || 0) === 0 &&
                            (report.support?.alerts.top_sensitive_action_failure_sources.length || 0) === 0 ? (
                              <p className="text-sm text-muted-foreground">No alert spikes in the current window.</p>
                            ) : (
                              <>
                                {(report.support?.alerts.top_validation_failures ?? []).map((item) => (
                                  <div key={`validation-${item.reason}`} className="rounded-xl border border-border bg-background px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Validation</p>
                                    <div className="mt-1 flex items-center justify-between gap-3">
                                      <p className="truncate text-sm font-medium">{item.reason}</p>
                                      <Badge variant="secondary">{item.count}</Badge>
                                    </div>
                                  </div>
                                ))}

                                {(report.support?.alerts.top_webhook_failures ?? []).map((item) => (
                                  <div key={`webhook-${item.reason}`} className="rounded-xl border border-border bg-background px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Webhook</p>
                                    <div className="mt-1 flex items-center justify-between gap-3">
                                      <p className="truncate text-sm font-medium">{item.reason}</p>
                                      <Badge variant="secondary">{item.count}</Badge>
                                    </div>
                                  </div>
                                ))}

                                {(report.support?.alerts.top_security_anomalies ?? []).map((item) => (
                                  <div key={`security-${item.reason}`} className="rounded-xl border border-border bg-background px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Security</p>
                                    <div className="mt-1 flex items-center justify-between gap-3">
                                      <p className="truncate text-sm font-medium">{item.reason}</p>
                                      <Badge variant="secondary">{item.count}</Badge>
                                    </div>
                                  </div>
                                ))}

                                {(report.support?.alerts.top_sensitive_action_failure_sources ?? []).map((item) => (
                                  <div key={`proof-source-${item.reason}`} className="rounded-xl border border-border bg-background px-4 py-3">
                                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Proof Source</p>
                                    <div className="mt-1 flex items-center justify-between gap-3">
                                      <p className="truncate text-sm font-medium">{item.reason}</p>
                                      <Badge variant="secondary">{item.count}</Badge>
                                    </div>
                                  </div>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-border bg-card shadow-sm">
                        <div className="border-b border-border px-4 py-3">
                          <p className="text-sm font-semibold">Recent Licensing Audit Events</p>
                        </div>
                        <div className="max-h-[56vh] overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Actor</TableHead>
                                <TableHead>Device</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Reason</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(report.support?.recent_audit_events.length ?? 0) === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                    No recent audit events.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                (report.support?.recent_audit_events ?? []).map((event, index) => (
                                  <TableRow key={`${event.timestamp}-${event.action}-${index}`}>
                                    <TableCell className="text-muted-foreground">
                                      {new Date(event.timestamp).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="font-medium">{event.action}</TableCell>
                                    <TableCell>{event.actor}</TableCell>
                                    <TableCell>{event.device_code || "-"}</TableCell>
                                    <TableCell className="text-muted-foreground">
                                      {event.source_user_agent_family || "unknown"} | {event.source_ip_prefix || event.source_ip || "-"}
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{event.reason || "-"}</TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="devices" className="mt-0 space-y-4">
                      <div className="rounded-2xl border border-border bg-card shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                          <p className="text-sm font-semibold">Super Admin Device Controls</p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void handleMassRevoke();
                              }}
                            >
                              Mass Revoke
                            </Button>
                            {(report.adminShops?.items ?? []).slice(0, 4).map((shop) => (
                              <Button
                                key={shop.shop_id}
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  void handleResyncShop(shop.shop_code);
                                }}
                              >
                                Resync {shop.shop_code}
                              </Button>
                            ))}
                          </div>
                        </div>
                        <div className="max-h-[62vh] overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Shop</TableHead>
                                <TableHead>Device</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>License</TableHead>
                                <TableHead>Activation Key</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(report.adminShops?.items ?? []).flatMap((shop) =>
                                shop.devices.map((device) => ({
                                  shopCode: shop.shop_code,
                                  latestActivationEntitlement: shop.latest_activation_entitlement,
                                  device,
                                }))
                              ).length === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                                    No admin device seats found.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                (report.adminShops?.items ?? [])
                                  .flatMap((shop) =>
                                    shop.devices.map((device) => ({
                                      shopCode: shop.shop_code,
                                      latestActivationEntitlement: shop.latest_activation_entitlement,
                                      device,
                                    }))
                                  )
                                  .slice(0, 24)
                                  .map((row) => (
                                    <TableRow key={`${row.shopCode}-${row.device.provisioned_device_id}`}>
                                      <TableCell className="font-medium">{row.shopCode}</TableCell>
                                      <TableCell>
                                        <div className="space-y-1">
                                          <p className="font-medium">{row.device.device_name}</p>
                                          <p className="text-xs text-muted-foreground">{row.device.device_code}</p>
                                        </div>
                                      </TableCell>
                                      <TableCell className="capitalize">{row.device.device_status}</TableCell>
                                      <TableCell className="capitalize">{row.device.license_state}</TableCell>
                                      <TableCell>
                                        {row.latestActivationEntitlement?.activation_entitlement_key ? (
                                          <div className="space-y-1">
                                            <p className="max-w-[20rem] break-all font-mono text-[11px]">
                                              {row.latestActivationEntitlement.activation_entitlement_key}
                                            </p>
                                            <div className="flex items-center gap-2">
                                              <Badge variant="outline" className="capitalize text-[10px]">
                                                {row.latestActivationEntitlement.status}
                                              </Badge>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void copyTextToClipboard(
                                                    row.latestActivationEntitlement?.activation_entitlement_key || "",
                                                    "Activation key copied."
                                                  );
                                                }}
                                              >
                                                Copy
                                              </Button>
                                            </div>
                                          </div>
                                        ) : (
                                          <span className="text-xs text-muted-foreground">Not issued</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          {row.device.device_status.toLowerCase() === "active" ? (
                                            <>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void handleDeactivateDevice(row.device.device_code);
                                                }}
                                              >
                                                Deactivate
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void handleRevokeDevice(row.device.device_code);
                                                }}
                                              >
                                                Revoke
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void handleTransferSeat(row.device.device_code, row.shopCode);
                                                }}
                                              >
                                                Transfer Seat
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void handleExtendGrace(row.device.device_code);
                                                }}
                                              >
                                                Extend Grace
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void handleEmergencyAction(row.device.device_code, "lock_device", "Lock Device");
                                                }}
                                              >
                                                Lock
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void handleEmergencyAction(row.device.device_code, "revoke_token", "Revoke Token");
                                                }}
                                              >
                                                Revoke Token
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void handleEmergencyAction(row.device.device_code, "force_reauth", "Force Re-Auth");
                                                }}
                                              >
                                                Force Re-Auth
                                              </Button>
                                            </>
                                          ) : (
                                            <>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void handleActivateDevice(row.device.device_code);
                                                }}
                                              >
                                                Activate
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                  void handleReactivateDevice(row.device.device_code);
                                                }}
                                              >
                                                Reactivate
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="aiPayments" className="mt-0 space-y-4">
                      <div className="rounded-2xl border border-border bg-card shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold">AI Credit Purchasing Requests</p>
                            <p className="text-xs text-muted-foreground">
                              Pending manual AI payments (`cash` / `bank_deposit`) with submitted reference details.
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void loadPendingAiPayments();
                            }}
                            disabled={loadingPendingAiPayments}
                          >
                            Refresh Requests
                          </Button>
                        </div>

                        <div className="space-y-3 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Input
                              value={aiVerifyReference}
                              onChange={(event) => setAiVerifyReference(event.target.value)}
                              placeholder="Submitted ref or aicpay_... external ref"
                              className="sm:flex-1"
                            />
                            <Button
                              onClick={() => {
                                void handleVerifyAiPaymentByReference();
                              }}
                              disabled={isVerifyingAiPayment}
                            >
                              {isVerifyingAiPayment ? "Verifying..." : "Verify by Reference"}
                            </Button>
                          </div>

                          {loadingPendingAiPayments ? (
                            <p className="text-sm text-muted-foreground">Loading pending AI credit requests...</p>
                          ) : pendingAiPayments.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No pending AI credit purchase requests.</p>
                          ) : (
                            <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
                              {pendingAiPayments.slice(0, 20).map((item) => (
                                <div key={item.payment_id} className="rounded-md border border-border/70 bg-muted/20 p-3">
                                  <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <span className="font-semibold text-foreground">{item.payment_status.replaceAll("_", " ")}</span>
                                    <BadgeTone method={item.payment_method} />
                                    <span className="text-muted-foreground">{new Date(item.created_at).toLocaleString()}</span>
                                    <span className="ml-auto text-muted-foreground">
                                      {item.credits.toFixed(0)} credits ({item.currency} {item.amount.toFixed(2)})
                                    </span>
                                  </div>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    User: {item.target_full_name || item.target_username}
                                    {item.target_full_name ? ` (${item.target_username})` : ""}
                                    {item.shop_name ? ` • Shop: ${item.shop_name}` : ""}
                                  </p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    Submitted Ref: {item.submitted_reference || "-"} • External Ref: {item.external_reference}
                                  </p>
                                  <div className="mt-2 flex justify-end">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        void handleVerifyAiPayment({
                                          paymentId: item.payment_id,
                                          externalReference: item.external_reference,
                                        })
                                      }
                                      disabled={isVerifyingAiPayment && verifyingAiPaymentId === item.payment_id}
                                    >
                                      {isVerifyingAiPayment && verifyingAiPaymentId === item.payment_id ? "Verifying..." : "Verify"}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="billing" className="mt-0 space-y-4">
                      <div className="rounded-2xl border border-border bg-card shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                          <p className="text-sm font-semibold">Manual Billing (Cash / Bank Deposit)</p>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void handleCreateManualInvoice();
                              }}
                            >
                              Create Invoice
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void handleRecordManualPayment();
                              }}
                            >
                              Record Payment
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void loadReports();
                              }}
                            >
                              Refresh Billing
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void handleRunManualBillingReconciliation();
                              }}
                            >
                              Run Reconciliation
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void handleRunBillingStateReconciliation();
                              }}
                            >
                              Run Drift Check
                            </Button>
                          </div>
                        </div>

                        <div className="p-4">
                          <Tabs value={billingSection} onValueChange={setBillingSection} className="space-y-4">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="ledger">Ledger</TabsTrigger>
                              <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
                            </TabsList>

                            <TabsContent value="ledger" className="mt-0 space-y-4">
                              <div className="grid gap-4 xl:grid-cols-2">
                                <div className="rounded-xl border border-border bg-background">
                                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                      Recent Invoices
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary">{report.manualInvoices?.count ?? 0}</Badge>
                                      {((report.manualInvoices?.items ?? []).filter((invoice) => isMarketingBillingRecord(invoice.notes)).length > 0) && (
                                        <Badge variant="outline">
                                          Marketing {(report.manualInvoices?.items ?? []).filter((invoice) => isMarketingBillingRecord(invoice.notes)).length}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="max-h-[52vh] overflow-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Invoice</TableHead>
                                          <TableHead>Shop</TableHead>
                                          <TableHead className="text-right">Due</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {(report.manualInvoices?.items.length ?? 0) === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                              No manual billing invoices yet.
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          (report.manualInvoices?.items ?? []).slice(0, 12).map((invoice) => (
                                            <TableRow key={invoice.invoice_id}>
                                              <TableCell>
                                                <div className="space-y-1">
                                                  <p className="font-medium">{invoice.invoice_number}</p>
                                                  <p className="text-xs text-muted-foreground">
                                                    Due {new Date(invoice.due_at).toLocaleDateString()}
                                                  </p>
                                                  {isMarketingBillingRecord(invoice.notes) && (
                                                    <Badge variant="outline" className="text-[10px]">
                                                      Marketing
                                                    </Badge>
                                                  )}
                                                </div>
                                              </TableCell>
                                              <TableCell>{invoice.shop_code}</TableCell>
                                              <TableCell className="text-right font-semibold">
                                                {money(invoice.amount_due)}
                                              </TableCell>
                                              <TableCell className="capitalize">{invoice.status.replaceAll("_", " ")}</TableCell>
                                              <TableCell className="text-right">
                                                <Button
                                                  variant="outline"
                                                  size="sm"
                                                  onClick={() => {
                                                    void handleRecordManualPayment(invoice.invoice_number);
                                                  }}
                                                >
                                                  Record
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          ))
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>

                                <div className="rounded-xl border border-border bg-background">
                                  <div className="flex items-center justify-between border-b border-border px-3 py-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                      Recent Payments
                                    </p>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary">{report.manualPayments?.count ?? 0}</Badge>
                                      {pendingMarketingPaymentsCount > 0 && (
                                        <Badge variant="outline">Pending Marketing {pendingMarketingPaymentsCount}</Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="max-h-[52vh] overflow-auto">
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead>Payment</TableHead>
                                          <TableHead>Invoice</TableHead>
                                          <TableHead className="text-right">Amount</TableHead>
                                          <TableHead>Status</TableHead>
                                          <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {(report.manualPayments?.items.length ?? 0) === 0 ? (
                                          <TableRow>
                                            <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                              No manual payments recorded.
                                            </TableCell>
                                          </TableRow>
                                        ) : (
                                          (report.manualPayments?.items ?? []).slice(0, 12).map((payment) => (
                                            <TableRow key={payment.payment_id}>
                                              <TableCell className="font-medium">{payment.payment_id.slice(0, 8)}</TableCell>
                                              <TableCell>
                                                <div className="space-y-1">
                                                  <p className="font-medium">{payment.invoice_number}</p>
                                                  <p className="text-xs text-muted-foreground">{payment.method.replaceAll("_", " ")}</p>
                                                  {isMarketingBillingRecord(payment.notes) && (
                                                    <Badge variant="outline" className="text-[10px]">
                                                      Marketing
                                                    </Badge>
                                                  )}
                                                </div>
                                              </TableCell>
                                              <TableCell className="text-right font-semibold">{money(payment.amount)}</TableCell>
                                              <TableCell className="capitalize">{payment.status.replaceAll("_", " ")}</TableCell>
                                              <TableCell className="text-right">
                                                {payment.status === "pending_verification" ? (
                                                  <div className="flex justify-end gap-2">
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      onClick={() => {
                                                        void handleVerifyManualPayment(payment.payment_id);
                                                      }}
                                                    >
                                                      Verify
                                                    </Button>
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      onClick={() => {
                                                        void handleRejectManualPayment(payment.payment_id);
                                                      }}
                                                    >
                                                      Reject
                                                    </Button>
                                                  </div>
                                                ) : (
                                                  <span className="text-xs text-muted-foreground">Processed</span>
                                                )}
                                              </TableCell>
                                            </TableRow>
                                          ))
                                        )}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </div>
                              </div>
                            </TabsContent>

                            <TabsContent value="reconciliation" className="mt-0 space-y-4">
                              <div className="rounded-xl border border-border bg-background">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                    Daily Bank Reconciliation
                                  </p>
                                  {report.manualReconciliation ? (
                                    <Badge variant={report.manualReconciliation.has_mismatch ? "destructive" : "secondary"}>
                                      {report.manualReconciliation.has_mismatch ? "Mismatch Detected" : "Balanced"}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">Not Run</Badge>
                                  )}
                                </div>

                                {report.manualReconciliation ? (
                                  <div className="space-y-4 p-3">
                                    <div className="grid gap-3 md:grid-cols-4">
                                      <div className="rounded-lg border border-border p-3">
                                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Verified Total</p>
                                        <p className="text-base font-semibold">{money(report.manualReconciliation.verified_bank_total)}</p>
                                      </div>
                                      <div className="rounded-lg border border-border p-3">
                                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Pending Total</p>
                                        <p className="text-base font-semibold">{money(report.manualReconciliation.pending_bank_total)}</p>
                                      </div>
                                      <div className="rounded-lg border border-border p-3">
                                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Expected Total</p>
                                        <p className="text-base font-semibold">
                                          {typeof report.manualReconciliation.expected_bank_total === "number"
                                            ? money(report.manualReconciliation.expected_bank_total)
                                            : "Not provided"}
                                        </p>
                                      </div>
                                      <div className="rounded-lg border border-border p-3">
                                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Mismatch Amount</p>
                                        <p className="text-base font-semibold">
                                          {typeof report.manualReconciliation.mismatch_amount === "number"
                                            ? money(report.manualReconciliation.mismatch_amount)
                                            : "-"}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="grid gap-3 xl:grid-cols-2">
                                      <div className="rounded-lg border border-border">
                                        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                          Alert Causes ({report.manualReconciliation.alert_count})
                                        </div>
                                        <div className="max-h-[42vh] overflow-auto">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Code</TableHead>
                                                <TableHead>Severity</TableHead>
                                                <TableHead className="text-right">Count</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {report.manualReconciliation.alerts.length === 0 ? (
                                                <TableRow>
                                                  <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                                                    No reconciliation alerts.
                                                  </TableCell>
                                                </TableRow>
                                              ) : (
                                                report.manualReconciliation.alerts.map((alert) => (
                                                  <TableRow key={`${alert.code}-${alert.severity}`}>
                                                    <TableCell className="font-medium">{alert.code}</TableCell>
                                                    <TableCell className="capitalize">{alert.severity}</TableCell>
                                                    <TableCell className="text-right">{alert.count}</TableCell>
                                                  </TableRow>
                                                ))
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>

                                      <div className="rounded-lg border border-border">
                                        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                          Latest Bank Entries
                                        </div>
                                        <div className="max-h-[42vh] overflow-auto">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Invoice</TableHead>
                                                <TableHead>Method</TableHead>
                                                <TableHead className="text-right">Amount</TableHead>
                                                <TableHead>Status</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {report.manualReconciliation.items.length === 0 ? (
                                                <TableRow>
                                                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                                                    No bank entries for this date.
                                                  </TableCell>
                                                </TableRow>
                                              ) : (
                                                report.manualReconciliation.items.slice(0, 8).map((item) => (
                                                  <TableRow key={item.payment_id}>
                                                    <TableCell className="font-medium">{item.invoice_number}</TableCell>
                                                    <TableCell className="capitalize">{item.method.replaceAll("_", " ")}</TableCell>
                                                    <TableCell className="text-right">{money(item.amount)}</TableCell>
                                                    <TableCell className="capitalize">{item.status.replaceAll("_", " ")}</TableCell>
                                                  </TableRow>
                                                ))
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="px-3 py-6 text-sm text-muted-foreground">
                                    Run daily reconciliation to compare bank totals and detect duplicate/missing references.
                                  </div>
                                )}
                              </div>

                              <div className="rounded-xl border border-border bg-background">
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-2">
                                  <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                    Webhook Drift Reconciliation
                                  </p>
                                  {report.billingStateReconciliation ? (
                                    <Badge
                                      variant={
                                        report.billingStateReconciliation.drift_candidates > 0 ||
                                        report.billingStateReconciliation.webhook_failures_detected > 0
                                          ? "destructive"
                                          : "secondary"
                                      }
                                    >
                                      {report.billingStateReconciliation.dry_run ? "Preview" : "Applied"}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">Not Run</Badge>
                                  )}
                                </div>

                                {report.billingStateReconciliation ? (
                                  <div className="space-y-4 p-3">
                                    <div className="grid gap-3 md:grid-cols-4">
                                      <div className="rounded-lg border border-border p-3">
                                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Subscriptions Scanned</p>
                                        <p className="text-base font-semibold">{report.billingStateReconciliation.billing_subscriptions_scanned}</p>
                                      </div>
                                      <div className="rounded-lg border border-border p-3">
                                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Drift Candidates</p>
                                        <p className="text-base font-semibold">{report.billingStateReconciliation.drift_candidates}</p>
                                      </div>
                                      <div className="rounded-lg border border-border p-3">
                                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Reconciled</p>
                                        <p className="text-base font-semibold">{report.billingStateReconciliation.subscriptions_reconciled}</p>
                                      </div>
                                      <div className="rounded-lg border border-border p-3">
                                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Webhook Failures</p>
                                        <p className="text-base font-semibold">{report.billingStateReconciliation.webhook_failures_detected}</p>
                                      </div>
                                    </div>

                                    <div className="grid gap-3 xl:grid-cols-2">
                                      <div className="rounded-lg border border-border">
                                        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                          Subscription Updates
                                        </div>
                                        <div className="max-h-[42vh] overflow-auto">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Shop</TableHead>
                                                <TableHead>Previous</TableHead>
                                                <TableHead>Current</TableHead>
                                                <TableHead>Applied</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {report.billingStateReconciliation.subscription_updates.length === 0 ? (
                                                <TableRow>
                                                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                                                    No drift candidates.
                                                  </TableCell>
                                                </TableRow>
                                              ) : (
                                                report.billingStateReconciliation.subscription_updates.slice(0, 8).map((item) => (
                                                  <TableRow key={`${item.shop_id}-${item.subscription_id || item.customer_id || item.period_end}`}>
                                                    <TableCell className="font-medium">{item.shop_code}</TableCell>
                                                    <TableCell className="capitalize">{item.previous_status.replaceAll("_", " ")}</TableCell>
                                                    <TableCell className="capitalize">{item.reconciled_status.replaceAll("_", " ")}</TableCell>
                                                    <TableCell>{item.applied ? "Yes" : "No"}</TableCell>
                                                  </TableRow>
                                                ))
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>

                                      <div className="rounded-lg border border-border">
                                        <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                          Failed Webhook Events
                                        </div>
                                        <div className="max-h-[42vh] overflow-auto">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead>Event</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Shop</TableHead>
                                                <TableHead>Error</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {report.billingStateReconciliation.failed_webhook_events.length === 0 ? (
                                                <TableRow>
                                                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                                                    No failed webhook events in lookback window.
                                                  </TableCell>
                                                </TableRow>
                                              ) : (
                                                report.billingStateReconciliation.failed_webhook_events.slice(0, 8).map((item) => (
                                                  <TableRow key={item.event_id}>
                                                    <TableCell className="font-medium">{item.event_id.slice(0, 12)}</TableCell>
                                                    <TableCell>{item.event_type}</TableCell>
                                                    <TableCell>{item.shop_code || "-"}</TableCell>
                                                    <TableCell className="text-muted-foreground">{item.last_error_code || "-"}</TableCell>
                                                  </TableRow>
                                                ))
                                              )}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="px-3 py-6 text-sm text-muted-foreground">
                                    Run drift check to reconcile expired billing periods when webhook events are missed.
                                  </div>
                                )}
                              </div>
                            </TabsContent>
                          </Tabs>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="auditLogs" className="mt-0 space-y-4">
                      <div className="rounded-2xl border border-border bg-card shadow-sm">
                        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
                          <p className="text-sm font-semibold">Searchable Audit Logs</p>
                          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
                            <Input
                              value={auditSearch}
                              onChange={(event) => setAuditSearch(event.target.value)}
                              placeholder="Search action, actor, reason, metadata"
                              className="md:w-80"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void handleExportAuditLogs("csv");
                              }}
                            >
                              Export CSV
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void handleExportAuditLogs("json");
                              }}
                            >
                              Export JSON
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                void handleSearchAuditLogs();
                              }}
                            >
                              Search
                            </Button>
                          </div>
                        </div>
                        <div className="max-h-[62vh] overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Time</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Actor</TableHead>
                                <TableHead>Manual</TableHead>
                                <TableHead>Reason</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(report.adminAudit?.items.length ?? 0) === 0 ? (
                                <TableRow>
                                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                                    No audit logs matched this search.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                (report.adminAudit?.items ?? []).map((event) => (
                                  <TableRow key={event.id}>
                                    <TableCell className="text-muted-foreground">
                                      {new Date(event.timestamp).toLocaleString()}
                                    </TableCell>
                                    <TableCell className="font-medium">{event.action}</TableCell>
                                    <TableCell>{event.actor}</TableCell>
                                    <TableCell>{event.is_manual_override ? "Yes" : "No"}</TableCell>
                                    <TableCell className="text-muted-foreground">{event.reason || "-"}</TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>

    <Dialog
      open={Boolean(promptState)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          cancelPromptDialog();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{promptState?.title || "Input Required"}</DialogTitle>
          {promptState?.description && (
            <DialogDescription>{promptState.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="manager-report-prompt-input">{promptState?.label || "Value"}</Label>
          <Input
            id="manager-report-prompt-input"
            value={promptState?.value || ""}
            placeholder={promptState?.placeholder}
            autoFocus
            onChange={(event) => {
              setPromptState((current) => (
                current
                  ? {
                      ...current,
                      value: event.target.value,
                      error: null,
                    }
                  : current
              ));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submitPromptDialog();
              }
            }}
          />
          {promptState?.error && (
            <p className="text-sm text-destructive">{promptState.error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={cancelPromptDialog}>
            {promptState?.cancelLabel || "Cancel"}
          </Button>
          <Button onClick={submitPromptDialog}>
            {promptState?.confirmLabel || "Submit"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog
      open={Boolean(confirmState)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          cancelConfirmDialog();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmState?.title || "Confirm Action"}</AlertDialogTitle>
          {confirmState?.description && (
            <AlertDialogDescription>{confirmState.description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={cancelConfirmDialog}>
            {confirmState?.cancelLabel || "Cancel"}
          </AlertDialogCancel>
          <AlertDialogAction onClick={acceptConfirmDialog}>
            {confirmState?.confirmLabel || "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <Dialog
      open={Boolean(shareState)}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setShareState(null);
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{shareState?.title || "Share Access Details"}</DialogTitle>
          {shareState?.description && (
            <DialogDescription>{shareState.description}</DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4">
          {shareState?.activationKey && (
            <div className="space-y-2">
              <Label htmlFor="share-activation-key">Activation key</Label>
              <div className="flex gap-2">
                <Input id="share-activation-key" value={shareState.activationKey} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  onClick={() => {
                    void copyTextToClipboard(shareState.activationKey || "", "Activation key copied.");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}

          {shareState?.successUrl && (
            <div className="space-y-2">
              <Label htmlFor="share-success-url">Success page URL</Label>
              <div className="flex gap-2">
                <Input id="share-success-url" value={shareState.successUrl} readOnly className="font-mono text-xs" />
                <Button
                  variant="outline"
                  onClick={() => {
                    void copyTextToClipboard(shareState.successUrl || "", "Success URL copied.");
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setShareState(null)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
};

export default ManagerReportsDrawer;
