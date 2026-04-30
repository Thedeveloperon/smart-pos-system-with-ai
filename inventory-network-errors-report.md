# Network Error Handling Audit — Inventory Manager

**Date:** 2026-04-30
**Scope:** `apps/Inventory Manager/src/` + `services/backend-api/Features/`

---

## Summary

| Severity | Count |
|---|---|
| Critical | 2 files |
| High | 5 files |
| Medium | 4 areas |

The most common pattern is **missing `.catch()` handlers on promise chains** and **async handlers without `try/catch`**. When the network is down or the backend returns an error, these paths currently surface as unhandled promise rejections or blank/stale UI with no user-facing feedback. Two components (`StocktakeTab` and `WarrantyClaimsTab`) have the most serious gaps because core user-triggered actions (start session, complete session, transition warranty status) can fail with no visible error state.

---

## Critical Issues

### CRIT-1 — StocktakeTab: 5 async handlers with no error handling

**File:** `apps/Inventory Manager/src/components/inventory/StocktakeTab.tsx`

Every user action in the Stocktake tab is an async function with zero error handling. A network failure during any of these silently crashes the operation with no user feedback.

```typescript
// openSession — no try/catch
const openSession = async (s: StocktakeSession, readonly: boolean) => {
  const { session, items } = await getStocktakeSession(s.id);
  setActiveSession(session);
  setItems(items);
  setReadonlyMode(readonly);
  setSheetOpen(true);
};

// handleStart — no try/catch
const handleStart = async (s: StocktakeSession) => {
  await startStocktakeSession(s.id);
  reload();
};

// handleNew — no try/catch
const handleNew = async () => {
  const created = await createStocktakeSession();
  await startStocktakeSession(created.id);
  reload();
  openSession({ ...created, status: "InProgress" }, false);
};

// handleCount — no try/catch
const handleCount = async (item: StocktakeItem, value: string) => {
  const qty = Number(value);
  if (Number.isNaN(qty)) return;
  const updated = await updateStocktakeItem(item.session_id, item.id, qty);
  setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
};

// handleComplete — no try/catch
const handleComplete = async () => {
  if (!activeSession) return;
  await completeStocktakeSession(activeSession.id);
  setConfirmOpen(false);
  setSheetOpen(false);
  reload();
};
```

**Impact:** If the backend is slow or returns an error, the user gets a blank sheet or nothing happens — no toast, no error message.

**Fix:** Wrap every handler in try/catch and call `toast.error(e instanceof Error ? e.message : "Operation failed")` in each catch block.

---

### CRIT-2 — WarrantyClaimsTab: Missing catch in reload, transition, and submitResolve

**File:** `apps/Inventory Manager/src/components/inventory/WarrantyClaimsTab.tsx`

```typescript
// reload() — .then().finally() but no .catch()
const reload = () => {
  setLoading(true);
  fetchWarrantyClaims({
    status,
    from_date: from || undefined,
    to_date: to || undefined,
  })
    .then(setClaims)
    .finally(() => setLoading(false));
  // ← missing .catch() — rejection reaches the console, but the UI shows no feedback
};

// handleCreate — try/finally WITHOUT catch
const handleCreate = async () => {
  if (!serialId) return;
  setSaving(true);
  try {
    await createWarrantyClaim({
      serial_number_id: serialId,
      claim_date: claimDate,
      notes: notes || undefined,
    });
    setOpen(false);
    setSerialValue("");
    setSerialId(null);
    setNotes("");
    reload();
  } finally {
    setSaving(false);
    // ← no catch — save spinner resets, but the user still gets no feedback
  }
};

// transition — no try/catch
const transition = async (c: WarrantyClaim, next: WarrantyClaim["status"]) => {
  await updateWarrantyClaim(c.id, { status: next });
  reload();
};

// submitResolve — no try/catch
const submitResolve = async () => {
  if (!resolveTarget) return;
  await updateWarrantyClaim(resolveTarget.id, {
    status: "Resolved",
    resolution_notes: resolveNotes || undefined,
  });
  setResolveOpen(false);
  reload();
};
```

**Impact:** A failed warranty status transition (e.g., `InRepair` → `Resolved`) produces no user feedback. The claim stays in its old state but the user does not know why. `handleCreate` uses `try/finally` with no `catch`, so the save spinner resets but the failure still is not surfaced in the UI.

**Fix:**
- Add `.catch(e => toast.error(e.message))` to `reload()`
- Change `handleCreate` to `try/catch/finally`
- Wrap `transition` and `submitResolve` in try/catch

---

## High Severity Issues

### HIGH-1 — InventoryDashboardTab: No error handling on dashboard fetch

**File:** `apps/Inventory Manager/src/components/inventory/InventoryDashboardTab.tsx`

```typescript
useEffect(() => {
  fetchInventoryDashboard()
    .then(setData)
    .finally(() => setLoading(false));
  // ← no .catch() — silent failure
}, []);
```

**Impact:** If the dashboard API fails, loading spinner disappears and the page shows nothing. No error state variable exists in this component.

**Fix:** Add `.catch(e => toast.error(e.message))` and an `error` state variable to display an error card.

---

### HIGH-2 — StockMovementsTab: No error handling on movements fetch

**File:** `apps/Inventory Manager/src/components/inventory/StockMovementsTab.tsx`

```typescript
useEffect(() => {
  setLoading(true);
  fetchStockMovements(params)
    .then((res) => {
      setTotal(res.total);
      setItems((prev) => page === 1 ? res.items : [...prev, ...res.items]);
    })
    .finally(() => setLoading(false));
  // ← no .catch()
}, [params, page]);
```

**Impact:** Initial load failures produce an empty table with no explanation, and later failures can leave stale results on screen. The tab also has a race condition risk: rapid filter changes produce multiple in-flight requests, and earlier responses can arrive after later ones.

**Fix:** Add `.catch(e => toast.error(e.message))` and guard state updates so stale requests cannot overwrite newer results.

---

### HIGH-3 — SerialNumbersTab: 3 missing error handlers

**File:** `apps/Inventory Manager/src/components/inventory/SerialNumbersTab.tsx`

```typescript
// fetchProducts — no .catch()
useEffect(() => {
  fetchProducts().then((p) => {
    setProducts(p.filter(x => x.is_serial_tracked));
  });
}, []);

// fetchSerialNumbers — no .catch()
useEffect(() => {
  if (!productId) return;
  setLoading(true);
  fetchSerialNumbers(productId)
    .then(setSerials)
    .finally(() => setLoading(false));
}, [productId]);

// handleMarkDefective — no try/catch
const handleMarkDefective = async (sid: string) => {
  const updated = await updateSerialNumber(productId, sid, { status: "Defective" });
  setSerials(prev => prev.map(s => s.id === sid ? updated : s));
};
```

**Impact:** Product selector may be empty on page load with no feedback. Marking a serial as defective may silently fail if the network drops mid-request.

---

### HIGH-4 — BatchesTab: No error handling on fetches

**File:** `apps/Inventory Manager/src/components/inventory/BatchesTab.tsx`

```typescript
useEffect(() => {
  fetchProducts().then(p => setProducts(p.filter(x => x.is_batch_tracked)));
  // no .catch()
}, []);

useEffect(() => {
  if (!productId) return;
  setLoading(true);
  fetchProductBatches(productId)
    .then(setBatches)
    .finally(() => setLoading(false));
  // no .catch()
}, [productId]);
```

**Impact:** Same pattern as SerialNumbersTab — empty product selector or blank batch list on network error.

---

### HIGH-5 — ProductManagementDialog: Swallowed errors on secondary fetches

**File:** `apps/Inventory Manager/src/components/pos/ProductManagementDialog.tsx`

```typescript
// Batch fetch — catch silently resets to empty array, no user notification
void fetchProductBatches(product.id)
  .then(items => { if (alive) setBatches(items); })
  .catch(() => {
    if (alive) setBatches([]);  // ← error swallowed, no toast
  });

// Supplier hydration — empty catch, completely silent
void fetchProductSuppliers(product.id)
  .then(items => { /* sets preferred supplier */ })
  .catch(() => {
    // ← empty catch block
  });
```

**Impact:** If batch data fails to load, the stock adjustment dialog will show no batches for a batch-tracked product — but the user won't know why. Could lead to an incorrect stock adjustment without batch context.

---

## Medium Severity Issues

### MED-1 — BatchSelector component: No error handling

**File:** `apps/Inventory Manager/src/components/inventory/BatchSelector.tsx`

```typescript
useEffect(() => {
  if (!productId) return;
  setLoading(true);
  fetchProductBatches(productId)
    .then(setBatches)
    .finally(() => setLoading(false));
  // no .catch()
}, [productId]);
```

Used inside the stock adjustment dialog. If this fails silently, batch-tracked products will show an empty batch dropdown in the adjustment form.

---

### MED-2 — ProductsTab: Fire-and-forget async calls

**File:** `apps/Inventory Manager/src/components/manager/ProductsTab.tsx`

```typescript
// void prefix discards the promise return value
onClick={() => void loadProducts()}
onClick={() => void handleBulkGenerateBarcodes()}
```

While `loadProducts()` and `handleBulkGenerateBarcodes()` have proper internal try/catch, using `void` to call them means any exception that escapes the internal catch propagates to an unhandled rejection. This is a low-risk pattern here but a maintenance hazard.

---

### MED-3 — Backend: Several inventory endpoints save without local database exception handling

**Files:** Inventory endpoint files such as `BatchEndpoints.cs`, `StocktakeEndpoints.cs`, `WarrantyClaimEndpoints.cs`, and `SerialNumberEndpoints.cs`

```csharp
// BatchEndpoints.cs — representative example
var batch = new ProductBatch { ... };
dbContext.ProductBatches.Add(batch);
await dbContext.SaveChangesAsync(cancellationToken);  // no try/catch
return Results.Ok(new { ... });
```

Several inventory endpoints call `SaveChangesAsync` without a local `DbUpdateException` catch. Those failures bubble up as generic 500 responses. The frontend's `requestJson` will convert them to `ApiError` objects, but the message is unlikely to be user-friendly.

This is **not** true of every endpoint file in `services/backend-api/Features/`; many endpoints already catch domain exceptions and return structured 400/404 responses.

**Fix:** Add targeted `DbUpdateException` handling around inventory writes where user-correctable conflicts are plausible, and return a meaningful 409 Conflict or 400 Bad Request where appropriate.

---

### MED-4 — Race condition risk in StockMovementsTab

**File:** `apps/Inventory Manager/src/components/inventory/StockMovementsTab.tsx`

When the user changes filters rapidly (e.g., types quickly in the search box), multiple API requests are fired. If an earlier request resolves after a later one, stale data overwrites the current results.

**Fix:** Use an `alive` flag or request token inside the `useEffect` so stale responses cannot commit state after the filters change. This matches the current API layer without changing `api.ts`:

```typescript
useEffect(() => {
  let alive = true;
  setLoading(true);
  fetchStockMovements(params)
    .then((res) => {
      if (!alive) return;
      setTotal(res.total);
      setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
    })
    .catch((e) => {
      if (alive) toast.error(e instanceof Error ? e.message : "Failed to load stock movements.");
    })
    .finally(() => {
      if (alive) setLoading(false);
    });
  return () => {
    alive = false;
  };
}, [params, page]);
```

---

## What Is Working Well

| Area | Status |
|---|---|
| `api.ts` — `requestJson()` | Correct error extraction, 204 handling, credentials |
| `api.ts` — `safeRequestJson()` | Correct 404/405/501 fallback |
| `CatalogueTab.tsx` | Full try/catch with `toast.error()` on all mutations |
| `SuppliersTab.tsx` | Full try/catch with `toast.error()` on all mutations |
| `ProductManagementDialog.tsx` — save/delete/adjust | Correct try/catch/finally pattern |
| Backend validation | Consistent 400 Bad Request with `{ message }` body |
| Backend auth | Correct 401/403 on missing or wrong `StoreId` claim |

---

## Fix Priority Order

| Priority | File | Action |
|---|---|---|
| 1 | `StocktakeTab.tsx` | Add try/catch to all 5 async handlers |
| 2 | `WarrantyClaimsTab.tsx` | Add `.catch()` to `reload()`; fix `handleCreate` to catch; add try/catch to `transition` and `submitResolve` |
| 3 | `InventoryDashboardTab.tsx` | Add `.catch()` + error state |
| 4 | `StockMovementsTab.tsx` | Add `.catch()` + stale-response guard for race condition |
| 5 | `SerialNumbersTab.tsx` | Add `.catch()` to both useEffects; try/catch in `handleMarkDefective` |
| 6 | `BatchesTab.tsx` | Add `.catch()` to both useEffects |
| 7 | `ProductManagementDialog.tsx` | Add toast in batch fetch catch; add toast in supplier fetch catch |
| 8 | `BatchSelector.tsx` | Add `.catch()` |
| 9 | Inventory write endpoints | Add targeted `DbUpdateException` handling where inventory writes can fail with user-correctable conflicts |

---

## Standard Fix Pattern

Apply this pattern consistently to all `useEffect` fetch calls:

```typescript
useEffect(() => {
  let alive = true;
  setLoading(true);
  someApiCall()
    .then(data => { if (alive) setData(data); })
    .catch(e => { if (alive) toast.error(e instanceof Error ? e.message : "Failed to load data."); })
    .finally(() => { if (alive) setLoading(false); });
  return () => { alive = false; };
}, [dependency]);
```

Apply this pattern consistently to all user-triggered async handlers:

```typescript
const handleSomeAction = async () => {
  setSaving(true);
  try {
    await someApiCall();
    toast.success("Action completed.");
    reload();
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Action failed.");
  } finally {
    setSaving(false);
  }
};
```
