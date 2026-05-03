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
  Search,
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
import { cn } from "@/lib/utils";

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

const seedTiers: PriceTier[] = [
  { id: "tier-gold", name: "Gold", code: "GLD", discountPercent: 8, description: "Preferred repeat buyers", isActive: true },
  { id: "tier-silver", name: "Silver", code: "SLV", discountPercent: 5, description: "Regular customers", isActive: true },
  { id: "tier-basic", name: "Basic", code: "BSC", discountPercent: 0, description: "Default tier", isActive: true },
];

const seedCustomers: Customer[] = [
  {
    id: "cus-001",
    name: "Nadeesha Perera",
    code: "C-1001",
    phone: "+94 77 123 4567",
    email: "nadeesha@example.com",
    address: "Colombo 05",
    dateOfBirth: "1991-08-12",
    priceTierId: "tier-gold",
    fixedDiscountPercent: null,
    creditLimit: 50000,
    outstandingBalance: 12500,
    loyaltyPoints: 840,
    notes: "Prefers monthly invoicing.",
    tags: ["wholesale", "priority"],
    isActive: true,
    createdAtUtc: "2026-04-12T08:30:00.000Z",
    sales: [
      {
        id: "sale-10021",
        saleNumber: "10021",
        date: "2026-05-01T07:15:00.000Z",
        paymentMethod: "card",
        status: "completed",
        loyaltyPointsEarned: 36,
        loyaltyPointsRedeemed: 0,
        total: 14500,
      },
      {
        id: "sale-10003",
        saleNumber: "10003",
        date: "2026-04-18T10:00:00.000Z",
        paymentMethod: "cash",
        status: "completed",
        loyaltyPointsEarned: 18,
        loyaltyPointsRedeemed: 10,
        total: 7200,
      },
    ],
    ledger: [
      {
        id: "ledger-1",
        entryType: "Charge",
        description: "April bulk order",
        amount: 15000,
        balanceAfter: 15000,
        occurredAtUtc: "2026-04-18T10:00:00.000Z",
      },
      {
        id: "ledger-2",
        entryType: "Payment",
        description: "Bank transfer received",
        amount: -2500,
        balanceAfter: 12500,
        occurredAtUtc: "2026-04-20T12:15:00.000Z",
      },
    ],
  },
  {
    id: "cus-002",
    name: "Tharindu Fernando",
    code: "C-1002",
    phone: "+94 71 555 8899",
    email: "tharindu@example.com",
    address: "Kandy",
    dateOfBirth: "1987-11-30",
    priceTierId: "tier-silver",
    fixedDiscountPercent: 2,
    creditLimit: 25000,
    outstandingBalance: 0,
    loyaltyPoints: 210,
    notes: "Walk-in retail customer.",
    tags: ["retail"],
    isActive: true,
    createdAtUtc: "2026-04-22T11:10:00.000Z",
    sales: [
      {
        id: "sale-10039",
        saleNumber: "10039",
        date: "2026-05-02T09:25:00.000Z",
        paymentMethod: "cash",
        status: "completed",
        loyaltyPointsEarned: 12,
        loyaltyPointsRedeemed: 0,
        total: 4800,
      },
    ],
    ledger: [
      {
        id: "ledger-3",
        entryType: "Payment",
        description: "Previous balance cleared",
        amount: -8000,
        balanceAfter: 0,
        occurredAtUtc: "2026-04-27T13:45:00.000Z",
      },
    ],
  },
  {
    id: "cus-003",
    name: "Sahan Industries",
    code: "C-1003",
    phone: "+94 11 234 0000",
    email: "accounts@sahan-industries.lk",
    address: "Borella",
    priceTierId: "tier-basic",
    fixedDiscountPercent: null,
    creditLimit: 100000,
    outstandingBalance: 42000,
    loyaltyPoints: 1320,
    notes: "Credit review every Friday.",
    tags: ["corporate", "credit"],
    isActive: true,
    createdAtUtc: "2026-03-28T06:00:00.000Z",
    sales: [
      {
        id: "sale-9988",
        saleNumber: "9988",
        date: "2026-04-30T14:05:00.000Z",
        paymentMethod: "bank_transfer",
        status: "completed",
        loyaltyPointsEarned: 55,
        loyaltyPointsRedeemed: 0,
        total: 27500,
      },
      {
        id: "sale-9920",
        saleNumber: "9920",
        date: "2026-04-11T08:20:00.000Z",
        paymentMethod: "bank_transfer",
        status: "voided",
        loyaltyPointsEarned: 0,
        loyaltyPointsRedeemed: 0,
        total: 19000,
      },
    ],
    ledger: [
      {
        id: "ledger-4",
        entryType: "Charge",
        description: "Monthly supply invoice",
        amount: 42000,
        balanceAfter: 42000,
        occurredAtUtc: "2026-05-01T15:00:00.000Z",
      },
    ],
  },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-LK", { style: "currency", currency: "LKR", maximumFractionDigits: 0 }).format(value);

const formatNumber = (value: number) => new Intl.NumberFormat("en-LK").format(value);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-LK", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));

function computeEffectiveDiscount(customer: Customer, tiers: PriceTier[]) {
  return customer.fixedDiscountPercent ?? tiers.find((tier) => tier.id === customer.priceTierId)?.discountPercent ?? 0;
}

export default function CustomersWorkspace() {
  const [tiers, setTiers] = useState(seedTiers);
  const [customers, setCustomers] = useState(seedCustomers);
  const [activeTab, setActiveTab] = useState<"directory" | "tiers">("directory");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingTier, setEditingTier] = useState<PriceTier | null>(null);
  const [tierEditorOpen, setTierEditorOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteCustomerTarget, setDeleteCustomerTarget] = useState<Customer | null>(null);
  const [deleteTierTarget, setDeleteTierTarget] = useState<PriceTier | null>(null);
  const [blockedTierName, setBlockedTierName] = useState<string | null>(null);

  const selectedCustomer = customers.find((customer) => customer.id === detailId) ?? null;

  const upsertCustomer = (customerInput: CustomerFormValue) => {
    setCustomers((previous) => {
      const next = [...previous];
      const existingIndex = next.findIndex((customer) => customer.id === customerInput.id);
      const normalizedCustomer: Customer = {
        id: customerInput.id ?? `cus-${Math.random().toString(36).slice(2, 9)}`,
        name: customerInput.name,
        code: customerInput.code || `C-${String(next.length + 1001)}`,
        phone: customerInput.phone || undefined,
        email: customerInput.email || undefined,
        address: customerInput.address || undefined,
        dateOfBirth: customerInput.dateOfBirth || undefined,
        priceTierId: customerInput.priceTierId,
        fixedDiscountPercent: customerInput.fixedDiscountPercent,
        creditLimit: customerInput.creditLimit,
        outstandingBalance: customerInput.outstandingBalance,
        loyaltyPoints: customerInput.loyaltyPoints,
        notes: customerInput.notes || undefined,
        tags: customerInput.tags,
        isActive: customerInput.isActive,
        createdAtUtc: customerInput.createdAtUtc ?? new Date().toISOString(),
        sales: customerInput.sales ?? [],
        ledger: customerInput.ledger ?? [],
      };

      if (existingIndex >= 0) {
        next[existingIndex] = normalizedCustomer;
        return next;
      }

      return [normalizedCustomer, ...next];
    });
  };

  const deleteCustomer = (id: string) => {
    setCustomers((previous) => previous.filter((customer) => customer.id !== id));
    setDetailId((current) => (current === id ? null : current));
  };

  const toggleCustomerActive = (id: string) => {
    setCustomers((previous) =>
      previous.map((customer) =>
        customer.id === id ? { ...customer, isActive: !customer.isActive } : customer
      )
    );
  };

  const recordCreditPayment = (customerId: string, amount: number, description: string) => {
    setCustomers((previous) =>
      previous.map((customer) => {
        if (customer.id !== customerId) {
          return customer;
        }

        const nextBalance = Math.max(0, customer.outstandingBalance - amount);
        return {
          ...customer,
          outstandingBalance: nextBalance,
          ledger: [
            {
              id: `ledger-${Math.random().toString(36).slice(2, 9)}`,
              entryType: "Payment",
              description: description.trim() || "Payment received",
              amount: -Math.abs(amount),
              balanceAfter: nextBalance,
              occurredAtUtc: new Date().toISOString(),
            },
            ...customer.ledger,
          ],
        };
      })
    );
  };

  const applyManualAdjustment = (customerId: string, amount: number, description: string) => {
    setCustomers((previous) =>
      previous.map((customer) => {
        if (customer.id !== customerId) {
          return customer;
        }

        const nextBalance = Math.max(0, customer.outstandingBalance + amount);
        return {
          ...customer,
          outstandingBalance: nextBalance,
          ledger: [
            {
              id: `ledger-${Math.random().toString(36).slice(2, 9)}`,
              entryType: "Adjustment",
              description: description.trim() || "Manual adjustment",
              amount,
              balanceAfter: nextBalance,
              occurredAtUtc: new Date().toISOString(),
            },
            ...customer.ledger,
          ],
        };
      })
    );
  };

  const upsertTier = (tierInput: TierFormValue) => {
    setTiers((previous) => {
      const next = [...previous];
      const existingIndex = next.findIndex((tier) => tier.id === tierInput.id);
      const normalizedTier: PriceTier = {
        id: tierInput.id ?? `tier-${Math.random().toString(36).slice(2, 9)}`,
        name: tierInput.name,
        code: tierInput.code.toUpperCase(),
        discountPercent: tierInput.discountPercent,
        description: tierInput.description || undefined,
        isActive: tierInput.isActive,
      };

      if (existingIndex >= 0) {
        next[existingIndex] = normalizedTier;
        return next;
      }

      return [normalizedTier, ...next];
    });
  };

  const deleteTier = (id: string) => {
    setTiers((previous) => previous.filter((tier) => tier.id !== id));
  };

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="space-y-4">
      <TabsList className="grid w-full grid-cols-2 border border-border/60 bg-secondary/60 md:w-fit">
        <TabsTrigger value="directory">Directory</TabsTrigger>
        <TabsTrigger value="tiers">Price Tiers</TabsTrigger>
      </TabsList>

      <TabsContent value="directory" className="mt-0">
        <DirectoryPanel
          customers={customers}
          tiers={tiers}
          onCreate={() => {
            setEditingCustomer(null);
            setEditorOpen(true);
          }}
          onEdit={(customer) => {
            setEditingCustomer(customer);
            setEditorOpen(true);
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
          if (deleteCustomerTarget) {
            deleteCustomer(deleteCustomerTarget.id);
          }
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

          const hasCustomers = customers.some((customer) => customer.priceTierId === deleteTierTarget.id);
          if (hasCustomers) {
            setBlockedTierName(deleteTierTarget.name);
          } else {
            deleteTier(deleteTierTarget.id);
          }
          setDeleteTierTarget(null);
        }}
      />

      <AlertDialog open={blockedTierName !== null} onOpenChange={(open) => !open && setBlockedTierName(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cannot delete tier</AlertDialogTitle>
            <AlertDialogDescription>
              {blockedTierName ? `${blockedTierName} has customers assigned to it.` : "This tier has customers assigned to it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBlockedTierName(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}

function DirectoryPanel({
  customers,
  tiers,
  onCreate,
  onEdit,
  onToggleActive,
  onDelete,
  onOpenDetails,
}: {
  customers: Customer[];
  tiers: PriceTier[];
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
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search name, code, phone, email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
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
            {filteredCustomers.length === 0 && (
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
  onCreate,
  onEdit,
  onDelete,
}: {
  tiers: PriceTier[];
  customers: Customer[];
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
