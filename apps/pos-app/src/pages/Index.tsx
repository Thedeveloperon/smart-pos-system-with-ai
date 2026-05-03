import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthContext";
import { useLicensing } from "@/components/licensing/LicensingContext";
import { LicenseGraceBanner, LicenseOfflineBanner } from "@/components/licensing/LicenseScreens";
import HeaderBar from "@/components/pos/HeaderBar";
import AiInsightsDialog from "@/components/pos/AiInsightsDialog";
import AiInsightsFab from "@/components/pos/AiInsightsFab";
import RemindersDialog from "@/components/pos/RemindersDialog";
import LicenseAccountDialog from "@/components/pos/LicenseAccountDialog";
import ImportSupplierBillDialog from "@/components/pos/ImportSupplierBillDialog";
import ManagerReportsDrawer from "@/components/pos/ManagerReportsDrawer";
import ProductSearchPanel, { type ProductSearchPanelHandle } from "@/components/pos/ProductSearchPanel";
import CartPanel from "@/components/pos/CartPanel";
import CheckoutPanel, { type CheckoutPanelHandle } from "@/components/pos/CheckoutPanel";
import HeldBillsDrawer from "@/components/pos/HeldBillsDrawer";
import TodaySalesDrawer from "@/components/pos/TodaySalesDrawer";
import MobileTabBar from "@/components/pos/MobileTabBar";
import ShopProfileDialog from "@/components/pos/ShopProfileDialog";
import RefundSaleDialog from "@/components/pos/RefundSaleDialog";
import { mergeHeldCartWithCurrentProducts } from "@/components/pos/heldCart";
import { CashSessionProvider, useCashSession } from "@/components/pos/cash-session/CashSessionContext";
import OpeningCashDialog from "@/components/pos/cash-session/OpeningCashDialog";
import ClosingCashDialog from "@/components/pos/cash-session/ClosingCashDialog";
import CashSessionBanner from "@/components/pos/cash-session/CashSessionBanner";
import SessionClosedSummary from "@/components/pos/cash-session/SessionClosedSummary";
import ManageDrawerDialog from "@/components/pos/cash-session/ManageDrawerDialog";
import AuditLogPanel from "@/components/pos/cash-session/AuditLogPanel";
import type { CartItem, HeldBill, PaymentMethod, Product, SelectedSerial } from "@/components/pos/types";
import type { CashSession, DenominationCount } from "@/components/pos/cash-session/types";
import {
  acknowledgeReminder,
  completeSale,
  fetchAiWallet,
  fetchInventoryDashboardSummary,
  fetchShopProfile,
  fetchReminders,
  fetchHeldBill,
  fetchHeldBills,
  fetchProducts,
  fetchTransactionsReport,
  holdSale,
  fetchReceiptHtmlUrl,
  runRemindersNow,
  updateCurrentCashDrawer,
  type PurchaseImportConfirmResponse,
  type ReminderItem,
  type ShopProfile,
  voidSale,
} from "@/lib/api";
import { openShiftReportPrintWindow } from "@/lib/shiftReport";
import { isSuperAdminBackendRole } from "@/lib/auth";
import { flushOfflineSyncQueue, getOfflineSyncQueueSummary } from "@/lib/offlineSyncQueue";
import { playCartAddSound } from "@/lib/sound";
import { filterShiftTransactions } from "@/lib/shiftReport";
import { isExpertModeEnabled, setExpertModeEnabled } from "@/lib/posPreferences";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePosShortcuts } from "@/hooks/usePosShortcuts";
import { POS_SHORTCUTS } from "@/components/pos/shortcuts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const SHORTCUTS_ONBOARDING_STORAGE_KEY_PREFIX = "smartpos.shortcuts.onboarding.v1";
const REMINDER_BANNER_DISMISSAL_STORAGE_KEY_PREFIX = "smartpos.reminders.banner.dismissed.v1";
const OFFLINE_BANNER_DISMISSAL_STORAGE_KEY_PREFIX = "smartpos.license.offline.banner.dismissed.v1";
const AI_LOW_CREDIT_THRESHOLD = 10;
const CLOUD_PORTAL_URL = (import.meta.env.VITE_CLOUD_PORTAL_URL || "").trim().replace(/\/$/, "");
const INVENTORY_MANAGER_URL = (import.meta.env.VITE_INVENTORY_MANAGER_URL || "/inventory-manager")
  .trim()
  .replace(/\/$/, "");
const isPosShortcutsFeatureEnabled = import.meta.env.VITE_POS_SHORTCUTS_ENABLED !== "false";

const IndexInner = () => {
  const { user, logout } = useAuth();
  const { status: licenseStatus, isRefreshing: isLicenseRefreshing, refresh: refreshLicenseStatus } = useLicensing();
  const cashierName = user?.displayName || "Unknown";
  const isAdmin = user?.role === "admin" || user?.role === "manager";
  const isSuperAdmin = isSuperAdminBackendRole(user?.backendRole);
  const backendRole = useMemo(() => {
    if (user?.role === "admin") {
      return "owner";
    }

    return user?.role || "cashier";
  }, [user?.role]);
  const isOwner = backendRole === "owner";

  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [activeHeldSaleId, setActiveHeldSaleId] = useState<string | null>(null);
  const [showHeldBills, setShowHeldBills] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showTodaySales, setShowTodaySales] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [showManageDrawer, setShowManageDrawer] = useState(false);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showImportSupplierBill, setShowImportSupplierBill] = useState(false);
  const [showShopSettings, setShowShopSettings] = useState(false);
  const [showAiInsights, setShowAiInsights] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [showLicenseAccount, setShowLicenseAccount] = useState(false);
  const [expertModeEnabled, setExpertModeEnabledState] = useState(() => isExpertModeEnabled());
  const [aiCreditsBalance, setAiCreditsBalance] = useState<number | null>(null);
  const [inventoryAlertCount, setInventoryAlertCount] = useState(0);
  const [shopProfile, setShopProfile] = useState<ShopProfile | null>(null);
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [openReminderCount, setOpenReminderCount] = useState(0);
  const [isLoadingReminders, setIsLoadingReminders] = useState(false);
  const [isRunningRemindersNow, setIsRunningRemindersNow] = useState(false);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [openingSeedSession, setOpeningSeedSession] = useState<CashSession | null>(null);
  const [lastClosedSession, setLastClosedSession] = useState<CashSession | null>(null);
  const [salesRefreshToken, setSalesRefreshToken] = useState(0);
  const [mobileTab, setMobileTab] = useState<"products" | "cart" | "checkout">("products");
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [todayIssueCount, setTodayIssueCount] = useState(0);
  const [isOfflineSyncing, setIsOfflineSyncing] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showShortcutOnboarding, setShowShortcutOnboarding] = useState(false);
  const [isOfflineBannerDismissed, setIsOfflineBannerDismissed] = useState(false);
  const [dismissedReminderId, setDismissedReminderId] = useState<string | null>(null);
  const isOfflineFlushInProgressRef = useRef(false);
  const desktopSearchRef = useRef<ProductSearchPanelHandle | null>(null);
  const mobileSearchRef = useRef<ProductSearchPanelHandle | null>(null);
  const desktopCheckoutRef = useRef<CheckoutPanelHandle | null>(null);
  const mobileCheckoutRef = useRef<CheckoutPanelHandle | null>(null);
  const seenReminderIdsRef = useRef<Set<string>>(new Set());
  const isMobile = useIsMobile();

  const shortcutsOnboardingStorageKey = useMemo(
    () =>
      `${SHORTCUTS_ONBOARDING_STORAGE_KEY_PREFIX}:${
        user?.username?.trim().toLowerCase() || "anonymous"
      }`,
    [user?.username],
  );

  const reminderBannerDismissalStorageKey = useMemo(
    () =>
      `${REMINDER_BANNER_DISMISSAL_STORAGE_KEY_PREFIX}:${
        user?.username?.trim().toLowerCase() || "anonymous"
      }`,
    [user?.username],
  );
  const offlineBannerDismissalStorageKey = useMemo(
    () =>
      `${OFFLINE_BANNER_DISMISSAL_STORAGE_KEY_PREFIX}:${
        licenseStatus?.deviceCode?.trim().toLowerCase() || "unknown"
      }`,
    [licenseStatus?.deviceCode],
  );

  const {
    session,
    canSell,
    startSession,
    resetSession,
    initiateClosing,
    completeClosing,
    cancelClosing,
    getExpectedCash,
    refreshSession,
    auditLog,
    cashSalesTotal,
  } = useCashSession();

  const openingInitialCounts = useMemo(
    () =>
      openingSeedSession?.closing?.counts ??
      openingSeedSession?.drawer.counts ??
      openingSeedSession?.opening.counts ??
      [],
    [openingSeedSession],
  );

  const openingSourceSession = useMemo(
    () => openingSeedSession ?? lastClosedSession ?? (session?.status === "closed" ? session : null),
    [lastClosedSession, openingSeedSession, session],
  );

  const firstOpenReminder = useMemo(
    () => reminders.find((item) => item.status === "open") ?? null,
    [reminders],
  );

  const shouldShowReminderBanner =
    openReminderCount > 0 && firstOpenReminder?.reminder_id !== dismissedReminderId;
  const isAiCreditLow =
    isAdmin && typeof aiCreditsBalance === "number" && aiCreditsBalance <= AI_LOW_CREDIT_THRESHOLD;
  const aiTopUpUrl = CLOUD_PORTAL_URL ? `${CLOUD_PORTAL_URL}/en/account` : "";
  const openInventoryManager = useCallback(() => {
    const inventoryManagerUrl = new URL(`${INVENTORY_MANAGER_URL}/`, window.location.origin);
    inventoryManagerUrl.searchParams.set(
      "returnTo",
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    inventoryManagerUrl.searchParams.set("tab", "products");
    window.location.assign(inventoryManagerUrl.toString());
  }, []);

  const dismissReminderBanner = useCallback(() => {
    if (!firstOpenReminder?.reminder_id) {
      return;
    }

    setDismissedReminderId(firstOpenReminder.reminder_id);
    try {
      window.localStorage.setItem(reminderBannerDismissalStorageKey, firstOpenReminder.reminder_id);
    } catch (error) {
      console.error(error);
    }
  }, [firstOpenReminder?.reminder_id, reminderBannerDismissalStorageKey]);

  useEffect(() => {
    if (session?.status === "closed") {
      setLastClosedSession(session);
      return;
    }

    if (canSell) {
      setOpeningSeedSession(null);
    }
  }, [canSell, session]);

  const loadProducts = useCallback(async () => {
    try {
      const items = await fetchProducts();
      setProducts(items);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load products.");
    }
  }, []);

  const loadHeldBills = useCallback(async () => {
    try {
      const items = await fetchHeldBills();
      setHeldBills(items);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load held bills.");
    }
  }, []);

  const loadAiWallet = useCallback(async () => {
    if (!isAdmin) {
      setAiCreditsBalance(null);
      return;
    }

    try {
      const wallet = await fetchAiWallet();
      setAiCreditsBalance(wallet.available_credits);
    } catch (error) {
      console.error(error);
      setAiCreditsBalance(null);
    }
  }, [isAdmin]);

  const loadTodayIssueCount = useCallback(async () => {
    try {
      const report = await fetchTransactionsReport(new Date(), new Date(), 500);
      const customPayoutCount = report.items.reduce(
        (count, item) => count + (item.custom_payout_used ? 1 : 0),
        0,
      );
      setTodayIssueCount(customPayoutCount);
    } catch (error) {
      console.error(error);
      setTodayIssueCount(0);
    }
  }, []);

  const loadInventoryAlertCount = useCallback(async () => {
    try {
      const summary = await fetchInventoryDashboardSummary();
      setInventoryAlertCount(summary.expiry_alert_count + summary.open_warranty_claims);
    } catch (error) {
      console.error(error);
      setInventoryAlertCount(0);
    }
  }, []);

  const loadShopProfile = useCallback(async () => {
    try {
      const profile = await fetchShopProfile();
      setShopProfile(profile);
    } catch (error) {
      console.error(error);
      setShopProfile(null);
    }
  }, []);

  useEffect(() => {
    void Promise.all([loadProducts(), loadHeldBills()]);
  }, [loadHeldBills, loadProducts]);

  useEffect(() => {
    void loadAiWallet();
  }, [loadAiWallet]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadAiWallet();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isAdmin, loadAiWallet]);

  useEffect(() => {
    void loadTodayIssueCount();
  }, [loadTodayIssueCount, salesRefreshToken]);

  useEffect(() => {
    void loadInventoryAlertCount();
  }, [loadInventoryAlertCount]);

  const loadReminders = useCallback(async (options?: { includeAcknowledged?: boolean; announceNew?: boolean; quiet?: boolean }) => {
    const includeAcknowledged = options?.includeAcknowledged ?? true;
    const announceNew = options?.announceNew ?? false;
    const quiet = options?.quiet ?? false;

    setIsLoadingReminders(true);
    try {
      const result = await fetchReminders(30, includeAcknowledged);
      setReminders(result.items);
      setOpenReminderCount(result.open_count);

      const seenIds = seenReminderIdsRef.current;
      if (seenIds.size === 0) {
        result.items.forEach((item) => {
          seenIds.add(item.reminder_id);
        });
        return;
      }

      if (!announceNew) {
        result.items.forEach((item) => {
          seenIds.add(item.reminder_id);
        });
        return;
      }

      const newOpenItems = result.items.filter(
        (item) => item.status === "open" && !seenIds.has(item.reminder_id),
      );

      newOpenItems.slice(0, 3).forEach((item) => {
        toast.info(item.title, {
          description: item.message,
        });
      });

      result.items.forEach((item) => {
        seenIds.add(item.reminder_id);
      });
    } catch (error) {
      console.error(error);
      if (!quiet) {
        toast.error("Failed to load reminders.");
      }
    } finally {
      setIsLoadingReminders(false);
    }
  }, []);

  useEffect(() => {
    void loadReminders({ includeAcknowledged: true, announceNew: false, quiet: true });

    const intervalId = window.setInterval(() => {
      void loadReminders({ includeAcknowledged: true, announceNew: true, quiet: true });
    }, 60 * 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadReminders]);

  useEffect(() => {
    void loadShopProfile();
  }, [loadShopProfile]);

  const refreshOfflineQueueSummary = useCallback(async () => {
    try {
      const summary = await getOfflineSyncQueueSummary();
      setOfflinePendingCount(summary.pending);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const flushOfflineQueue = useCallback(async (source: "startup" | "online" | "interval" | "manual") => {
    if (isOfflineFlushInProgressRef.current) {
      return;
    }

    isOfflineFlushInProgressRef.current = true;
    setIsOfflineSyncing(true);

    try {
      const result = await flushOfflineSyncQueue({ batchSize: 50 });
      setOfflinePendingCount(result.pending);

      if (result.attempted === 0) {
        return;
      }

      const shouldNotify = source !== "interval";
      if (shouldNotify && result.synced > 0) {
        toast.success(`Synced ${result.synced} offline event${result.synced === 1 ? "" : "s"}.`);
      }

      if (shouldNotify && result.conflicts > 0) {
        toast.info(`${result.conflicts} offline event${result.conflicts === 1 ? "" : "s"} had conflicts.`);
      }

      if (shouldNotify && result.rejected > 0) {
        const reason = result.rejectionMessages[0];
        const base = `${result.rejected} offline event${result.rejected === 1 ? "" : "s"} rejected.`;
        toast.error(reason ? `${base} ${reason}` : base);
      }

      if (result.failureMessage && (source === "manual" || source === "online")) {
        toast.error(result.failureMessage);
      }
    } catch (error) {
      console.error(error);
      if (source === "manual" || source === "online") {
        toast.error("Failed to flush offline sync queue.");
      }
    } finally {
      isOfflineFlushInProgressRef.current = false;
      setIsOfflineSyncing(false);
    }
  }, []);

  useEffect(() => {
    void refreshOfflineQueueSummary();
    void flushOfflineQueue("startup");

    const handleOnline = () => {
      void flushOfflineQueue("online");
    };

    const intervalId = window.setInterval(() => {
      if (!navigator.onLine) {
        return;
      }

      void flushOfflineQueue("interval");
    }, 90 * 1000);

    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("online", handleOnline);
    };
  }, [flushOfflineQueue, refreshOfflineQueueSummary]);

  const cartCount = cartItems.reduce((a, i) => a + i.quantity, 0);
  const holdBlockReason = cartItems.some((item) => item.selectedSerial)
    ? "Serial-selected items must be completed without holding."
    : null;
  const needsOpening = !session || session.status === "closed";
  const isClosed = session?.status === "closed";

  const handleAddToCart = useCallback((product: Product, qty: number, selectedSerial?: SelectedSerial) => {
    const normalizedQty = selectedSerial ? 1 : qty;
    const nextLineId = selectedSerial ? `serial:${selectedSerial.id}` : `product:${product.id}`;

    if (selectedSerial && cartItems.some((item) => item.selectedSerial?.id === selectedSerial.id)) {
      toast.info(`Serial ${selectedSerial.value} is already in the cart.`);
      return;
    }

    setCartItems((prev) => {
      const existing = prev.find((item) => (item.lineId ?? `product:${item.product.id}`) === nextLineId);
      if (existing) {
        return prev.map((item) =>
          (item.lineId ?? `product:${item.product.id}`) === nextLineId
            ? { ...item, quantity: item.quantity + normalizedQty }
            : item
        );
      }

      return [
        ...prev,
        {
          lineId: nextLineId,
          product,
          quantity: normalizedQty,
          selectedSerial,
        },
      ];
    });
    void playCartAddSound();
    toast.success(
      selectedSerial ? `Added ${product.name} (${selectedSerial.value})` : `Added ${product.name}`,
      { duration: 1500 },
    );
  }, [cartItems]);

  const handleUpdateQty = useCallback((lineId: string, qty: number) => {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((item) => (item.lineId ?? `product:${item.product.id}`) !== lineId));
      return;
    }

    setCartItems((prev) =>
      prev.map((item) =>
        (item.lineId ?? `product:${item.product.id}`) === lineId
          ? { ...item, quantity: item.selectedSerial ? 1 : qty }
          : item,
      )
    );
  }, []);

  const handleRemove = useCallback((lineId: string) => {
    setCartItems((prev) => prev.filter((item) => (item.lineId ?? `product:${item.product.id}`) !== lineId));
    toast.info("Item removed");
  }, []);

  const handleHoldBill = useCallback(async () => {
    if (cartItems.length === 0) {
      return;
    }

    if (holdBlockReason) {
      toast.error(holdBlockReason);
      return;
    }

    try {
      await holdSale(cartItems, backendRole);
      setCartItems([]);
      setActiveHeldSaleId(null);
      toast.success("Bill held successfully");
      await loadHeldBills();
    } catch (error) {
      console.error(error);
      toast.error("Failed to hold bill.");
    }
  }, [backendRole, cartItems, holdBlockReason, loadHeldBills]);

  const handleResumeBill = useCallback(
    async (billId: string) => {
      try {
        const [bill, currentProducts] = await Promise.all([fetchHeldBill(billId), fetchProducts()]);
        setProducts(currentProducts);
        setCartItems(mergeHeldCartWithCurrentProducts(bill.items, currentProducts));
        setActiveHeldSaleId(bill.id);
        setMobileTab("cart");
        toast.success("Bill resumed");
      } catch (error) {
        console.error(error);
        toast.error("Failed to resume held bill.");
      }
    },
    []
  );

  const handleDeleteHeldBill = useCallback(
    async (billId: string) => {
      try {
        await voidSale(billId);
        if (activeHeldSaleId === billId) {
          setCartItems([]);
          setActiveHeldSaleId(null);
        }
        toast.info("Held bill removed");
        await Promise.all([loadHeldBills(), loadProducts()]);
      } catch (error) {
        console.error(error);
        toast.error("Failed to remove held bill.");
      }
    },
    [activeHeldSaleId, loadHeldBills, loadProducts]
  );

  const handleCompleteSale = useCallback(
    async (
      paymentMethod: PaymentMethod,
      cashReceived: number,
      customerMobile: string,
      cashReceivedCounts?: DenominationCount[],
      cashChangeCounts?: DenominationCount[],
      customPayoutUsed?: boolean,
      cashShortAmount?: number
    ) => {
      const total = cartItems.reduce((a, i) => a + i.product.price * i.quantity, 0);
      const paidAmount = paymentMethod === "cash" ? cashReceived || total : total;
      const referenceNumber = customerMobile.trim() || undefined;
      const receiptWindow = window.open("", "_blank", "width=420,height=760");

      try {
        const result = await completeSale(
          cartItems,
          backendRole,
          paymentMethod,
          paidAmount,
          activeHeldSaleId || undefined,
          referenceNumber,
          cashReceivedCounts,
          cashChangeCounts,
          customPayoutUsed,
          cashShortAmount
        );

        setCartItems([]);
        setActiveHeldSaleId(null);
        toast.success("Sale completed!", { duration: 2000 });
        setSalesRefreshToken((current) => current + 1);

        if (receiptWindow) {
          receiptWindow.location.href = await fetchReceiptHtmlUrl(result.sale_id);
        }

        await Promise.all([loadProducts(), loadHeldBills(), refreshSession()]);
      } catch (error) {
        if (receiptWindow) {
          receiptWindow.close();
        }
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to complete sale.");
      }
    },
    [activeHeldSaleId, backendRole, cartItems, loadHeldBills, loadProducts, refreshSession]
  );

  const handleCancelSale = useCallback(() => {
    setCartItems([]);
    setActiveHeldSaleId(null);
    toast.info("Sale cancelled");
  }, []);

  const handleEndShift = () => {
    initiateClosing();
    setShowClosing(true);
  };

  const handleManageDrawer = useCallback(() => {
    setShowManageDrawer(true);
  }, []);

  const handleCloseSession = async (counts: DenominationCount[], total: number, reason?: string) => {
    const reportWindow = window.open("", "_blank", "width=1100,height=900");
    const closedSession = await completeClosing(counts, total, reason);

    if (!closedSession) {
      reportWindow?.close();
      return;
    }

    setShowClosing(false);
    setSalesRefreshToken((current) => current + 1);
    void Promise.all([loadProducts(), loadHeldBills(), refreshSession(), loadTodayIssueCount()]);

    try {
      const transactionsReport = await fetchTransactionsReport(new Date(), new Date(), 500);
      const shiftTransactions = filterShiftTransactions(
        transactionsReport.items,
        closedSession.openedAt,
        closedSession.closedAt ?? new Date(),
      );
      const paymentTotals = new Map<string, number>();
      for (const sale of shiftTransactions) {
        for (const payment of sale.payment_breakdown) {
          paymentTotals.set(payment.method, (paymentTotals.get(payment.method) || 0) + payment.net_amount);
        }
      }

      const difference = closedSession.difference ?? null;
      const balanceStatus =
        difference === null
          ? "Closing cash has not been recorded yet."
          : difference === 0
            ? "Closing cash balances with the expected amount."
            : `Closing cash differs by ${difference > 0 ? "+" : "-"}Rs. ${Math.abs(difference).toLocaleString()}.`;

      openShiftReportPrintWindow(
        {
          title: "Today's Sales Shift Report",
          shiftNumber: closedSession.shiftNumber,
          cashierName: closedSession.cashierName,
          generatedAt: new Date(),
          reportDateLabel: (closedSession.closedAt ?? new Date()).toLocaleDateString(),
          openedAt: closedSession.openedAt,
          closedAt: closedSession.closedAt ?? null,
          openingCash: closedSession.opening.total,
          closingCash: closedSession.closing?.total ?? null,
          expectedCash: closedSession.expectedCash ?? closedSession.opening.total + closedSession.cashSalesTotal,
          cashInDrawer: closedSession.drawer.total,
          totalSales: shiftTransactions.length,
          grossSales: shiftTransactions.reduce((sum, sale) => sum + sale.grand_total, 0),
          cashSales: closedSession.cashSalesTotal,
          cashShortSalesCount: shiftTransactions.filter((item) => item.custom_payout_used).length,
          cashShortTotal: shiftTransactions.reduce(
            (sum, item) => sum + (item.custom_payout_used ? item.cash_short_amount ?? 0 : 0),
            0,
          ),
          balanceStatus,
          balanceIsHealthy: difference === 0,
          paymentTotals: Array.from(paymentTotals.entries()).map(([method, totalAmount]) => ({
            method,
            total: totalAmount,
          })),
          transactions: shiftTransactions,
        },
        reportWindow,
      );
    } catch (error) {
      reportWindow?.close();
      console.error(error);
      toast.error("Cash session closed, but the shift report could not be generated.");
    }
  };

  const handleNewSession = () => {
    if (session) {
      setOpeningSeedSession(session);
      setLastClosedSession(session);
    }
    resetSession();
    toast.success("Ready for a new session.");
  };

  const handleRefundRequested = (saleId: string) => {
    setRefundSaleId(saleId);
  };

  const handleRefundCompleted = async () => {
    setSalesRefreshToken((current) => current + 1);
    await Promise.all([loadProducts(), loadHeldBills(), refreshSession()]);
  };

  const handleAcknowledgeReminder = useCallback(async (reminderId: string) => {
    try {
      await acknowledgeReminder(reminderId);
      toast.success("Reminder acknowledged.");
      await loadReminders({ includeAcknowledged: true, announceNew: false, quiet: true });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to acknowledge reminder.");
    }
  }, [loadReminders]);

  const handleRunRemindersNow = useCallback(async () => {
    setIsRunningRemindersNow(true);
    try {
      const result = await runRemindersNow();
      toast.success(
        `Reminder run completed: ${result.created_events} event(s), ${result.generated_reports} report job(s).`,
      );
      await loadReminders({ includeAcknowledged: true, announceNew: false, quiet: true });
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to run reminders.");
    } finally {
      setIsRunningRemindersNow(false);
    }
  }, [loadReminders]);

  const runOnTargetTab = useCallback((tab: "products" | "checkout", action: () => void) => {
    if (isMobile) {
      setMobileTab(tab);
      window.setTimeout(action, 0);
      return;
    }

    action();
  }, [isMobile]);

  const handleShortcutFocusSearch = useCallback(() => {
    runOnTargetTab("products", () => {
      const searchPanel = isMobile ? mobileSearchRef.current : desktopSearchRef.current;
      searchPanel?.focusSearch();
    });
  }, [isMobile, runOnTargetTab]);

  const handleShortcutHoldBill = useCallback(() => {
    if (cartItems.length === 0) {
      toast.info("F4 blocked: add items to the cart first.");
      return;
    }

    void handleHoldBill();
  }, [cartItems.length, handleHoldBill]);

  const handleShortcutOpenCashWorkflow = useCallback(() => {
    if (cartItems.length === 0) {
      toast.info("F8 blocked: add items to the cart first.");
      return;
    }

    runOnTargetTab("checkout", () => {
      const checkoutPanel = isMobile ? mobileCheckoutRef.current : desktopCheckoutRef.current;
      checkoutPanel?.openCashWorkflow();
    });
  }, [cartItems.length, isMobile, runOnTargetTab]);

  const handleShortcutCompleteSale = useCallback(() => {
    runOnTargetTab("checkout", () => {
      const checkoutPanel = isMobile ? mobileCheckoutRef.current : desktopCheckoutRef.current;
      const result = checkoutPanel?.tryCompleteSale();

      if (!result?.ok) {
        toast.info(`F9 blocked: ${result?.reason ?? "sale is not ready to complete"}.`);
      }
    });
  }, [isMobile, runOnTargetTab]);

  const handleShortcutOpenHelp = useCallback(() => {
    setShowShortcutsHelp(true);
  }, []);

  const handleShortcutEscape = useCallback(() => {
    setShowShortcutsHelp(false);
  }, []);

  const markShortcutOnboardingSeen = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(shortcutsOnboardingStorageKey, "seen");
  }, [shortcutsOnboardingStorageKey]);

  const dismissShortcutOnboarding = useCallback(() => {
    setShowShortcutOnboarding(false);
    markShortcutOnboardingSeen();
  }, [markShortcutOnboardingSeen]);

  const isShortcutActionBlocked =
    showHeldBills ||
    showReports ||
    showTodaySales ||
    showClosing ||
    showAuditLog ||
    showImportSupplierBill ||
    showShopSettings ||
    showLicenseAccount ||
    refundSaleId !== null ||
    showShortcutsHelp;

  usePosShortcuts({
    enabled: isPosShortcutsFeatureEnabled && canSell && !isClosed,
    actionsEnabled: !isShortcutActionBlocked,
    onFocusSearch: handleShortcutFocusSearch,
    onHoldBill: handleShortcutHoldBill,
    onOpenCashWorkflow: handleShortcutOpenCashWorkflow,
    onCompleteSale: handleShortcutCompleteSale,
    onOpenHelp: handleShortcutOpenHelp,
    onEscape: handleShortcutEscape,
  });

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.altKey && event.key.toLowerCase() === "a") {
        if (isShortcutActionBlocked) {
          return;
        }
        event.preventDefault();
        setShowAiInsights((previous) => !previous);
      }

      if (event.key === "Escape") {
        setShowAiInsights(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAdmin, isShortcutActionBlocked]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!isPosShortcutsFeatureEnabled) {
      setShowShortcutOnboarding(false);
      return;
    }

    if (user?.role !== "cashier") {
      setShowShortcutOnboarding(false);
      return;
    }

    const alreadySeen = window.localStorage.getItem(shortcutsOnboardingStorageKey) === "seen";
    setShowShortcutOnboarding(!alreadySeen);
  }, [shortcutsOnboardingStorageKey, user?.role]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; saleId?: string } | undefined;
      if (data?.type !== "smartpos-open-refund" || !data.saleId) {
        return;
      }

      setShowTodaySales(true);
      setRefundSaleId(data.saleId);
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  useEffect(() => {
    if (!canSell) {
      setShowManageDrawer(false);
    }
  }, [canSell]);

  useEffect(() => {
    if (!licenseStatus?.deviceCode) {
      setIsOfflineBannerDismissed(false);
      return;
    }

    try {
      const storedValue = window.localStorage.getItem(offlineBannerDismissalStorageKey);
      setIsOfflineBannerDismissed(storedValue === "1");
    } catch (error) {
      console.error(error);
      setIsOfflineBannerDismissed(false);
    }
  }, [licenseStatus?.deviceCode, offlineBannerDismissalStorageKey]);

  useEffect(() => {
    const isLicenseEligibleForOfflineBanner =
      licenseStatus?.state === "active" || licenseStatus?.state === "grace";
    if (isLicenseEligibleForOfflineBanner && licenseStatus?.offlineGrantToken) {
      return;
    }

    setIsOfflineBannerDismissed(false);
    if (!licenseStatus?.deviceCode) {
      return;
    }

    try {
      window.localStorage.removeItem(offlineBannerDismissalStorageKey);
    } catch (error) {
      console.error(error);
    }
  }, [
    licenseStatus?.deviceCode,
    licenseStatus?.offlineGrantToken,
    licenseStatus?.state,
    offlineBannerDismissalStorageKey,
  ]);

  useEffect(() => {
    try {
      const storedDismissedReminderId = window.localStorage.getItem(reminderBannerDismissalStorageKey);
      setDismissedReminderId(storedDismissedReminderId);
    } catch (error) {
      console.error(error);
      setDismissedReminderId(null);
    }
  }, [reminderBannerDismissalStorageKey]);

  useEffect(() => {
    if (!firstOpenReminder?.reminder_id) {
      setDismissedReminderId(null);
      return;
    }

    if (dismissedReminderId && dismissedReminderId !== firstOpenReminder.reminder_id) {
      setDismissedReminderId(null);
      try {
        window.localStorage.removeItem(reminderBannerDismissalStorageKey);
      } catch (error) {
        console.error(error);
      }
    }
  }, [dismissedReminderId, firstOpenReminder?.reminder_id, reminderBannerDismissalStorageKey]);

  return (
    <div className="pos-shell h-screen flex flex-col overflow-hidden">
      <HeaderBar
        cashierName={cashierName}
        heldBillsCount={heldBills.length}
        todayIssueCount={todayIssueCount}
        onHeldBills={() => setShowHeldBills(true)}
        onTodaySales={() => setShowTodaySales(true)}
        onInventoryManager={openInventoryManager}
        inventoryAlertCount={inventoryAlertCount}
        onReports={() => setShowReports(true)}
        onAiInsights={() => setShowAiInsights(true)}
        aiCredits={aiCreditsBalance}
        isAiCreditLow={isAiCreditLow}
        cloudPortalUrl={CLOUD_PORTAL_URL || undefined}
        onReminders={() => setShowReminders(true)}
        openReminderCount={openReminderCount}
        onImportSupplierBill={() => setShowImportSupplierBill(true)}
        onShopSettings={() => setShowShopSettings(true)}
        onMyAccountLicenses={() => setShowLicenseAccount(true)}
        onSyncOffline={isAdmin ? () => {
          void flushOfflineQueue("manual");
        } : undefined}
        offlinePendingCount={offlinePendingCount}
        isOfflineSyncing={isOfflineSyncing}
        onSignOut={() => {
          void logout();
        }}
        onAuditLog={() => setShowAuditLog(true)}
        onEndShift={handleEndShift}
        isAdmin={isAdmin}
        hasActiveSession={canSell}
        cashierToolbarVisibility={{
          manage: shopProfile?.showManageForCashier ?? true,
          reports: shopProfile?.showReportsForCashier ?? true,
          aiInsights: shopProfile?.showAiInsightsForCashier ?? true,
          heldBills: shopProfile?.showHeldBillsForCashier ?? true,
          reminders: shopProfile?.showRemindersForCashier ?? true,
          auditTrail: shopProfile?.showAuditTrailForCashier ?? true,
          endShift: shopProfile?.showEndShiftForCashier ?? true,
          todaySales: shopProfile?.showTodaySalesForCashier ?? true,
          importBill: shopProfile?.showImportBillForCashier ?? true,
          shopSettings: shopProfile?.showShopSettingsForCashier ?? true,
          myLicenses: shopProfile?.showMyLicensesForCashier ?? true,
          sync: shopProfile?.showOfflineSyncForCashier ?? true,
        }}
      />

      {isAiCreditLow && (
        <div className="mx-2 mt-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/60 bg-warning/15 px-4 py-2 text-sm text-warning-foreground">
          <span>
            Low AI credits: <strong>{aiCreditsBalance?.toFixed(2)}</strong>. Top up soon to avoid interruptions.
          </span>
          {aiTopUpUrl && (
            <a
              href={aiTopUpUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-md border border-warning/50 px-3 py-1 text-xs font-medium hover:bg-warning/20"
            >
              Top Up
            </a>
          )}
        </div>
      )}

      {licenseStatus?.state === "grace" && (
        <LicenseGraceBanner
          status={licenseStatus}
          isRefreshing={isLicenseRefreshing}
          onRefresh={() => {
            void refreshLicenseStatus();
          }}
        />
      )}

      {(licenseStatus?.state === "active" || licenseStatus?.state === "grace") && (
        <>
          {!isOfflineBannerDismissed && licenseStatus.offlineGrantToken && (
            <LicenseOfflineBanner
              status={licenseStatus}
              pendingSyncCount={offlinePendingCount}
              isRefreshing={isLicenseRefreshing}
              onRefresh={() => {
                void refreshLicenseStatus();
              }}
              onDismiss={() => {
                setIsOfflineBannerDismissed(true);
                try {
                  window.localStorage.setItem(offlineBannerDismissalStorageKey, "1");
                } catch (error) {
                  console.error(error);
                }
              }}
            />
          )}
        </>
      )}

      {canSell && <CashSessionBanner onEndShift={handleEndShift} onManageDrawer={handleManageDrawer} />}

      {shouldShowReminderBanner && (
        <div className="mx-3 mt-2 rounded-xl border border-warning/35 bg-warning/15 px-3 py-2.5 text-sm text-warning-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="font-medium">{openReminderCount} reminder(s) need attention.</p>
              {firstOpenReminder && (
                <p className="text-xs text-amber-800/90">
                  Latest: {firstOpenReminder.title}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 border-amber-300 bg-white px-2 text-amber-900 hover:bg-amber-100"
                onClick={() => setShowReminders(true)}
              >
                View Reminders
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-amber-900 hover:bg-amber-100 hover:text-amber-950"
                onClick={dismissReminderBanner}
                aria-label="Close reminder banner"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {isPosShortcutsFeatureEnabled && canSell && !isClosed && showShortcutOnboarding && (
        <div className="mx-3 mt-2 rounded-xl border border-warning/35 bg-warning/15 px-3 py-2.5 text-sm text-warning-foreground">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-medium">
              Keyboard shortcuts are enabled: F2 search, F4 hold, F8 cash, F9 complete.
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-amber-900 hover:bg-amber-100"
                onClick={() => {
                  setShowShortcutsHelp(true);
                  dismissShortcutOnboarding();
                }}
              >
                View Help (F1)
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 border-amber-300 bg-white px-2 text-amber-900 hover:bg-amber-100"
                onClick={dismissShortcutOnboarding}
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}

      {needsOpening && !isClosed && (
        <OpeningCashDialog
          open={true}
          cashierName={cashierName}
          initialCounts={openingInitialCounts}
          previousSession={openingSourceSession}
          onConfirm={(counts, total, enteredCashierName) => startSession(counts, total, enteredCashierName)}
        />
      )}

      {isClosed && session ? (
        <SessionClosedSummary
          session={session}
          onNewSession={handleNewSession}
          onViewAuditLog={() => setShowAuditLog(true)}
        />
      ) : (
        <>
          <div
            className={`flex-1 hidden md:grid overflow-hidden rounded-t-2xl border border-border/70 bg-surface-elevated mx-2 mb-2 ${
              expertModeEnabled
                ? "md:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.35fr)]"
                : "md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]"
            }`}
          >
            <div className="min-h-0 min-w-0 border-r border-border/70 overflow-hidden bg-surface">
              <ProductSearchPanel
                ref={desktopSearchRef}
                products={products}
                onAddToCart={handleAddToCart}
                showShortcutHints={isPosShortcutsFeatureEnabled}
                expertMode={expertModeEnabled}
              />
            </div>
            <div className="scrollbar-thin min-h-0 overflow-y-auto bg-surface-elevated">
              <div className="grid h-full min-h-0" style={{ gridTemplateRows: "38% 62%" }}>
                <div className="min-h-0 overflow-hidden border-b border-border">
                  <CartPanel
                    items={cartItems}
                    onUpdateQty={handleUpdateQty}
                    onRemove={handleRemove}
                  />
                </div>
                <div className="min-h-0 overflow-hidden">
                  <CheckoutPanel
                    ref={desktopCheckoutRef}
                    items={cartItems}
                    cashDrawer={session?.drawer}
                    allowCustomPayout={isAdmin}
                    holdBlockReason={holdBlockReason}
                    onCompleteSale={handleCompleteSale}
                    onHoldBill={() => void handleHoldBill()}
                    onCancelSale={handleCancelSale}
                    showShortcutHints={isPosShortcutsFeatureEnabled}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="mx-2 mb-2 flex-1 overflow-hidden rounded-t-2xl border border-border/70 bg-surface-elevated pb-14 md:hidden">
            {mobileTab === "products" && (
              <ProductSearchPanel
                ref={mobileSearchRef}
                products={products}
                onAddToCart={handleAddToCart}
                showShortcutHints={isPosShortcutsFeatureEnabled}
                expertMode={expertModeEnabled}
              />
            )}
            {mobileTab === "cart" && (
              <div className="h-full overflow-y-auto">
                <CartPanel
                  items={cartItems}
                  onUpdateQty={handleUpdateQty}
                  onRemove={handleRemove}
                />
              </div>
            )}
            {mobileTab === "checkout" && (
              <div className="h-full overflow-y-auto">
                <CheckoutPanel
                  ref={mobileCheckoutRef}
                  items={cartItems}
                  cashDrawer={session?.drawer}
                  allowCustomPayout={isAdmin}
                  holdBlockReason={holdBlockReason}
                  onCompleteSale={handleCompleteSale}
                  onHoldBill={() => void handleHoldBill()}
                  onCancelSale={handleCancelSale}
                  showShortcutHints={isPosShortcutsFeatureEnabled}
                />
              </div>
            )}
          </div>

          <MobileTabBar activeTab={mobileTab} onTabChange={setMobileTab} cartCount={cartCount} />
        </>
      )}

      {isAdmin && !showAiInsights && !isShortcutActionBlocked && (
        <AiInsightsFab
          onClick={() => setShowAiInsights(true)}
        />
      )}

      <ClosingCashDialog
        open={showClosing}
        onClose={() => {
          setShowClosing(false);
          cancelClosing();
        }}
        cashierName={cashierName}
        expectedCash={getExpectedCash()}
        openingCash={session?.opening.total || 0}
        cashSalesTotal={cashSalesTotal}
        initialCounts={session?.drawer.counts ?? session?.opening.counts ?? []}
        onConfirm={handleCloseSession}
      />

      <AuditLogPanel
        open={showAuditLog}
        onClose={() => setShowAuditLog(false)}
        entries={auditLog}
      />

      <ManageDrawerDialog
        open={showManageDrawer}
        session={session}
        onClose={() => setShowManageDrawer(false)}
        onSave={async (counts, total, reason) => {
          await updateCurrentCashDrawer(counts, total, reason);
          await refreshSession();
          setShowManageDrawer(false);
        }}
      />

      <TodaySalesDrawer
        open={showTodaySales}
        onClose={() => setShowTodaySales(false)}
        session={session}
        cashSalesTotal={cashSalesTotal}
        refreshToken={salesRefreshToken}
        onRefundSale={handleRefundRequested}
      />

      <ManagerReportsDrawer
        open={showReports}
        onClose={() => setShowReports(false)}
        refreshToken={salesRefreshToken}
        onRefundSale={handleRefundRequested}
        isSuperAdmin={isSuperAdmin}
      />

      <HeldBillsDrawer
        open={showHeldBills}
        onClose={() => setShowHeldBills(false)}
        heldBills={heldBills}
        onResume={(billId) => {
          return handleResumeBill(billId);
        }}
        onDelete={(billId) => {
          void handleDeleteHeldBill(billId);
        }}
      />

      <ImportSupplierBillDialog
        open={showImportSupplierBill}
        onOpenChange={setShowImportSupplierBill}
        onImported={async (_result: PurchaseImportConfirmResponse) => {
          await loadProducts();
        }}
      />

      <ShopProfileDialog
        open={showShopSettings}
        onOpenChange={setShowShopSettings}
        isOwner={isOwner}
        expertModeEnabled={expertModeEnabled}
        onExpertModeEnabledChange={(enabled) => {
          setExpertModeEnabledState(enabled);
          setExpertModeEnabled(enabled);
        }}
        onSaved={(savedProfile) => {
          setShopProfile(savedProfile);
        }}
      />

      <LicenseAccountDialog
        open={showLicenseAccount}
        onOpenChange={setShowLicenseAccount}
        onChanged={() => {
          void refreshLicenseStatus();
        }}
      />

      <AiInsightsDialog
        open={showAiInsights}
        onOpenChange={setShowAiInsights}
        onBalanceChange={setAiCreditsBalance}
        isSuperAdmin={isSuperAdmin}
        language={shopProfile?.language}
      />

      <RemindersDialog
        open={showReminders}
        onOpenChange={setShowReminders}
        reminders={reminders}
        openCount={openReminderCount}
        loading={isLoadingReminders}
        onRefresh={() => {
          void loadReminders({ includeAcknowledged: true, announceNew: false, quiet: false });
        }}
        onAcknowledge={(reminderId) => {
          void handleAcknowledgeReminder(reminderId);
        }}
        onRunNow={() => {
          void handleRunRemindersNow();
        }}
        canRunNow={isAdmin}
        isRunningNow={isRunningRemindersNow}
      />

      <RefundSaleDialog
        open={refundSaleId !== null}
        saleId={refundSaleId}
        onOpenChange={(open) => {
          if (!open) {
            setRefundSaleId(null);
          }
        }}
        onRefunded={async () => {
          await handleRefundCompleted();
          setRefundSaleId(null);
        }}
      />

      {isPosShortcutsFeatureEnabled && (
        <Dialog open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>POS Keyboard Shortcuts</DialogTitle>
              <DialogDescription>
                Use these keys to speed up cashier billing.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {POS_SHORTCUTS.map((shortcut) => (
                <div key={shortcut.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <span className="text-sm text-foreground">{shortcut.description}</span>
                  <kbd className="rounded bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

const Index = () => (
  <CashSessionProvider>
    <IndexInner />
  </CashSessionProvider>
);

export default Index;
