import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  adminActivateDevice,
  adminDeactivateDevice,
  adminExtendDeviceGrace,
  adminForceLicenseResync,
  adminReactivateDevice,
  adminRevokeDevice,
  adminTransferDeviceSeat,
  createAdminManualBillingInvoice,
  exportAdminLicenseAuditLogs,
  fetchAdminLicenseAuditLogs,
  fetchAdminLicensingShops,
  fetchAdminManualBillingInvoices,
  fetchAdminManualBillingPayments,
  recordAdminManualBillingPayment,
  rejectAdminManualBillingPayment,
  runAdminEmergencyAction,
  verifyAdminManualBillingPayment,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type BillingAdminWorkspaceProps = {
  username?: string;
  onSignOut: () => void;
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

const promptRequired = (title: string, defaultValue = "") => {
  const value = window.prompt(title, defaultValue);
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    toast.error("This field is required.");
    return null;
  }

  return normalized;
};

const promptOptional = (title: string, defaultValue = "") => {
  const value = window.prompt(title, defaultValue);
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized || "";
};

const BillingAdminWorkspace = ({ username, onSignOut }: BillingAdminWorkspaceProps) => {
  const [loading, setLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [invoices, setInvoices] = useState<Awaited<ReturnType<typeof fetchAdminManualBillingInvoices>> | null>(null);
  const [payments, setPayments] = useState<Awaited<ReturnType<typeof fetchAdminManualBillingPayments>> | null>(null);
  const [shops, setShops] = useState<Awaited<ReturnType<typeof fetchAdminLicensingShops>> | null>(null);
  const [auditLogs, setAuditLogs] = useState<Awaited<ReturnType<typeof fetchAdminLicenseAuditLogs>> | null>(null);
  const [auditSearch, setAuditSearch] = useState("");
  const [activeTab, setActiveTab] = useState("invoices");
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  const loadInvoices = useCallback(async () => {
    const [invoiceData, paymentData] = await Promise.all([
      fetchAdminManualBillingInvoices({ take: 80 }),
      fetchAdminManualBillingPayments({ take: 80 }),
    ]);
    setInvoices(invoiceData);
    setPayments(paymentData);
  }, []);

  const loadLicenses = useCallback(async () => {
    const response = await fetchAdminLicensingShops();
    setShops(response);
  }, []);

  const loadAudit = useCallback(async (search?: string) => {
    setAuditLoading(true);
    try {
      const response = await fetchAdminLicenseAuditLogs({
        search: search?.trim() || undefined,
        take: 120,
      });
      setAuditLogs(response);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadInvoices(),
        loadLicenses(),
        loadAudit(auditSearch),
      ]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to load billing workspace data.");
    } finally {
      setLoading(false);
    }
  }, [auditSearch, loadAudit, loadInvoices, loadLicenses]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const pendingPayments = useMemo(
    () => (payments?.items ?? []).filter((item) => item.status === "pending_verification"),
    [payments?.items]
  );

  const handleCreateInvoice = useCallback(async () => {
    const shopCode = promptRequired("Shop code (for example: default)");
    if (!shopCode) {
      return;
    }

    const amountRaw = promptRequired("Amount due (LKR)", "5000");
    if (!amountRaw) {
      return;
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }

    const dueDate = promptRequired("Due date (YYYY-MM-DD)");
    if (!dueDate) {
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      toast.error("Due date must be in YYYY-MM-DD format.");
      return;
    }

    const notes = promptOptional("Notes (optional)");
    if (notes === null) {
      return;
    }

    const actorNote = promptRequired("Actor note (required for audit)");
    if (!actorNote) {
      return;
    }

    try {
      await createAdminManualBillingInvoice({
        shop_code: shopCode,
        amount_due: amount,
        currency: "LKR",
        due_at: `${dueDate}T00:00:00Z`,
        notes: notes || undefined,
        actor: "billing-ui",
        reason_code: "manual_billing_invoice_created",
        actor_note: actorNote,
      });
      toast.success("Invoice created.");
      await loadInvoices();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to create invoice.");
    }
  }, [loadInvoices]);

  const handleRecordPayment = useCallback(async (prefillInvoiceNumber?: string) => {
    const invoiceNumber = (prefillInvoiceNumber?.trim() || promptRequired("Invoice number"))?.trim();
    if (!invoiceNumber) {
      return;
    }

    const methodInput = promptRequired("Method (cash, bank_deposit, bank_transfer)", "bank_deposit");
    if (!methodInput) {
      return;
    }

    const method = methodInput.toLowerCase();
    if (method !== "cash" && method !== "bank_deposit" && method !== "bank_transfer") {
      toast.error("Method must be cash, bank_deposit, or bank_transfer.");
      return;
    }

    const amountRaw = promptRequired("Amount paid (LKR)", "5000");
    if (!amountRaw) {
      return;
    }

    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Amount must be greater than zero.");
      return;
    }

    const reference = promptRequired("Reference number (required)");
    if (!reference) {
      return;
    }

    const notes = promptOptional("Notes (optional)");
    if (notes === null) {
      return;
    }

    const actorNote = promptRequired("Actor note (required for audit)");
    if (!actorNote) {
      return;
    }

    try {
      await recordAdminManualBillingPayment({
        invoice_number: invoiceNumber,
        method: method as "cash" | "bank_deposit" | "bank_transfer",
        amount,
        currency: "LKR",
        bank_reference: reference,
        notes: notes || undefined,
        actor: "billing-ui",
        reason_code: "manual_payment_pending_verification",
        actor_note: actorNote,
      });
      toast.success("Payment recorded and pending verification.");
      await loadInvoices();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to record payment.");
    }
  }, [loadInvoices]);

  const handleVerifyPayment = useCallback(async (paymentId: string) => {
    const actorNote = promptRequired("Actor note for verification");
    if (!actorNote) {
      return;
    }

    const extendDaysRaw = promptRequired("Extension days (1-365)", "30");
    if (!extendDaysRaw) {
      return;
    }

    const extendDays = Number(extendDaysRaw);
    if (!Number.isFinite(extendDays) || extendDays < 1 || extendDays > 365) {
      toast.error("Extension days must be between 1 and 365.");
      return;
    }

    const customerEmail = promptOptional("Customer email (optional)");
    if (customerEmail === null) {
      return;
    }

    try {
      await verifyAdminManualBillingPayment(paymentId, {
        reason_code: "manual_payment_verified",
        actor_note: actorNote,
        reason: actorNote,
        extend_days: Math.round(extendDays),
        customer_email: customerEmail || undefined,
        actor: "billing-ui",
      });
      toast.success("Payment verified.");
      await Promise.all([loadInvoices(), loadLicenses()]);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to verify payment.");
    }
  }, [loadInvoices, loadLicenses]);

  const handleRejectPayment = useCallback(async (paymentId: string) => {
    const actorNote = promptRequired("Rejection reason / actor note");
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
      await loadInvoices();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to reject payment.");
    }
  }, [loadInvoices]);

  const requestActorNote = useCallback((actionLabel: string) => {
    return promptRequired(`${actionLabel}: actor note`);
  }, []);

  const handleDeactivateDevice = useCallback(async (deviceCode: string) => {
    const actorNote = requestActorNote("Deactivate device");
    if (!actorNote) {
      return;
    }

    try {
      await adminDeactivateDevice(deviceCode, actorNote, "billing-ui");
      toast.success(`Device ${deviceCode} deactivated.`);
      await loadLicenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to deactivate device.");
    }
  }, [loadLicenses, requestActorNote]);

  const handleRevokeDevice = useCallback(async (deviceCode: string) => {
    const actorNote = requestActorNote("Revoke device");
    if (!actorNote) {
      return;
    }

    try {
      await adminRevokeDevice(deviceCode, actorNote, "billing-ui");
      toast.success(`Device ${deviceCode} revoked.`);
      await loadLicenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to revoke device.");
    }
  }, [loadLicenses, requestActorNote]);

  const handleActivateDevice = useCallback(async (deviceCode: string) => {
    const actorNote = requestActorNote("Activate device");
    if (!actorNote) {
      return;
    }

    try {
      await adminActivateDevice(deviceCode, actorNote, "billing-ui");
      toast.success(`Device ${deviceCode} activated.`);
      await loadLicenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to activate device.");
    }
  }, [loadLicenses, requestActorNote]);

  const handleReactivateDevice = useCallback(async (deviceCode: string) => {
    const actorNote = requestActorNote("Reactivate device");
    if (!actorNote) {
      return;
    }

    try {
      await adminReactivateDevice(deviceCode, actorNote, "billing-ui");
      toast.success(`Device ${deviceCode} reactivated.`);
      await loadLicenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to reactivate device.");
    }
  }, [loadLicenses, requestActorNote]);

  const handleTransferSeat = useCallback(async (deviceCode: string, sourceShopCode: string) => {
    const targetShopCode = promptRequired("Target shop code");
    if (!targetShopCode) {
      return;
    }

    if (targetShopCode.toLowerCase() === sourceShopCode.toLowerCase()) {
      toast.error("Target shop code must be different from source.");
      return;
    }

    const actorNote = requestActorNote("Transfer seat");
    if (!actorNote) {
      return;
    }

    try {
      await adminTransferDeviceSeat(deviceCode, targetShopCode, actorNote, "billing-ui");
      toast.success(`Device ${deviceCode} transferred to ${targetShopCode}.`);
      await loadLicenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to transfer seat.");
    }
  }, [loadLicenses, requestActorNote]);

  const handleExtendGrace = useCallback(async (deviceCode: string) => {
    const extendDaysRaw = promptRequired("Extend grace by days (1-30)", "3");
    if (!extendDaysRaw) {
      return;
    }

    const extendDays = Number(extendDaysRaw);
    if (!Number.isFinite(extendDays) || extendDays < 1 || extendDays > 30) {
      toast.error("Extension days must be between 1 and 30.");
      return;
    }

    const actorNote = requestActorNote("Extend grace");
    if (!actorNote) {
      return;
    }

    try {
      await adminExtendDeviceGrace(deviceCode, Math.round(extendDays), actorNote, "billing-ui");
      toast.success(`Grace extended for ${deviceCode}.`);
      await loadLicenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to extend grace.");
    }
  }, [loadLicenses, requestActorNote]);

  const handleEmergency = useCallback(async (deviceCode: string, action: "lock_device" | "revoke_token" | "force_reauth") => {
    const actorNote = requestActorNote(`Emergency action ${action}`);
    if (!actorNote) {
      return;
    }

    try {
      await runAdminEmergencyAction(deviceCode, action, actorNote, "billing-ui");
      toast.success(`Emergency action '${action}' executed for ${deviceCode}.`);
      await loadLicenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to run emergency action.");
    }
  }, [loadLicenses, requestActorNote]);

  const handleResyncShop = useCallback(async (shopCode: string) => {
    const actorNote = requestActorNote(`Resync shop ${shopCode}`);
    if (!actorNote) {
      return;
    }

    try {
      await adminForceLicenseResync(shopCode, actorNote, "billing-ui");
      toast.success(`Shop ${shopCode} resynced.`);
      await loadLicenses();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to resync shop.");
    }
  }, [loadLicenses, requestActorNote]);

  const handleExportAudit = useCallback(async (format: "csv" | "json") => {
    try {
      const result = await exportAdminLicenseAuditLogs({
        search: auditSearch || undefined,
        take: 300,
        format,
      });
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Audit logs exported (${format.toUpperCase()}).`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to export audit logs.");
    }
  }, [auditSearch]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto w-full max-w-[1400px] space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Billing Workspace</p>
              <h1 className="text-2xl font-bold tracking-tight">Invoices, Licenses, Audit</h1>
              <p className="text-sm text-muted-foreground">
                Signed in as <span className="font-medium">{username || "billing_admin"}</span>.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void refreshAll()} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh All"}
              </Button>
              <Button variant="outline" onClick={() => setShowSignOutConfirm(true)}>
                Sign Out
              </Button>
            </div>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="licenses">Licenses</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void handleCreateInvoice()}>Create Invoice</Button>
              <Button variant="outline" onClick={() => void handleRecordPayment()}>
                Record Payment
              </Button>
              <Button variant="outline" onClick={() => void loadInvoices()}>
                Reload Invoices
              </Button>
              <Badge variant="secondary">Invoices {invoices?.count ?? 0}</Badge>
              <Badge variant="secondary">Payments {payments?.count ?? 0}</Badge>
              <Badge variant={pendingPayments.length > 0 ? "destructive" : "secondary"}>
                Pending {pendingPayments.length}
              </Badge>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Recent Invoices</p>
              </div>
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
                  {(invoices?.items.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No invoices found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (invoices?.items ?? []).slice(0, 40).map((invoice) => (
                      <TableRow key={invoice.invoice_id}>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium">{invoice.invoice_number}</p>
                            <p className="text-xs text-muted-foreground">
                              Due {new Date(invoice.due_at).toLocaleDateString()}
                            </p>
                            {isMarketingBillingRecord(invoice.notes) && (
                              <Badge variant="outline" className="text-[10px]">Marketing</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{invoice.shop_code}</TableCell>
                        <TableCell className="text-right font-semibold">{money(invoice.amount_due)}</TableCell>
                        <TableCell className="capitalize">{invoice.status.replaceAll("_", " ")}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => void handleRecordPayment(invoice.invoice_number)}>
                            Record
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-3">
                <p className="text-sm font-semibold">Recent Payments</p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Payment</TableHead>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payments?.items.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        No payments found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (payments?.items ?? []).slice(0, 60).map((payment) => (
                      <TableRow key={payment.payment_id}>
                        <TableCell className="font-mono text-xs">{payment.payment_id.slice(0, 12)}</TableCell>
                        <TableCell>{payment.invoice_number}</TableCell>
                        <TableCell className="capitalize">{payment.method.replaceAll("_", " ")}</TableCell>
                        <TableCell>
                              <div className="space-y-1 text-xs">
                                <p>Ref: {payment.bank_reference || "-"}</p>
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
                                onClick={() => void handleVerifyPayment(payment.payment_id)}
                              >
                                Verify
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleRejectPayment(payment.payment_id)}
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
          </TabsContent>

          <TabsContent value="licenses" className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadLicenses()}>
                Reload Licenses
              </Button>
              <Badge variant="secondary">Shops {shops?.items.length ?? 0}</Badge>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shop</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Seat Usage</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(shops?.items ?? []).flatMap((shop) =>
                    shop.devices.map((device) => ({
                      shop,
                      device,
                    }))
                  ).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                        No provisioned devices found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (shops?.items ?? [])
                      .flatMap((shop) =>
                        shop.devices.map((device) => ({
                          shop,
                          device,
                        }))
                      )
                      .slice(0, 120)
                      .map(({ shop, device }) => (
                        <TableRow key={`${shop.shop_id}-${device.provisioned_device_id}`}>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{shop.shop_code}</p>
                              <p className="text-xs text-muted-foreground">{shop.subscription_status}</p>
                            </div>
                          </TableCell>
                          <TableCell>{shop.plan}</TableCell>
                          <TableCell>{shop.active_seats}/{shop.seat_limit}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <p className="font-medium">{device.device_name}</p>
                              <p className="text-xs text-muted-foreground">{device.device_code}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="capitalize">{device.device_status}</p>
                            <p className="text-xs text-muted-foreground capitalize">{device.license_state}</p>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={() => void handleResyncShop(shop.shop_code)}>
                                Resync
                              </Button>
                              {device.device_status.toLowerCase() === "active" ? (
                                <>
                                  <Button variant="outline" size="sm" onClick={() => void handleDeactivateDevice(device.device_code)}>
                                    Deactivate
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => void handleRevokeDevice(device.device_code)}>
                                    Revoke
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => void handleTransferSeat(device.device_code, shop.shop_code)}>
                                    Transfer
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => void handleExtendGrace(device.device_code)}>
                                    Extend Grace
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => void handleEmergency(device.device_code, "lock_device")}>
                                    Lock
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => void handleEmergency(device.device_code, "revoke_token")}>
                                    Revoke Token
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => void handleEmergency(device.device_code, "force_reauth")}>
                                    Force Reauth
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="outline" size="sm" onClick={() => void handleActivateDevice(device.device_code)}>
                                    Activate
                                  </Button>
                                  <Button variant="outline" size="sm" onClick={() => void handleReactivateDevice(device.device_code)}>
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
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                value={auditSearch}
                onChange={(event) => setAuditSearch(event.target.value)}
                placeholder="Search action, actor, reason, metadata"
                className="md:max-w-md"
              />
              <Button variant="outline" onClick={() => void loadAudit(auditSearch)} disabled={auditLoading}>
                {auditLoading ? "Searching..." : "Search"}
              </Button>
              <Button variant="outline" onClick={() => void handleExportAudit("csv")}>
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => void handleExportAudit("json")}>
                Export JSON
              </Button>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm">
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
                  {(auditLogs?.items.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No audit logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    (auditLogs?.items ?? []).map((event) => (
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
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmationDialog
        open={showSignOutConfirm}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setShowSignOutConfirm(false);
          }
        }}
        title="Sign out?"
        description="Are you sure you want to sign out of the billing workspace?"
        cancelLabel="Cancel"
        confirmLabel="Sign Out"
        confirmVariant="destructive"
        onCancel={() => setShowSignOutConfirm(false)}
        onConfirm={() => {
          setShowSignOutConfirm(false);
          onSignOut();
        }}
      />
    </div>
  );
};

export default BillingAdminWorkspace;
