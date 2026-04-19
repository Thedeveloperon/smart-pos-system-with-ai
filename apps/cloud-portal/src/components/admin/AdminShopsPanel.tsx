import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ApiError,
  createAdminShop,
  deleteAdminShop,
  deactivateAdminShop,
  fetchAdminLicensingShops,
  reactivateAdminShop,
  updateAdminShop,
  type AdminShopsLicensingSnapshotResponse,
} from "@/lib/adminApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog, type ConfirmationDialogConfig } from "@/components/ui/confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AdminShopsPanelProps = {
  shops: AdminShopsLicensingSnapshotResponse["items"];
  onShopsChanged?: () => Promise<void> | void;
};

type AdminShopRow = AdminShopsLicensingSnapshotResponse["items"][number];

type CreateShopForm = {
  shopCode: string;
  shopName: string;
  ownerUsername: string;
  ownerPassword: string;
  ownerFullName: string;
  actorNote: string;
};

type EditShopForm = {
  shopName: string;
  actorNote: string;
};

type ReactivatePromptState = {
  title: string;
  description: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  value: string;
  error: string | null;
};

const initialCreateForm: CreateShopForm = {
  shopCode: "",
  shopName: "",
  ownerUsername: "",
  ownerPassword: "",
  ownerFullName: "",
  actorNote: "",
};

function buildShopActionActorNote(action: "deactivate" | "reactivate" | "delete", shopCode: string) {
  return `Manual ${action} from admin portal for shop '${shopCode}'.`;
}

function isDefaultSmartPosShop(shop: AdminShopRow) {
  return shop.is_default_shop === true || shop.shop_code.trim().toLowerCase() === "default";
}

const shopDependencyKeys = [
  "active_devices",
  "non_terminal_subscriptions",
  "open_or_pending_invoices",
  "pending_manual_payments",
  "pending_ai_orders",
  "pending_ai_payments",
] as const;

type ShopDependencyKey = (typeof shopDependencyKeys)[number];

const shopDependencyLabels: Record<ShopDependencyKey, string> = {
  active_devices: "active devices",
  non_terminal_subscriptions: "active subscriptions",
  open_or_pending_invoices: "open/pending invoices",
  pending_manual_payments: "pending manual payments",
  pending_ai_orders: "pending AI orders",
  pending_ai_payments: "pending AI payments",
};

function resolveDependencyBlockedMessage(
  action: "deactivate" | "delete",
  shopCode: string,
  rawMessage: string,
): string | null {
  const expectedPrefix =
    action === "deactivate"
      ? "shop cannot be deactivated while active dependents exist"
      : "shop cannot be hard-deleted while active dependents exist";

  if (!rawMessage.toLowerCase().includes(expectedPrefix)) {
    return null;
  }

  const counts: Partial<Record<ShopDependencyKey, number>> = {};
  for (const match of rawMessage.matchAll(/([a-z_]+)=(-?\d+)/g)) {
    const key = match[1] as ShopDependencyKey;
    if (!shopDependencyKeys.includes(key)) {
      continue;
    }

    const value = Number.parseInt(match[2], 10);
    if (Number.isFinite(value)) {
      counts[key] = value;
    }
  }

  const blockers = shopDependencyKeys
    .map((key) => ({ key, count: counts[key] ?? 0 }))
    .filter(({ count }) => count > 0)
    .map(({ key, count }) => `${shopDependencyLabels[key]} (${count})`);

  if (blockers.length === 0) {
    return null;
  }

  const operation = action === "deactivate" ? "deactivate" : "hard-delete";
  return `Cannot ${operation} '${shopCode}'. Blockers: ${blockers.join(", ")}. Clear these first, then retry.`;
}

function resolveShopMutationErrorMessage(
  action: "deactivate" | "delete",
  shopCode: string,
  error: unknown,
  fallback: string,
) {
  if (!(error instanceof Error)) {
    return fallback;
  }

  if (error instanceof ApiError && error.code === "DEFAULT_SHOP_PROTECTED") {
    return action === "deactivate"
      ? "The default shop cannot be deactivated."
      : "The default shop cannot be deleted.";
  }

  if (!(error instanceof ApiError) || error.code !== "INVALID_ADMIN_REQUEST") {
    return error.message;
  }

  if (action === "delete" && error.message.includes("Shop must be deactivated before hard-delete")) {
    return `Deactivate '${shopCode}' before deleting it permanently.`;
  }

  const dependencyBlockedMessage = resolveDependencyBlockedMessage(action, shopCode, error.message);
  return dependencyBlockedMessage ?? error.message;
}

const AdminShopsPanel = ({ shops, onShopsChanged }: AdminShopsPanelProps) => {
  const [items, setItems] = useState<AdminShopsLicensingSnapshotResponse["items"]>(shops);
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedShopIds, setSelectedShopIds] = useState<string[]>([]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateShopForm>(initialCreateForm);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editingShop, setEditingShop] = useState<AdminShopsLicensingSnapshotResponse["items"][number] | null>(null);
  const [editForm, setEditForm] = useState<EditShopForm>({
    shopName: "",
    actorNote: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [reactivatePrompt, setReactivatePrompt] = useState<ReactivatePromptState | null>(null);
  const [confirmationState, setConfirmationState] = useState<ConfirmationDialogConfig | null>(null);
  const confirmationResolveRef = useRef<((value: boolean) => void) | null>(null);
  const reactivatePromptResolveRef = useRef<((value: string | null) => void) | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);

  const openConfirmationDialog = useCallback((config: ConfirmationDialogConfig) => {
    return new Promise<boolean>((resolve) => {
      confirmationResolveRef.current = resolve;
      setConfirmationState(config);
    });
  }, []);

  const closeConfirmationDialog = useCallback((confirmed: boolean) => {
    confirmationResolveRef.current?.(confirmed);
    confirmationResolveRef.current = null;
    setConfirmationState(null);
  }, []);

  const cancelConfirmationDialog = useCallback(() => {
    closeConfirmationDialog(false);
  }, [closeConfirmationDialog]);

  const acceptConfirmationDialog = useCallback(() => {
    closeConfirmationDialog(true);
  }, [closeConfirmationDialog]);

  const openReactivatePrompt = useCallback((config: Omit<ReactivatePromptState, "value" | "error">) => {
    return new Promise<string | null>((resolve) => {
      reactivatePromptResolveRef.current = resolve;
      setReactivatePrompt({
        ...config,
        value: "",
        error: null,
      });
    });
  }, []);

  const closeReactivatePrompt = useCallback((value: string | null) => {
    reactivatePromptResolveRef.current?.(value);
    reactivatePromptResolveRef.current = null;
    setReactivatePrompt(null);
  }, []);

  const cancelReactivatePrompt = useCallback(() => {
    closeReactivatePrompt(null);
  }, [closeReactivatePrompt]);

  const acceptReactivatePrompt = useCallback(() => {
    if (!reactivatePrompt) {
      return;
    }

    const actorNote = reactivatePrompt.value.trim();
    if (!actorNote) {
      setReactivatePrompt((current) =>
        current
          ? {
              ...current,
              error: "Actor note is required.",
            }
          : current,
      );
      return;
    }

    closeReactivatePrompt(actorNote);
  }, [closeReactivatePrompt, reactivatePrompt]);

  useEffect(() => {
    setItems(shops);
  }, [shops]);

  const sortedItems = useMemo(
    () => [...items].sort((a, b) => a.shop_code.localeCompare(b.shop_code)),
    [items],
  );
  const selectableSortedItems = useMemo(
    () => sortedItems.filter((shop) => !isDefaultSmartPosShop(shop)),
    [sortedItems],
  );
  const selectedShopIdSet = useMemo(() => new Set(selectedShopIds), [selectedShopIds]);
  const selectedShops = useMemo(
    () => sortedItems.filter((shop) => selectedShopIdSet.has(shop.shop_id) && !isDefaultSmartPosShop(shop)),
    [selectedShopIdSet, sortedItems],
  );
  const allVisibleShopsSelected =
    selectableSortedItems.length > 0 && selectableSortedItems.every((shop) => selectedShopIdSet.has(shop.shop_id));
  const someVisibleShopsSelected =
    selectableSortedItems.some((shop) => selectedShopIdSet.has(shop.shop_id));

  useEffect(() => {
    setSelectedShopIds((current) =>
      current.filter((shopId) => items.some((shop) => shop.shop_id === shopId && !isDefaultSmartPosShop(shop))),
    );
  }, [items]);

  useEffect(() => {
    if (!selectAllCheckboxRef.current) {
      return;
    }

    selectAllCheckboxRef.current.indeterminate = someVisibleShopsSelected && !allVisibleShopsSelected;
  }, [allVisibleShopsSelected, someVisibleShopsSelected]);

  const loadShops = useCallback(async (quiet = false) => {
    setLoading(true);
    try {
      const response = await fetchAdminLicensingShops({
        search: search.trim() || undefined,
        includeInactive,
        take: 250,
      });
      setItems(response.items);
    } catch (error) {
      console.error(error);
      if (!quiet) {
        toast.error(error instanceof Error ? error.message : "Failed to load shops.");
      }
    } finally {
      setLoading(false);
    }
  }, [includeInactive, search]);

  const refreshAll = useCallback(async (quiet = false) => {
    await loadShops(quiet);
    await onShopsChanged?.();
  }, [loadShops, onShopsChanged]);

  const toggleShopSelection = useCallback((shop: AdminShopRow, checked: boolean) => {
    if (isDefaultSmartPosShop(shop)) {
      return;
    }

    const shopId = shop.shop_id;
    setSelectedShopIds((current) => {
      if (checked) {
        if (current.includes(shopId)) {
          return current;
        }

        return [...current, shopId];
      }

      return current.filter((item) => item !== shopId);
    });
  }, []);

  const toggleAllVisibleShops = useCallback(
    (checked: boolean) => {
      setSelectedShopIds((current) => {
        if (checked) {
          const currentSet = new Set(current);
          for (const shop of selectableSortedItems) {
            currentSet.add(shop.shop_id);
          }

          return Array.from(currentSet);
        }

        const visibleIds = new Set(selectableSortedItems.map((shop) => shop.shop_id));
        return current.filter((shopId) => !visibleIds.has(shopId));
      });
    },
    [selectableSortedItems],
  );

  const setSelectionToFailedIds = useCallback((failedIds: Set<string>) => {
    setSelectedShopIds(Array.from(failedIds));
  }, []);

  const handleBulkDeactivate = useCallback(async () => {
    const candidates = selectedShops.filter((shop) => shop.is_active !== false);
    if (candidates.length === 0) {
      toast.error("Select at least one active shop to deactivate.");
      return;
    }

    const confirmed = await openConfirmationDialog({
      title: "Deactivate selected shops?",
      description: `Deactivate ${candidates.length} selected shop(s)?`,
      confirmLabel: "Deactivate",
    });
    if (!confirmed) {
      return;
    }

    setBulkSubmitting(true);
    const failedIds = new Set<string>();
    let successCount = 0;
    let failureCount = 0;

    try {
      for (const shop of candidates) {
        try {
          await deactivateAdminShop(shop.shop_id, {
            actor: "support-ui",
            reason_code: "manual_shop_deactivate",
            actor_note: buildShopActionActorNote("deactivate", shop.shop_code),
          });
          successCount += 1;
        } catch (error) {
          console.error(error);
          failedIds.add(shop.shop_id);
          failureCount += 1;
        }
      }

      if (successCount > 0) {
        toast.success(`Deactivated ${successCount} shop(s).`);
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} shop(s) failed to deactivate. Check console logs for details.`);
      }
      await refreshAll(true);
      setSelectionToFailedIds(failedIds);
    } finally {
      setBulkSubmitting(false);
    }
  }, [openConfirmationDialog, refreshAll, selectedShops, setSelectionToFailedIds]);

  const handleBulkReactivate = useCallback(async () => {
    const candidates = selectedShops.filter((shop) => shop.is_active === false);
    if (candidates.length === 0) {
      toast.error("Select at least one inactive shop to reactivate.");
      return;
    }

    const actorNote = await openReactivatePrompt({
      title: "Reactivate selected shops",
      description: `Enter an actor note for reactivating ${candidates.length} selected shop(s).`,
      placeholder: "Reactivate pilot shops",
      confirmLabel: "OK",
      cancelLabel: "Cancel",
    });
    if (!actorNote) {
      return;
    }

    setBulkSubmitting(true);
    const failedIds = new Set<string>();
    let successCount = 0;
    let failureCount = 0;

    try {
      for (const shop of candidates) {
        try {
          await reactivateAdminShop(shop.shop_id, {
            actor: "support-ui",
            reason_code: "manual_shop_reactivate",
            actor_note: actorNote,
          });
          successCount += 1;
        } catch (error) {
          console.error(error);
          failedIds.add(shop.shop_id);
          failureCount += 1;
        }
      }

      if (successCount > 0) {
        toast.success(`Reactivated ${successCount} shop(s).`);
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} shop(s) failed to reactivate. Check console logs for details.`);
      }
      await refreshAll(true);
      setSelectionToFailedIds(failedIds);
    } finally {
      setBulkSubmitting(false);
    }
  }, [openReactivatePrompt, refreshAll, selectedShops, setSelectionToFailedIds]);

  const handleBulkDelete = useCallback(async () => {
    const activeSelections = selectedShops.filter((shop) => shop.is_active !== false);
    if (activeSelections.length > 0) {
      toast.error("Deactivate selected active shops before deleting them permanently.");
      return;
    }

    const candidates = selectedShops.filter((shop) => shop.is_active === false);
    if (candidates.length === 0) {
      toast.error("Select at least one inactive shop to delete.");
      return;
    }

    const confirmed = await openConfirmationDialog({
      title: "Delete selected shops permanently?",
      description: `Delete ${candidates.length} selected shop(s)? Linked users will also be removed. This cannot be undone.`,
      confirmLabel: "Delete",
      confirmVariant: "destructive",
    });
    if (!confirmed) {
      return;
    }

    setBulkSubmitting(true);
    const failedIds = new Set<string>();
    let successCount = 0;
    let failureCount = 0;

    try {
      for (const shop of candidates) {
        try {
          await deleteAdminShop(shop.shop_id, {
            actor: "support-ui",
            reason_code: "manual_shop_delete",
            actor_note: buildShopActionActorNote("delete", shop.shop_code),
          });
          successCount += 1;
        } catch (error) {
          console.error(error);
          failedIds.add(shop.shop_id);
          failureCount += 1;
        }
      }

      if (successCount > 0) {
        toast.success(`Deleted ${successCount} shop(s).`);
      }
      if (failureCount > 0) {
        toast.error(`${failureCount} shop(s) failed to delete. Check console logs for details.`);
      }
      await refreshAll(true);
      setSelectionToFailedIds(failedIds);
    } finally {
      setBulkSubmitting(false);
    }
  }, [openConfirmationDialog, refreshAll, selectedShops, setSelectionToFailedIds]);

  const handleCreate = useCallback(async () => {
    if (
      !createForm.shopCode.trim() ||
      !createForm.shopName.trim() ||
      !createForm.ownerUsername.trim() ||
      !createForm.ownerPassword.trim() ||
      !createForm.actorNote.trim()
    ) {
      toast.error("Shop code, shop name, owner username, owner password, and actor note are required.");
      return;
    }

    setCreateSubmitting(true);
    try {
      await createAdminShop({
        shop_code: createForm.shopCode.trim(),
        shop_name: createForm.shopName.trim(),
        owner_username: createForm.ownerUsername.trim(),
        owner_password: createForm.ownerPassword,
        owner_full_name: createForm.ownerFullName.trim() || undefined,
        actor: "support-ui",
        reason_code: "manual_shop_create",
        actor_note: createForm.actorNote.trim(),
      });
      toast.success("Shop created.");
      setCreateOpen(false);
      setCreateForm(initialCreateForm);
      await refreshAll(true);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to create shop.");
    } finally {
      setCreateSubmitting(false);
    }
  }, [createForm, refreshAll]);

  const openEdit = useCallback((shop: AdminShopsLicensingSnapshotResponse["items"][number]) => {
    setEditingShop(shop);
    setEditForm({
      shopName: shop.shop_name,
      actorNote: "",
    });
  }, []);

  const handleEdit = useCallback(async () => {
    if (!editingShop) {
      return;
    }

    if (!editForm.shopName.trim() || !editForm.actorNote.trim()) {
      toast.error("Shop name and actor note are required.");
      return;
    }

    setEditSubmitting(true);
    try {
      await updateAdminShop(editingShop.shop_id, {
        shop_name: editForm.shopName.trim(),
        actor: "support-ui",
        reason_code: "manual_shop_update",
        actor_note: editForm.actorNote.trim(),
      });
      toast.success(`Shop '${editingShop.shop_code}' updated.`);
      setEditingShop(null);
      await refreshAll(true);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to update shop.");
    } finally {
      setEditSubmitting(false);
    }
  }, [editForm, editingShop, refreshAll]);

  const handleDeactivate = useCallback(async (shop: AdminShopsLicensingSnapshotResponse["items"][number]) => {
    if (isDefaultSmartPosShop(shop)) {
      toast.error("The default shop cannot be deactivated.");
      return;
    }

    const confirmed = await openConfirmationDialog({
      title: "Deactivate shop?",
      description: `Deactivate shop '${shop.shop_code}' (${shop.shop_name})? You can delete it permanently after deactivation.`,
      confirmLabel: "Deactivate",
    });
    if (!confirmed) {
      return;
    }

    try {
      await deactivateAdminShop(shop.shop_id, {
        actor: "support-ui",
        reason_code: "manual_shop_deactivate",
        actor_note: buildShopActionActorNote("deactivate", shop.shop_code),
      });
      toast.success(`Shop '${shop.shop_code}' deactivated.`);
      setItems((current) =>
        current.map((item) => (item.shop_id === shop.shop_id ? { ...item, is_active: false } : item)),
      );
      await onShopsChanged?.();
    } catch (error) {
      console.error(error);
      toast.error(resolveShopMutationErrorMessage("deactivate", shop.shop_code, error, "Failed to deactivate shop."));
    }
  }, [onShopsChanged, openConfirmationDialog]);

  const handleReactivate = useCallback(async (shop: AdminShopsLicensingSnapshotResponse["items"][number]) => {
    const actorNote = await openReactivatePrompt({
      title: `Reactivate '${shop.shop_code}'`,
      description: "Enter an actor note for this reactivation.",
      placeholder: "Reactivating shop access",
      confirmLabel: "OK",
      cancelLabel: "Cancel",
    });
    if (!actorNote) {
      return;
    }

    try {
      await reactivateAdminShop(shop.shop_id, {
        actor: "support-ui",
        reason_code: "manual_shop_reactivate",
        actor_note: actorNote,
      });
      toast.success(`Shop '${shop.shop_code}' reactivated.`);
      await refreshAll(true);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to reactivate shop.");
    }
  }, [openReactivatePrompt, refreshAll]);

  const handleDelete = useCallback(async (shop: AdminShopsLicensingSnapshotResponse["items"][number]) => {
    if (isDefaultSmartPosShop(shop)) {
      toast.error("The default shop cannot be deleted.");
      return;
    }

    if (shop.is_active !== false) {
      toast.error("Deactivate the shop before deleting it permanently.");
      return;
    }

    const confirmed = await openConfirmationDialog({
      title: "Delete shop permanently?",
      description: `Delete shop '${shop.shop_code}' (${shop.shop_name})? This will remove the shop and linked users. This cannot be undone.`,
      confirmLabel: "Delete",
      confirmVariant: "destructive",
    });
    if (!confirmed) {
      return;
    }

    try {
      await deleteAdminShop(shop.shop_id, {
        actor: "support-ui",
        reason_code: "manual_shop_delete",
        actor_note: buildShopActionActorNote("delete", shop.shop_code),
      });
      toast.success(`Shop '${shop.shop_code}' deleted.`);
      setItems((current) => current.filter((item) => item.shop_id !== shop.shop_id));
      await onShopsChanged?.();
    } catch (error) {
      console.error(error);
      toast.error(resolveShopMutationErrorMessage("delete", shop.shop_code, error, "Failed to delete shop."));
    }
  }, [onShopsChanged, openConfirmationDialog]);

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-end md:justify-between">
        <div className="grid w-full gap-3 md:grid-cols-3">
          <div className="space-y-1 md:col-span-2">
            <Label htmlFor="admin-shops-search">Search</Label>
            <Input
              id="admin-shops-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="shop code or name"
            />
          </div>
          <label className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
            />
            Include inactive
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedShops.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">{selectedShops.length} selected</p>
              <Button variant="outline" onClick={() => void handleBulkDeactivate()} disabled={bulkSubmitting}>
                Deactivate Selected
              </Button>
              <Button variant="outline" onClick={() => void handleBulkReactivate()} disabled={bulkSubmitting}>
                Reactivate Selected
              </Button>
              <Button variant="destructive" onClick={() => void handleBulkDelete()} disabled={bulkSubmitting}>
                Delete Selected
              </Button>
              <Button
                variant="ghost"
                onClick={() => setSelectedShopIds([])}
                disabled={bulkSubmitting}
              >
                Clear Selection
              </Button>
            </>
          ) : null}
          <Button variant="outline" onClick={() => void loadShops()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
          <Button onClick={() => setCreateOpen(true)} disabled={bulkSubmitting}>Create Shop</Button>
        </div>
      </div>

      <div className="max-h-[62vh] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 px-2">
                <input
                  ref={selectAllCheckboxRef}
                  type="checkbox"
                  aria-label="Select all shops"
                  checked={allVisibleShopsSelected}
                  onChange={(event) => toggleAllVisibleShops(event.target.checked)}
                  disabled={selectableSortedItems.length === 0 || bulkSubmitting}
                  className="h-4 w-4"
                />
              </TableHead>
              <TableHead>Shop</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="text-right">Seats</TableHead>
              <TableHead className="text-right">Devices</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No shops found.
                </TableCell>
              </TableRow>
            ) : (
              sortedItems.map((shop) => {
                const isDefaultShop = isDefaultSmartPosShop(shop);

                return (
                  <TableRow key={shop.shop_id}>
                    <TableCell className="w-12 px-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${shop.shop_code}`}
                        checked={selectedShopIdSet.has(shop.shop_id)}
                        onChange={(event) => toggleShopSelection(shop, event.target.checked)}
                        disabled={bulkSubmitting || isDefaultShop}
                        className="h-4 w-4"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{shop.shop_name}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground">{shop.shop_code}</p>
                          {isDefaultShop ? (
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                              Protected
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={shop.is_active !== false ? "default" : "secondary"}>{shop.is_active !== false ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell className="capitalize">{shop.plan}</TableCell>
                    <TableCell className="text-right">{shop.active_seats}/{shop.seat_limit}</TableCell>
                    <TableCell className="text-right">{shop.total_devices}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(shop)} disabled={bulkSubmitting}>
                          Edit
                        </Button>
                        {shop.is_active !== false ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleDeactivate(shop)}
                            disabled={bulkSubmitting || isDefaultShop}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleReactivate(shop)}
                            disabled={bulkSubmitting}
                          >
                            Reactivate
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => void handleDelete(shop)}
                          disabled={bulkSubmitting || isDefaultShop}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Shop</DialogTitle>
            <DialogDescription>Create a shop and its initial owner account.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="create-shop-code">Shop Code</Label>
              <Input
                id="create-shop-code"
                value={createForm.shopCode}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, shopCode: event.target.value }))}
                placeholder="new-grocery-01"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-shop-name">Shop Name</Label>
              <Input
                id="create-shop-name"
                value={createForm.shopName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, shopName: event.target.value }))}
                placeholder="New Grocery"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-owner-username">Owner Username</Label>
              <Input
                id="create-owner-username"
                value={createForm.ownerUsername}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, ownerUsername: event.target.value }))}
                placeholder="owner.newgrocery"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-owner-password">Owner Password</Label>
              <Input
                id="create-owner-password"
                type="password"
                value={createForm.ownerPassword}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, ownerPassword: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-owner-full-name">Owner Full Name (Optional)</Label>
              <Input
                id="create-owner-full-name"
                value={createForm.ownerFullName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, ownerFullName: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="create-shop-actor-note">Actor Note</Label>
              <Input
                id="create-shop-actor-note"
                value={createForm.actorNote}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, actorNote: event.target.value }))}
                placeholder="Create pilot tenant"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createSubmitting}>Cancel</Button>
            <Button onClick={() => void handleCreate()} disabled={createSubmitting}>
              {createSubmitting ? "Creating..." : "Create Shop"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingShop} onOpenChange={(open) => !open && setEditingShop(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Shop</DialogTitle>
            <DialogDescription>{editingShop?.shop_code}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="edit-shop-name">Shop Name</Label>
              <Input
                id="edit-shop-name"
                value={editForm.shopName}
                onChange={(event) => setEditForm((prev) => ({ ...prev, shopName: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-shop-actor-note">Actor Note</Label>
              <Input
                id="edit-shop-actor-note"
                value={editForm.actorNote}
                onChange={(event) => setEditForm((prev) => ({ ...prev, actorNote: event.target.value }))}
                placeholder="Rename branch umbrella"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingShop(null)} disabled={editSubmitting}>Cancel</Button>
            <Button onClick={() => void handleEdit()} disabled={editSubmitting}>
              {editSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reactivatePrompt)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            cancelReactivatePrompt();
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{reactivatePrompt?.title || "Reactivate shop"}</DialogTitle>
            {reactivatePrompt?.description ? (
              <DialogDescription>{reactivatePrompt.description}</DialogDescription>
            ) : null}
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="reactivate-shop-actor-note">Actor note</Label>
            <Input
              id="reactivate-shop-actor-note"
              value={reactivatePrompt?.value || ""}
              placeholder={reactivatePrompt?.placeholder}
              autoFocus
              onChange={(event) => {
                setReactivatePrompt((current) =>
                  current
                    ? {
                        ...current,
                        value: event.target.value,
                        error: null,
                      }
                    : current,
                );
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  acceptReactivatePrompt();
                }
              }}
            />
            {reactivatePrompt?.error ? <p className="text-sm text-destructive">{reactivatePrompt.error}</p> : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelReactivatePrompt}>
              {reactivatePrompt?.cancelLabel || "Cancel"}
            </Button>
            <Button onClick={acceptReactivatePrompt}>
              {reactivatePrompt?.confirmLabel || "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        open={Boolean(confirmationState)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            cancelConfirmationDialog();
          }
        }}
        onCancel={cancelConfirmationDialog}
        onConfirm={acceptConfirmationDialog}
        title={confirmationState?.title || "Confirm Action"}
        description={confirmationState?.description}
        cancelLabel={confirmationState?.cancelLabel}
        confirmLabel={confirmationState?.confirmLabel}
        confirmVariant={confirmationState?.confirmVariant}
      />
    </div>
  );
};

export default AdminShopsPanel;
