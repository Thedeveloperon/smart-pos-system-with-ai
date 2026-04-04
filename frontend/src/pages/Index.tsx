import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthContext";
import { useLicensing } from "@/components/licensing/LicensingContext";
import { LicenseGraceBanner, LicenseOfflineBanner } from "@/components/licensing/LicenseScreens";
import HeaderBar from "@/components/pos/HeaderBar";
import AiInsightsDialog from "@/components/pos/AiInsightsDialog";
import RemindersDialog from "@/components/pos/RemindersDialog";
import LicenseAccountDialog from "@/components/pos/LicenseAccountDialog";
import NewItemDialog from "@/components/pos/NewItemDialog";
import ImportSupplierBillDialog from "@/components/pos/ImportSupplierBillDialog";
import ProductManagementDialog from "@/components/pos/ProductManagementDialog";
import ManagerReportsDrawer from "@/components/pos/ManagerReportsDrawer";
import ProductSearchPanel, { type ProductSearchPanelHandle } from "@/components/pos/ProductSearchPanel";
import CartPanel from "@/components/pos/CartPanel";
import CheckoutPanel, { type CheckoutPanelHandle } from "@/components/pos/CheckoutPanel";
import HeldBillsDrawer from "@/components/pos/HeldBillsDrawer";
import TodaySalesDrawer from "@/components/pos/TodaySalesDrawer";
import MobileTabBar from "@/components/pos/MobileTabBar";
import ShopProfileDialog from "@/components/pos/ShopProfileDialog";
import RefundSaleDialog from "@/components/pos/RefundSaleDialog";
import { CashSessionProvider, useCashSession } from "@/components/pos/cash-session/CashSessionContext";
import OpeningCashDialog from "@/components/pos/cash-session/OpeningCashDialog";
import ClosingCashDialog from "@/components/pos/cash-session/ClosingCashDialog";
import CashSessionBanner from "@/components/pos/cash-session/CashSessionBanner";
import SessionClosedSummary from "@/components/pos/cash-session/SessionClosedSummary";
import ManageDrawerDialog from "@/components/pos/cash-session/ManageDrawerDialog";
import AuditLogPanel from "@/components/pos/cash-session/AuditLogPanel";
import type { CartItem, HeldBill, PaymentMethod, Product } from "@/components/pos/types";
import type { DenominationCount } from "@/components/pos/cash-session/types";
import {
  acknowledgeReminder,
  completeSale,
  fetchAiWallet,
  fetchReminders,
  fetchHeldBill,
  fetchHeldBills,
  fetchProducts,
  holdSale,
  fetchReceiptHtmlUrl,
  runRemindersNow,
  updateCurrentCashDrawer,
  type PurchaseImportConfirmResponse,
  type ReminderItem,
  voidSale,
} from "@/lib/api";
import { isSuperAdminBackendRole } from "@/lib/auth";
import { flushOfflineSyncQueue, getOfflineSyncQueueSummary } from "@/lib/offlineSyncQueue";
import { playCartAddSound } from "@/lib/sound";
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

const SHORTCUTS_ONBOARDING_STORAGE_KEY_PREFIX = "smartpos.shortcuts.onboarding.v1";
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

  const [products, setProducts] = useState<Product[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [activeHeldSaleId, setActiveHeldSaleId] = useState<string | null>(null);
  const [showHeldBills, setShowHeldBills] = useState(false);
  const [showNewItem, setShowNewItem] = useState(false);
  const [showProductManagement, setShowProductManagement] = useState(false);
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
  const [reminders, setReminders] = useState<ReminderItem[]>([]);
  const [openReminderCount, setOpenReminderCount] = useState(0);
  const [isLoadingReminders, setIsLoadingReminders] = useState(false);
  const [isRunningRemindersNow, setIsRunningRemindersNow] = useState(false);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [salesRefreshToken, setSalesRefreshToken] = useState(0);
  const [mobileTab, setMobileTab] = useState<"products" | "cart" | "checkout">("products");
  const [offlinePendingCount, setOfflinePendingCount] = useState(0);
  const [isOfflineSyncing, setIsOfflineSyncing] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showShortcutOnboarding, setShowShortcutOnboarding] = useState(false);
  const [dismissedOfflineGrantToken, setDismissedOfflineGrantToken] = useState<string | null>(null);
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

  useEffect(() => {
    void Promise.all([loadProducts(), loadHeldBills()]);
  }, [loadHeldBills, loadProducts]);

  useEffect(() => {
    void loadAiWallet();
  }, [loadAiWallet]);

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
  const needsOpening = !session || session.status === "closed";
  const isClosed = session?.status === "closed";

  const handleAddToCart = useCallback((product: Product, qty: number) => {
    setCartItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + qty } : i
        );
      }
      return [...prev, { product, quantity: qty }];
    });
    void playCartAddSound();
    toast.success(`Added ${product.name}`, { duration: 1500 });
  }, []);

  const handleUpdateQty = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setCartItems((prev) => prev.filter((i) => i.product.id !== productId));
      return;
    }

    setCartItems((prev) =>
      prev.map((i) => (i.product.id === productId ? { ...i, quantity: qty } : i))
    );
  }, []);

  const handleRemove = useCallback((productId: string) => {
    setCartItems((prev) => prev.filter((i) => i.product.id !== productId));
    toast.info("Item removed");
  }, []);

  const handleHoldBill = useCallback(async () => {
    if (cartItems.length === 0) {
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
  }, [backendRole, cartItems, loadHeldBills]);

  const handleResumeBill = useCallback(
    async (billId: string) => {
      try {
        const bill = await fetchHeldBill(billId);
        setCartItems(bill.items);
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
      cashChangeCounts?: DenominationCount[]
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
          cashChangeCounts
        );

        setCartItems([]);
        setActiveHeldSaleId(null);
        toast.success("Sale completed!", { duration: 2000 });

        if (receiptWindow) {
          receiptWindow.location.href = await fetchReceiptHtmlUrl(result.sale_id);
        }

        await Promise.all([loadProducts(), loadHeldBills(), refreshSession()]);
      } catch (error) {
        if (receiptWindow) {
          receiptWindow.close();
        }
        console.error(error);
        toast.error("Failed to complete sale.");
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
    const didClose = await completeClosing(counts, total, reason);
    if (didClose) {
      setShowClosing(false);
    }
  };

  const handleNewSession = () => {
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
    showNewItem ||
    showProductManagement ||
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
    if (!licenseStatus?.offlineGrantToken) {
      setDismissedOfflineGrantToken(null);
      return;
    }

    if (dismissedOfflineGrantToken && dismissedOfflineGrantToken !== licenseStatus.offlineGrantToken) {
      setDismissedOfflineGrantToken(null);
    }
  }, [dismissedOfflineGrantToken, licenseStatus?.offlineGrantToken]);

  const firstOpenReminder = useMemo(
    () => reminders.find((item) => item.status === "open") ?? null,
    [reminders],
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <HeaderBar
        cashierName={cashierName}
        heldBillsCount={heldBills.length}
        onHeldBills={() => setShowHeldBills(true)}
        onTodaySales={() => setShowTodaySales(true)}
        onNewItem={() => setShowNewItem(true)}
        onManageProducts={() => setShowProductManagement(true)}
        onReports={() => setShowReports(true)}
        onAiInsights={() => setShowAiInsights(true)}
        aiCredits={aiCreditsBalance}
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
      />

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
          {licenseStatus.offlineGrantToken !== dismissedOfflineGrantToken && (
            <LicenseOfflineBanner
              status={licenseStatus}
              pendingSyncCount={offlinePendingCount}
              isRefreshing={isLicenseRefreshing}
              onRefresh={() => {
                void refreshLicenseStatus();
              }}
              onDismiss={() => {
                setDismissedOfflineGrantToken(licenseStatus.offlineGrantToken ?? null);
              }}
            />
          )}
        </>
      )}

      {canSell && <CashSessionBanner onEndShift={handleEndShift} onManageDrawer={handleManageDrawer} />}

      {openReminderCount > 0 && (
        <div className="mx-3 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="font-medium">{openReminderCount} reminder(s) need attention.</p>
              {firstOpenReminder && (
                <p className="text-xs text-amber-800/90">
                  Latest: {firstOpenReminder.title}
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-amber-300 bg-white px-2 text-amber-900 hover:bg-amber-100"
              onClick={() => setShowReminders(true)}
            >
              View Reminders
            </Button>
          </div>
        </div>
      )}

      {isPosShortcutsFeatureEnabled && canSell && !isClosed && showShortcutOnboarding && (
        <div className="mx-3 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
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
          onConfirm={(counts, total) => startSession(counts, total, cashierName)}
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
            className={`flex-1 hidden md:grid overflow-hidden ${
              expertModeEnabled
                ? "md:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.35fr)]"
                : "md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]"
            }`}
          >
            <div className="min-h-0 min-w-0 border-r border-border overflow-hidden">
              <ProductSearchPanel
                ref={desktopSearchRef}
                products={products}
                onAddToCart={handleAddToCart}
                showShortcutHints={isPosShortcutsFeatureEnabled}
                expertMode={expertModeEnabled}
              />
            </div>
            <div className="scrollbar-thin min-h-0 overflow-y-auto bg-card">
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
                    onCompleteSale={handleCompleteSale}
                    onHoldBill={() => void handleHoldBill()}
                    onCancelSale={handleCancelSale}
                    showShortcutHints={isPosShortcutsFeatureEnabled}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 md:hidden overflow-hidden pb-14">
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
        onSave={async (counts, total) => {
          await updateCurrentCashDrawer(counts, total);
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

      <NewItemDialog
        open={showNewItem}
        onOpenChange={setShowNewItem}
        onCreated={() => void loadProducts()}
      />

      <ProductManagementDialog
        open={showProductManagement}
        onOpenChange={setShowProductManagement}
        onChanged={() => void loadProducts()}
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
        expertModeEnabled={expertModeEnabled}
        onExpertModeEnabledChange={(enabled) => {
          setExpertModeEnabledState(enabled);
          setExpertModeEnabled(enabled);
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
