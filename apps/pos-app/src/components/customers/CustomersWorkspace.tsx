import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Cake,
  Eye,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Power,
  Settings2,
  Star,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ApiError, requestJson } from "@/lib/api";
import { cn } from "@/lib/utils";
import CustomerSearchInput from "@/components/customers/CustomerSearchInput";

type PriceTier = {
  id: string;
  name: string;
  code: string;
  discountPercent: number;
  description?: string;
  isActive: boolean;
};

type CustomerLedgerEntry = {
  id: string;
  entryType: "Charge" | "Payment" | "Adjustment";
  description: string;
  amount: number;
  balanceAfter: number;
  occurredAtUtc: string;
};

type CustomerSale = {
  id: string;
  saleNumber: string;
  date: string;
  paymentMethod: "cash" | "card" | "bank_transfer";
  status: "completed" | "voided";
  loyaltyPointsEarned: number;
  loyaltyPointsRedeemed: number;
  total: number;
};

type Customer = {
  id: string;
  name: string;
  code: string;
  phone?: string;
  email?: string;
  address?: string;
  dateOfBirth?: string;
  priceTierId?: string;
  fixedDiscountPercent?: number | null;
  creditLimit: number;
  outstandingBalance: number;
  loyaltyPoints: number;
  notes?: string;
  tags: string[];
  isActive: boolean;
  createdAtUtc: string;
  sales: CustomerSale[];
  ledger: CustomerLedgerEntry[];
};

type BackendPriceTierResponse = {
  price_tier_id: string;
  name: string;
  code: string;
  discount_percent: number;
  description?: string | null;
  is_active: boolean;
  customer_count?: number;
  created_at?: string;
  updated_at?: string | null;
};

type BackendCustomerListItem = {
  customer_id: string;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  price_tier?: BackendPriceTierResponse | null;
  fixed_discount_percent?: number | null;
  credit_limit: number;
  outstanding_balance: number;
  loyalty_points: number;
  tags: string[];
  is_active: boolean;
  can_delete?: boolean;
  delete_block_reason?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type BackendCustomerListResponse = {
  items: BackendCustomerListItem[];
  total: number;
  page: number;
  take: number;
};

type BackendCustomerDetail = {
  customer_id: string;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  price_tier?: BackendPriceTierResponse | null;
  fixed_discount_percent?: number | null;
  credit_limit: number;
  outstanding_balance: number;
  loyalty_points: number;
  notes?: string | null;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at?: string | null;
};

type BackendCustomerSaleSummaryItem = {
  sale_id: string;
  sale_number: string;
  status: string;
  payment_method?: string | null;
  grand_total: number;
  loyalty_points_earned: number;
  loyalty_points_redeemed: number;
  created_at: string;
  completed_at?: string | null;
};

type BackendCustomerLedgerItem = {
  ledger_entry_id: string;
  customer_id: string;
  sale_id?: string | null;
  entry_type: string;
  amount: number;
  balance_after: number;
  description: string;
  reference?: string | null;
  recorded_by_user_id?: string | null;
  occurred_at: string;
  created_at: string;
};

type BackendCustomerLedgerResponse = {
  items: BackendCustomerLedgerItem[];
  total: number;
  page: number;
  take: number;
};

type BackendCreditLedgerEntry = {
  ledger_entry_id: string;
  customer_id: string;
  sale_id?: string | null;
  entry_type: string;
  amount: number;
  balance_after: number;
  description: string;
  reference?: string | null;
  recorded_by_user_id?: string | null;
  occurred_at: string;
  created_at: string;
};

function mapPriceTierResponse(item: BackendPriceTierResponse): PriceTier {
  return {
    id: item.price_tier_id,
    name: item.name,
    code: item.code,
    discountPercent: Number(item.discount_percent) || 0,
    description: item.description ?? undefined,
    isActive: item.is_active,
  };
}

function mapCustomerSummary(item: BackendCustomerListItem): Customer {
  return {
    id: item.customer_id,
    name: item.name,
    code: item.code,
    phone: item.phone ?? undefined,
    email: item.email ?? undefined,
    address: undefined,
    dateOfBirth: undefined,
    priceTierId: item.price_tier?.price_tier_id,
    fixedDiscountPercent: item.fixed_discount_percent ?? null,
    creditLimit: Number(item.credit_limit) || 0,
    outstandingBalance: Number(item.outstanding_balance) || 0,
    loyaltyPoints: Number(item.loyalty_points) || 0,
    notes: undefined,
    tags: item.tags ?? [],
    isActive: item.is_active,
    createdAtUtc: item.created_at,
    sales: [],
    ledger: [],
  };
}

function mapCustomerDetail(item: BackendCustomerDetail, existing?: Customer | null): Customer {
  return {
    id: item.customer_id,
    name: item.name,
    code: item.code,
    phone: item.phone ?? undefined,
    email: item.email ?? undefined,
    address: item.address ?? undefined,
    dateOfBirth: item.date_of_birth ?? undefined,
    priceTierId: item.price_tier?.price_tier_id ?? existing?.priceTierId,
    fixedDiscountPercent: item.fixed_discount_percent ?? null,
    creditLimit: Number(item.credit_limit) || 0,
    outstandingBalance: Number(item.outstanding_balance) || 0,
    loyaltyPoints: Number(item.loyalty_points) || 0,
    notes: item.notes ?? undefined,
    tags: item.tags ?? [],
    isActive: item.is_active,
    createdAtUtc: item.created_at,
    sales: existing?.sales ?? [],
    ledger: existing?.ledger ?? [],
  };
}

function mapCustomerSale(item: BackendCustomerSaleSummaryItem): CustomerSale {
  return {
    id: item.sale_id,
    saleNumber: item.sale_number,
    date: item.completed_at ?? item.created_at,
    paymentMethod: (item.payment_method ?? "cash") as CustomerSale["paymentMethod"],
    status: (item.status ?? "completed") as CustomerSale["status"],
    loyaltyPointsEarned: Number(item.loyalty_points_earned) || 0,
    loyaltyPointsRedeemed: Number(item.loyalty_points_redeemed) || 0,
    total: Number(item.grand_total) || 0,
  };
}

function mapCustomerLedger(item: BackendCustomerLedgerItem): CustomerLedgerEntry {
  return {
    id: item.ledger_entry_id,
    entryType: (item.entry_type.charAt(0).toUpperCase() + item.entry_type.slice(1)) as CustomerLedgerEntry["entryType"],
    description: item.description,
    amount: Number(item.amount) || 0,
    balanceAfter: Number(item.balance_after) || 0,
    occurredAtUtc: item.occurred_at,
  };
}

function normalizeOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toCustomerRequestBody(customerInput: CustomerFormValue) {
  return {
    name: customerInput.name.trim(),
    code: normalizeOptionalString(customerInput.code),
    phone: normalizeOptionalString(customerInput.phone),
    email: normalizeOptionalString(customerInput.email),
    address: normalizeOptionalString(customerInput.address),
    date_of_birth: customerInput.dateOfBirth || null,
    price_tier_id: customerInput.priceTierId ?? null,
    fixed_discount_percent: customerInput.fixedDiscountPercent ?? null,
    credit_limit: customerInput.creditLimit,
    notes: normalizeOptionalString(customerInput.notes),
    tags: customerInput.tags,
    is_active: customerInput.isActive,
  };
}

function toTierRequestBody(tierInput: TierFormValue) {
  return {
    name: tierInput.name.trim(),
    code: tierInput.code.trim().toUpperCase(),
    discount_percent: tierInput.discountPercent,
    description: normalizeOptionalString(tierInput.description),
    is_active: tierInput.isActive,
  };
}

async function fetchCustomerPriceTiers(): Promise<PriceTier[]> {
  const response = await requestJson<BackendPriceTierResponse[]>("/api/customer-price-tiers");
  return response.map(mapPriceTierResponse);
}

async function fetchCustomerDirectory(): Promise<Customer[]> {
  const pageSize = 100;
  const firstPage = await requestJson<BackendCustomerListResponse>(
    `/api/customers?include_inactive=true&page=1&take=${pageSize}`
  );
  const totalPages = Math.max(1, Math.ceil(firstPage.total / firstPage.take));
  const items = [...firstPage.items];

  if (totalPages > 1) {
    const remainingPages = await Promise.all(
      Array.from({ length: totalPages - 1 }, async (_unused, index) =>
        requestJson<BackendCustomerListResponse>(
          `/api/customers?include_inactive=true&page=${index + 2}&take=${pageSize}`
        )
      )
    );

    for (const page of remainingPages) {
      items.push(...page.items);
    }
  }

  return items.map(mapCustomerSummary);
}

async function fetchCustomerDetails(customerId: string, existing?: Customer | null): Promise<Customer> {
  const [detail, sales, ledger] = await Promise.all([
    requestJson<BackendCustomerDetail>(`/api/customers/${encodeURIComponent(customerId)}`),
    requestJson<BackendCustomerSaleSummaryItem[]>(`/api/customers/${encodeURIComponent(customerId)}/sales?take=20`),
    requestJson<BackendCustomerLedgerResponse>(
      `/api/customers/${encodeURIComponent(customerId)}/credit-ledger?page=1&take=20`
    ),
  ]);

  return {
    ...mapCustomerDetail(detail, existing),
    sales: sales.map(mapCustomerSale),
    ledger: ledger.items.map(mapCustomerLedger),
  };
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat("en-LK").format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-LK", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));

function computeEffectiveDiscount(customer: Customer, tiers: PriceTier[]) {
  return customer.fixedDiscountPercent ?? tiers.find((tier) => tier.id === customer.priceTierId)?.discountPercent ?? 0;
}

export default function CustomersWorkspace() {
  const [tiers, setTiers] = useState<PriceTier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activeTab, setActiveTab] = useState<"directory" | "tiers">("directory");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingTier, setEditingTier] = useState<PriceTier | null>(null);
  const [tierEditorOpen, setTierEditorOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [deleteTierTarget, setDeleteTierTarget] = useState<PriceTier | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null);
  const [loadedDetailIds, setLoadedDetailIds] = useState<Record<string, boolean>>({});
  const [alertState, setAlertState] = useState<{ title: string; description: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const selectedCustomer = customers.find((customer) => customer.id === detailId) ?? null;

  useEffect(() => {
    let cancelled = false;

    const loadWorkspace = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const [nextTiers, nextCustomers] = await Promise.all([fetchCustomerPriceTiers(), fetchCustomerDirectory()]);
        if (cancelled) {
          return;
        }

        setTiers(nextTiers);
        setCustomers(nextCustomers);
        setLoadedDetailIds({});
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(error instanceof ApiError ? error.message : "Unable to load customer data from the backend.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadWorkspace();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!detailId || loadedDetailIds[detailId]) {
      return;
    }

    let cancelled = false;

    const loadDetails = async () => {
      setDetailLoadingId(detailId);

      try {
        const customer = await fetchCustomerDetails(detailId, selectedCustomer);
        if (cancelled) {
          return;
        }

        setCustomers((previous) => previous.map((item) => (item.id === detailId ? customer : item)));
        setLoadedDetailIds((previous) => ({ ...previous, [detailId]: true }));
      } catch (error) {
        if (cancelled) {
          return;
        }

        setLoadError(error instanceof ApiError ? error.message : "Unable to load the selected customer.");
        setDetailId(null);
      } finally {
        if (!cancelled) {
          setDetailLoadingId(null);
        }
      }
    };

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [detailId, loadedDetailIds, selectedCustomer]);

  const upsertCustomer = async (customerInput: CustomerFormValue) => {
    try {
      const method = customerInput.id ? "PUT" : "POST";
      const path = customerInput.id ? `/api/customers/${encodeURIComponent(customerInput.id)}` : "/api/customers";
      const response = await requestJson<BackendCustomerDetail>(path, {
        method,
        body: JSON.stringify(toCustomerRequestBody(customerInput)),
      });

      const nextCustomer = mapCustomerDetail(response, customers.find((item) => item.id === response.customer_id) ?? null);
      setCustomers((previous) => {
        const next = [...previous];
        const existingIndex = next.findIndex((item) => item.id === nextCustomer.id);

        if (existingIndex >= 0) {
          const current = next[existingIndex];
          next[existingIndex] = {
            ...nextCustomer,
            sales: current.sales,
            ledger: current.ledger,
          };
          return next;
        }

        return [nextCustomer, ...next];
      });

      setLoadedDetailIds((previous) => ({ ...previous, [nextCustomer.id]: true }));
    } catch (error) {
      setAlertState({
        title: customerInput.id ? "Unable to save customer" : "Unable to create customer",
        description: error instanceof ApiError ? error.message : "The customer request could not be completed.",
      });
    }
  };

  const openCustomerEditor = async (customer: Customer) => {
    if (loadedDetailIds[customer.id]) {
      setEditingCustomer(customer);
      setEditorOpen(true);
      return;
    }

    try {
      const fullCustomer = await fetchCustomerDetails(customer.id, customer);
      setCustomers((previous) => previous.map((item) => (item.id === fullCustomer.id ? fullCustomer : item)));
      setLoadedDetailIds((previous) => ({ ...previous, [fullCustomer.id]: true }));
      setEditingCustomer(fullCustomer);
      setEditorOpen(true);
    } catch (error) {
      setAlertState({
        title: "Unable to open customer editor",
        description: error instanceof ApiError ? error.message : "The customer details could not be loaded.",
      });
    }
  };

  const deleteCustomer = async (id: string) => {
    try {
      await requestJson<void>(`/api/customers/${encodeURIComponent(id)}/hard-delete`, {
        method: "DELETE",
      });
      setCustomers((previous) => previous.filter((customer) => customer.id !== id));
      setDetailId((current) => (current === id ? null : current));
      setLoadedDetailIds((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
    } catch (error) {
      setAlertState({
        title: "Cannot delete customer",
        description: error instanceof ApiError ? error.message : "The customer could not be deleted.",
      });
    }
  };

  const toggleCustomerActive = async (id: string) => {
    try {
      const response = await requestJson<BackendCustomerDetail>(`/api/customers/${encodeURIComponent(id)}/toggle-active`, {
        method: "PATCH",
      });
      const nextCustomer = mapCustomerDetail(response, customers.find((item) => item.id === id) ?? null);
      setCustomers((previous) => previous.map((customer) => (customer.id === id ? { ...nextCustomer, sales: customer.sales, ledger: customer.ledger } : customer)));
      setLoadedDetailIds((previous) => ({ ...previous, [id]: true }));
    } catch (error) {
      setAlertState({
        title: "Unable to update customer",
        description: error instanceof ApiError ? error.message : "The customer status could not be updated.",
      });
    }
  };

  const recordCreditPayment = async (customerId: string, amount: number, description: string) => {
    try {
      const entry = await requestJson<BackendCreditLedgerEntry>(`/api/customers/${encodeURIComponent(customerId)}/credit-payments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          description,
          reference: null,
        }),
      });

      const mappedEntry = mapCustomerLedger(entry);
      setCustomers((previous) =>
        previous.map((customer) =>
          customer.id === customerId
            ? {
                ...customer,
                outstandingBalance: mappedEntry.balanceAfter,
                ledger: [mappedEntry, ...customer.ledger],
              }
            : customer
        )
      );
      setLoadedDetailIds((previous) => ({ ...previous, [customerId]: true }));
    } catch (error) {
      setAlertState({
        title: "Unable to record payment",
        description: error instanceof ApiError ? error.message : "The credit payment could not be saved.",
      });
    }
  };

  const applyManualAdjustment = async (customerId: string, amount: number, description: string) => {
    try {
      const entry = await requestJson<BackendCreditLedgerEntry>(`/api/customers/${encodeURIComponent(customerId)}/credit-adjustments`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          description,
          reference: null,
        }),
      });

      const mappedEntry = mapCustomerLedger(entry);
      setCustomers((previous) =>
        previous.map((customer) =>
          customer.id === customerId
            ? {
                ...customer,
                outstandingBalance: mappedEntry.balanceAfter,
                ledger: [mappedEntry, ...customer.ledger],
              }
            : customer
        )
      );
      setLoadedDetailIds((previous) => ({ ...previous, [customerId]: true }));
    } catch (error) {
      setAlertState({
        title: "Unable to apply adjustment",
        description: error instanceof ApiError ? error.message : "The credit adjustment could not be saved.",
      });
    }
  };

  const upsertTier = async (tierInput: TierFormValue) => {
    try {
      const method = tierInput.id ? "PUT" : "POST";
      const path = tierInput.id ? `/api/customer-price-tiers/${encodeURIComponent(tierInput.id)}` : "/api/customer-price-tiers";
      const response = await requestJson<BackendPriceTierResponse>(path, {
        method,
        body: JSON.stringify(toTierRequestBody(tierInput)),
      });

      const nextTier = mapPriceTierResponse(response);
      setTiers((previous) => {
        const next = [...previous];
        const existingIndex = next.findIndex((tier) => tier.id === nextTier.id);

        if (existingIndex >= 0) {
          next[existingIndex] = nextTier;
          return next;
        }

        return [nextTier, ...next];
      });
    } catch (error) {
      setAlertState({
        title: tierInput.id ? "Unable to save tier" : "Unable to create tier",
        description: error instanceof ApiError ? error.message : "The price tier request could not be completed.",
      });
    }
  };

  const deleteTier = async (id: string) => {
    try {
      await requestJson<void>(`/api/customer-price-tiers/${encodeURIComponent(id)}/hard-delete`, {
        method: "DELETE",
      });
      setTiers((previous) => previous.filter((tier) => tier.id !== id));
    } catch (error) {
      setAlertState({
        title: "Cannot delete tier",
        description: error instanceof ApiError ? error.message : "The price tier could not be deleted.",
      });
    }
  };

  return (
    <>
      {loadError && (
        <Card className="border-destructive/30 bg-destructive/5 text-destructive">
          <CardContent className="py-4 text-sm">{loadError}</CardContent>
        </Card>
      )}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 border border-border/60 bg-secondary/60 md:w-fit">
          <TabsTrigger value="directory">Directory</TabsTrigger>
          <TabsTrigger value="tiers">Price Tiers</TabsTrigger>
        </TabsList>

        <TabsContent value="directory" className="mt-0">
          <DirectoryPanel
            customers={customers}
            tiers={tiers}
            loading={isLoading}
            onCreate={() => {
              setEditingCustomer(null);
              setEditorOpen(true);
            }}
            onEdit={(customer) => {
              void openCustomerEditor(customer);
            }}
            onToggleActive={toggleCustomerActive}
            onDelete={setDeleteCustomerTarget}
            onOpenDetails={setDetailId}
          />
        </TabsContent>

        <TabsContent value="tiers" className="mt-0">
          <TiersPanel
            tiers={tiers}
            customers={customers}
            loading={isLoading}
            onCreate={() => {
              setEditingTier(null);
              setTierEditorOpen(true);
            }}
            onEdit={(tier) => {
              setEditingTier(tier);
              setTierEditorOpen(true);
            }}
            onDelete={setDeleteTierTarget}
          />
        </TabsContent>

        <CustomerEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          initial={editingCustomer}
          tiers={tiers}
          onSubmit={upsertCustomer}
        />

        <TierEditorDialog
          open={tierEditorOpen}
          onOpenChange={setTierEditorOpen}
          initial={editingTier}
          onSubmit={upsertTier}
        />

        <Sheet open={selectedCustomer !== null} onOpenChange={(open) => !open && setDetailId(null)}>
          <SheetContent side="right" className="w-full max-w-2xl overflow-y-auto sm:max-w-2xl">
            {selectedCustomer && detailLoadingId === selectedCustomer.id && (
              <div className="mb-4 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Loading customer details from the backend...
              </div>
            )}
            {selectedCustomer && (
              <CustomerDetailContent
                customer={selectedCustomer}
                tiers={tiers}
                onRecordPayment={recordCreditPayment}
                onApplyAdjustment={applyManualAdjustment}
              />
            )}
          </SheetContent>
        </Sheet>

        <ConfirmationDialog
          open={deleteCustomerTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteCustomerTarget(null);
            }
          }}
          title="Delete customer?"
          description={
            deleteCustomerTarget
              ? `Delete ${deleteCustomerTarget.name}? This will remove the customer from the directory.`
              : undefined
          }
          confirmLabel="Delete"
          confirmVariant="destructive"
          onCancel={() => setDeleteCustomerTarget(null)}
          onConfirm={() => {
            if (!deleteCustomerTarget) {
              setDeleteCustomerTarget(null);
              return;
            }

            void deleteCustomer(deleteCustomerTarget.id);
            setDeleteCustomerTarget(null);
          }}
        />

        <ConfirmationDialog
          open={deleteTierTarget !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTierTarget(null);
            }
          }}
          title="Delete price tier?"
          description={
            deleteTierTarget
              ? `Delete ${deleteTierTarget.name}? This action cannot be undone.`
              : undefined
          }
          confirmLabel="Delete"
          confirmVariant="destructive"
          onCancel={() => setDeleteTierTarget(null)}
          onConfirm={() => {
            if (!deleteTierTarget) {
              setDeleteTierTarget(null);
              return;
            }

            void deleteTier(deleteTierTarget.id);
            setDeleteTierTarget(null);
          }}
        />

        <AlertDialog open={alertState !== null} onOpenChange={(open) => !open && setAlertState(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{alertState?.title ?? "Action failed"}</AlertDialogTitle>
              <AlertDialogDescription>{alertState?.description ?? "The operation could not be completed."}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => setAlertState(null)}>OK</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Tabs>
    </>
  );
}

function DirectoryPanel({
  customers,
  tiers,
  loading,
  onCreate,
  onEdit,
  onToggleActive,
  onDelete,
  onOpenDetails,
}: {
  customers: Customer[];
  tiers: PriceTier[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (customer: Customer) => void;
  onToggleActive: (id: string) => void;
  onDelete: (customer: Customer) => void;
  onOpenDetails: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (!showInactive && !customer.isActive) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [customer.name, customer.code, customer.phone ?? "", customer.email ?? ""].some((field) =>
        field.toLowerCase().includes(query)
      );
    });
  }, [customers, search, showInactive]);

  return (
    <Card className="border-border/60 shadow-[var(--shadow-soft)]">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold">Customer Directory</CardTitle>
          <Button onClick={onCreate} className="gap-1">
            <Plus className="h-4 w-4" />
            New customer
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CustomerSearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search name, code, phone, email..."
            wrapperClassName="max-w-sm flex-1"
            className="pl-8"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="h-4 w-4"
            />
            Show inactive
          </label>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Discount</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead className="text-right">Loyalty</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && filteredCustomers.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                  Loading customers from the backend...
                </TableCell>
              </TableRow>
            )}
            {!loading && filteredCustomers.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="h-24 text-center text-sm text-muted-foreground">
                  No customers match.
                </TableCell>
              </TableRow>
            )}
            {filteredCustomers.map((customer) => {
              const tier = tiers.find((item) => item.id === customer.priceTierId);
              const discount = computeEffectiveDiscount(customer, tiers);

              return (
                <TableRow key={customer.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {customer.name
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{customer.name}</div>
                        <div className="text-xs text-muted-foreground">{customer.email ?? "Not provided"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{customer.code}</TableCell>
                  <TableCell className="text-sm">{customer.phone ?? "Not provided"}</TableCell>
                  <TableCell>{tier ? <Badge variant="outline">{tier.name}</Badge> : <span className="text-xs text-muted-foreground">None</span>}</TableCell>
                  <TableCell>
                    {discount > 0 ? <span className="text-sm font-semibold text-primary">{discount}%</span> : <span className="text-xs text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className={cn("text-right text-sm font-medium", customer.outstandingBalance > 0 && "text-destructive")}>
                    {formatCurrency(customer.outstandingBalance)}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3 w-3 fill-[var(--warning)] text-[var(--warning)]" />
                      {formatNumber(customer.loyaltyPoints)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {customer.isActive ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenDetails(customer.id)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(customer)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onToggleActive(customer.id)}>
                        <Power className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => {
                          onDelete(customer);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CustomerDetailContent({
  customer,
  tiers,
  onRecordPayment,
  onApplyAdjustment,
}: {
  customer: Customer;
  tiers: PriceTier[];
  onRecordPayment: (customerId: string, amount: number, description: string) => void;
  onApplyAdjustment: (customerId: string, amount: number, description: string) => void;
}) {
  const tier = tiers.find((item) => item.id === customer.priceTierId);
  const effectiveDiscount = computeEffectiveDiscount(customer, tiers);

  return (
    <>
      <SheetHeader className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[var(--gradient-primary)] text-base font-semibold text-primary-foreground">
            {customer.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </div>
          <div>
            <SheetTitle className="text-xl">{customer.name}</SheetTitle>
            <SheetDescription className="font-mono text-xs">{customer.code}</SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tier && <Badge variant="outline">{tier.name} tier</Badge>}
          {effectiveDiscount > 0 && <Badge variant="secondary" className="text-primary">{effectiveDiscount}% discount</Badge>}
          {customer.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
      </SheetHeader>

      <Tabs defaultValue="profile" className="mt-4">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="credit">Credit</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="space-y-3">
          <div className="grid gap-2 rounded-lg border border-border bg-card p-4 text-sm">
            <InfoRow icon={ArrowLeft} label="Customer code" value={customer.code} />
            <InfoRow icon={Mail} label="Email" value={customer.email ?? "-"} />
            <InfoRow icon={MapPin} label="Address" value={customer.address ?? "-"} />
            <InfoRow icon={Cake} label="Birthday" value={customer.dateOfBirth ?? "-"} />
            <InfoRow icon={Star} label="Loyalty points" value={`${formatNumber(customer.loyaltyPoints)} pts`} />
            <InfoRow icon={StickyNote} label="Notes" value={customer.notes ?? "-"} />
          </div>
        </TabsContent>
        <TabsContent value="sales">
          <CustomerSalesHistoryPanel customer={customer} />
        </TabsContent>
        <TabsContent value="credit">
          <CustomerCreditPanel
            customer={customer}
            onRecordPayment={onRecordPayment}
            onApplyAdjustment={onApplyAdjustment}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

function CustomerSalesHistoryPanel({ customer }: { customer: Customer }) {
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sale #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Loyalty</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customer.sales.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="h-20 text-center text-sm text-muted-foreground">
                No sales yet.
              </TableCell>
            </TableRow>
          )}
          {customer.sales.map((sale) => (
            <TableRow key={sale.id}>
              <TableCell className="font-mono text-xs">#{sale.saleNumber}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{formatDate(sale.date)}</TableCell>
              <TableCell>
                <Badge variant="outline" className="uppercase">
                  {sale.paymentMethod}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={sale.status === "completed" ? "secondary" : "outline"}>{sale.status}</Badge>
              </TableCell>
              <TableCell className="text-right text-xs">
                +{sale.loyaltyPointsEarned} / -{sale.loyaltyPointsRedeemed}
              </TableCell>
              <TableCell className="text-right font-semibold">{formatCurrency(sale.total)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

function CustomerCreditPanel({
  customer,
  onRecordPayment,
  onApplyAdjustment,
}: {
  customer: Customer;
  onRecordPayment: (customerId: string, amount: number, description: string) => void;
  onApplyAdjustment: (customerId: string, amount: number, description: string) => void;
}) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDescription, setPaymentDescription] = useState("");
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentDescription, setAdjustmentDescription] = useState("");

  useEffect(() => {
    setPaymentAmount("");
    setPaymentDescription("");
    setShowAdjustment(false);
    setAdjustmentAmount("");
    setAdjustmentDescription("");
  }, [customer.id]);

  const availableCredit = Math.max(0, customer.creditLimit - customer.outstandingBalance);
  const utilization = customer.creditLimit > 0 ? customer.outstandingBalance / customer.creditLimit : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Credit limit" value={formatCurrency(customer.creditLimit)} />
        <StatCard
          label="Outstanding"
          value={formatCurrency(customer.outstandingBalance)}
          accent={utilization >= 0.8 ? "text-destructive" : undefined}
        />
        <StatCard label="Available" value={formatCurrency(availableCredit)} accent="text-[var(--success)]" />
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={cn("h-full transition-all", utilization >= 0.8 ? "bg-destructive" : "bg-primary")}
          style={{ width: `${Math.min(100, utilization * 100)}%` }}
        />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs">Payment amount (LKR)</Label>
            <Input
              type="number"
              min={0}
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input
              value={paymentDescription}
              onChange={(event) => setPaymentDescription(event.target.value)}
              placeholder="Cash payment received"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => {
                const amount = Number(paymentAmount);
                if (!amount || amount <= 0) {
                  return;
                }

                onRecordPayment(customer.id, amount, paymentDescription);
                setPaymentAmount("");
                setPaymentDescription("");
              }}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Record payment
            </Button>
          </div>
        </div>

        <button
          onClick={() => setShowAdjustment((value) => !value)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {showAdjustment ? "Hide" : "Manual adjustment"}
        </button>

        {showAdjustment && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label className="text-xs">Adjustment (+ charge / - credit)</Label>
              <Input
                type="number"
                value={adjustmentAmount}
                onChange={(event) => setAdjustmentAmount(event.target.value)}
                placeholder="e.g. -500 to credit"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Input
                value={adjustmentDescription}
                onChange={(event) => setAdjustmentDescription(event.target.value)}
                placeholder="Manager override"
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  const amount = Number(adjustmentAmount);
                  if (!amount) {
                    return;
                  }

                  onApplyAdjustment(customer.id, amount, adjustmentDescription);
                  setAdjustmentAmount("");
                  setAdjustmentDescription("");
                  setShowAdjustment(false);
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Balance after</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customer.ledger.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-20 text-center text-sm text-muted-foreground">
                  No credit activity yet.
                </TableCell>
              </TableRow>
            )}
            {customer.ledger.map((entry) => {
              const isCharge = entry.entryType === "Charge" || (entry.entryType === "Adjustment" && entry.amount > 0);

              return (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant={isCharge ? "destructive" : "secondary"} className="gap-1">
                      {isCharge ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {entry.entryType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{entry.description}</TableCell>
                  <TableCell className={cn("text-right font-medium", isCharge ? "text-destructive" : "text-[var(--success)]")}>
                    {isCharge ? "+" : "-"}
                    {formatCurrency(Math.abs(entry.amount))}
                  </TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(entry.balanceAfter)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(entry.occurredAtUtc)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function TiersPanel({
  tiers,
  customers,
  loading,
  onCreate,
  onEdit,
  onDelete,
}: {
  tiers: PriceTier[];
  customers: Customer[];
  loading: boolean;
  onCreate: () => void;
  onEdit: (tier: PriceTier) => void;
  onDelete: (tier: PriceTier) => void;
}) {
  return (
    <Card className="border-border/60 shadow-[var(--shadow-soft)]">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">Price Tiers</CardTitle>
        <Button onClick={onCreate} className="gap-1">
          <Plus className="h-4 w-4" />
          New tier
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Customers</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && tiers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  Loading price tiers from the backend...
                </TableCell>
              </TableRow>
            )}
            {!loading && tiers.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                  No price tiers available.
                </TableCell>
              </TableRow>
            )}
            {tiers.map((tier) => {
              const count = customers.filter((customer) => customer.priceTierId === tier.id).length;

              return (
                <TableRow key={tier.id}>
                  <TableCell className="font-medium">{tier.name}</TableCell>
                  <TableCell className="font-mono text-xs">{tier.code}</TableCell>
                  <TableCell className="text-right font-semibold text-primary">{tier.discountPercent}%</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{tier.description ?? "-"}</TableCell>
                  <TableCell className="text-right text-sm">{count}</TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(tier)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => onDelete(tier)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

type CustomerFormValue = Omit<Customer, "id" | "createdAtUtc"> & {
  id?: string;
  createdAtUtc?: string;
};

type TierFormValue = Omit<PriceTier, "id"> & {
  id?: string;
};

function CustomerEditorDialog({
  open,
  onOpenChange,
  initial,
  tiers,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Customer | null;
  tiers: PriceTier[];
  onSubmit: (customer: CustomerFormValue) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [dob, setDob] = useState("");
  const [tierId, setTierId] = useState("none");
  const [fixedDiscount, setFixedDiscount] = useState("");
  const [creditLimit, setCreditLimit] = useState("0");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(initial?.name ?? "");
    setCode(initial?.code ?? "");
    setPhone(initial?.phone ?? "");
    setEmail(initial?.email ?? "");
    setAddress(initial?.address ?? "");
    setDob(initial?.dateOfBirth ?? "");
    setTierId(initial?.priceTierId ?? "none");
    setFixedDiscount(initial?.fixedDiscountPercent != null ? String(initial.fixedDiscountPercent) : "");
    setCreditLimit(String(initial?.creditLimit ?? 0));
    setNotes(initial?.notes ?? "");
    setTags(initial?.tags ?? []);
    setTagInput("");
    setIsActive(initial?.isActive ?? true);
  }, [initial, open]);

  const addTag = () => {
    const normalizedTag = tagInput.trim();
    if (!normalizedTag || tags.includes(normalizedTag)) {
      return;
    }

    setTags((previous) => [...previous, normalizedTag]);
    setTagInput("");
  };

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    onSubmit({
      id: initial?.id,
      name: trimmedName,
      code: code.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      dateOfBirth: dob || undefined,
      priceTierId: tierId === "none" ? undefined : tierId,
      fixedDiscountPercent: fixedDiscount === "" ? null : Number(fixedDiscount),
      creditLimit: Number(creditLimit) || 0,
      outstandingBalance: initial?.outstandingBalance ?? 0,
      loyaltyPoints: initial?.loyaltyPoints ?? 0,
      notes: notes.trim(),
      tags,
      isActive,
      sales: initial?.sales ?? [],
      ledger: initial?.ledger ?? [],
      createdAtUtc: initial?.createdAtUtc,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-4 w-[calc(100vw-2rem)] max-w-2xl translate-y-0 max-h-[calc(100vh-2rem)] overflow-y-auto sm:top-[50%] sm:w-full sm:translate-y-[-50%]">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit customer" : "New customer"}</DialogTitle>
          <DialogDescription>Profile, tier, discount, credit and loyalty details.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name *">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Code (auto if blank)">
            <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="C-0005" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
          </Field>
          <Field label="Email">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <Input value={address} onChange={(event) => setAddress(event.target.value)} />
          </Field>
          <Field label="Date of birth">
            <Input type="date" value={dob} onChange={(event) => setDob(event.target.value)} />
          </Field>
          <Field label="Price tier">
            <select
              value={tierId}
              onChange={(event) => setTierId(event.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="none">- None -</option>
              {tiers.map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {tier.name} ({tier.discountPercent}%)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fixed discount % (override)">
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={fixedDiscount}
              onChange={(event) => setFixedDiscount(event.target.value)}
              placeholder="-"
            />
          </Field>
          <Field label="Credit limit (LKR)">
            <Input type="number" min={0} value={creditLimit} onChange={(event) => setCreditLimit(event.target.value)} />
          </Field>
          <Field label="Tags" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input p-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <button type="button" onClick={() => setTags((previous) => previous.filter((value) => value !== tag))}>
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              <input
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Add tag and press Enter"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="h-4 w-4" />
            Active
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{initial ? "Save changes" : "Create customer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TierEditorDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: PriceTier | null;
  onSubmit: (tier: TierFormValue) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [discount, setDiscount] = useState("0");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) {
      return;
    }

    setName(initial?.name ?? "");
    setCode(initial?.code ?? "");
    setDiscount(String(initial?.discountPercent ?? 0));
    setDescription(initial?.description ?? "");
    setIsActive(initial?.isActive ?? true);
  }, [initial, open]);

  const submit = () => {
    if (!name.trim() || !code.trim()) {
      return;
    }

    onSubmit({
      id: initial?.id,
      name: name.trim(),
      code: code.trim().toUpperCase(),
      discountPercent: Number(discount) || 0,
      description: description.trim(),
      isActive,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-4 w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto translate-y-0 sm:top-[50%] sm:w-full sm:translate-y-[-50%]">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit tier" : "New price tier"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Code">
            <Input value={code} onChange={(event) => setCode(event.target.value)} placeholder="GLD" />
          </Field>
          <Field label="Discount %">
            <Input type="number" min={0} max={100} step="0.01" value={discount} onChange={(event) => setDiscount(event.target.value)} />
          </Field>
          <Field label="Status">
            <select
              value={isActive ? "1" : "0"}
              onChange={(event) => setIsActive(event.target.value === "1")}
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="1">Active</option>
              <option value="0">Inactive</option>
            </select>
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Input value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit}>{initial ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold", accent)}>{value}</div>
    </Card>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" />
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </div>
  );
}
