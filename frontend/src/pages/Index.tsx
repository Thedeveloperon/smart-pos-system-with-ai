import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth/AuthContext";
import HeaderBar from "@/components/pos/HeaderBar";
import NewItemDialog from "@/components/pos/NewItemDialog";
import ImportSupplierBillDialog from "@/components/pos/ImportSupplierBillDialog";
import ProductManagementDialog from "@/components/pos/ProductManagementDialog";
import ManagerReportsDrawer from "@/components/pos/ManagerReportsDrawer";
import ProductSearchPanel from "@/components/pos/ProductSearchPanel";
import CartPanel from "@/components/pos/CartPanel";
import CheckoutPanel from "@/components/pos/CheckoutPanel";
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
import AuditLogPanel from "@/components/pos/cash-session/AuditLogPanel";
import type { CartItem, HeldBill, PaymentMethod, Product } from "@/components/pos/types";
import type { DenominationCount } from "@/components/pos/cash-session/types";
import {
  completeSale,
  fetchHeldBill,
  fetchHeldBills,
  fetchProducts,
  holdSale,
  fetchReceiptHtmlUrl,
  type PurchaseImportConfirmResponse,
  voidSale,
} from "@/lib/api";
import { playCartAddSound } from "@/lib/sound";

const IndexInner = () => {
  const { user, logout } = useAuth();
  const cashierName = user?.displayName || "Unknown";
  const isAdmin = user?.role === "admin" || user?.role === "manager";
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
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showImportSupplierBill, setShowImportSupplierBill] = useState(false);
  const [showShopSettings, setShowShopSettings] = useState(false);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [salesRefreshToken, setSalesRefreshToken] = useState(0);
  const [mobileTab, setMobileTab] = useState<"products" | "cart" | "checkout">("products");

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

  useEffect(() => {
    void Promise.all([loadProducts(), loadHeldBills()]);
  }, [loadHeldBills, loadProducts]);

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
    async (paymentMethod: PaymentMethod, cashReceived: number, customerMobile: string) => {
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
          referenceNumber
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
        onImportSupplierBill={() => setShowImportSupplierBill(true)}
        onShopSettings={() => setShowShopSettings(true)}
        onSignOut={() => {
          void logout();
        }}
        onAuditLog={() => setShowAuditLog(true)}
        onEndShift={handleEndShift}
        isAdmin={isAdmin}
        hasActiveSession={canSell}
      />

      {canSell && <CashSessionBanner onEndShift={handleEndShift} />}

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
          <div className="flex-1 hidden md:grid md:grid-cols-[5fr_3fr] overflow-hidden">
            <div className="min-h-0 min-w-0 border-r border-border overflow-hidden">
              <ProductSearchPanel products={products} onAddToCart={handleAddToCart} />
            </div>
            <div className="scrollbar-thin min-h-0 overflow-y-auto bg-card">
              <div className="grid h-full min-h-0" style={{ gridTemplateRows: "38% 62%" }}>
                <div className="min-h-0 overflow-hidden border-b border-border">
                  <CartPanel items={cartItems} onUpdateQty={handleUpdateQty} onRemove={handleRemove} />
                </div>
                <div className="min-h-0 overflow-hidden">
                  <CheckoutPanel
                    items={cartItems}
                    onCompleteSale={handleCompleteSale}
                    onHoldBill={() => void handleHoldBill()}
                    onCancelSale={handleCancelSale}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 md:hidden overflow-hidden pb-14">
            {mobileTab === "products" && (
              <ProductSearchPanel products={products} onAddToCart={handleAddToCart} />
            )}
            {mobileTab === "cart" && (
              <div className="h-full overflow-y-auto">
                <CartPanel items={cartItems} onUpdateQty={handleUpdateQty} onRemove={handleRemove} />
              </div>
            )}
            {mobileTab === "checkout" && (
              <div className="h-full overflow-y-auto">
                <CheckoutPanel
                  items={cartItems}
                  onCompleteSale={handleCompleteSale}
                  onHoldBill={() => void handleHoldBill()}
                  onCancelSale={handleCancelSale}
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
        onConfirm={handleCloseSession}
      />

      <AuditLogPanel
        open={showAuditLog}
        onClose={() => setShowAuditLog(false)}
        entries={auditLog}
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
    </div>
  );
};

const Index = () => (
  <CashSessionProvider>
    <IndexInner />
  </CashSessionProvider>
);

export default Index;
