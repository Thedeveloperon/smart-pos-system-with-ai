// ============================================================================
// POS Inventory Management — API layer
// ----------------------------------------------------------------------------
// All functions are async and currently return MOCK data. Swap the body of
// each function with a real `fetch(...)` call against your backend later —
// the type signatures will not change.
// ============================================================================

// ---------- Types ----------

export type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  is_serial_tracked?: boolean;
  warranty_months?: number;
  is_batch_tracked?: boolean;
  expiry_alert_days?: number;
  allow_negative_stock?: boolean;
};

export type StockMovement = {
  id: string;
  product_id: string;
  product_name: string;
  movement_type:
    | "Sale"
    | "Purchase"
    | "Adjustment"
    | "Refund"
    | "ExpiryWriteOff"
    | "StocktakeReconciliation"
    | "Transfer";
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  reference_type: string;
  reference_id?: string;
  batch_id?: string;
  serial_number?: string;
  reason?: string;
  created_by_user_id?: string;
  created_at: string;
};

export type StockMovementPage = {
  items: StockMovement[];
  total: number;
  page: number;
  take: number;
};

export type SerialNumberRecord = {
  id: string;
  product_id: string;
  serial_value: string;
  status: "Available" | "Sold" | "Returned" | "Defective" | "UnderWarranty";
  sale_id?: string;
  refund_id?: string;
  warranty_expiry_date?: string;
  created_at: string;
  updated_at?: string;
};

export type SerialLookupResult = {
  serial_value: string;
  product_id: string;
  product_name: string;
  status: string;
  sale_date?: string;
  warranty_expiry_date?: string;
};

export type ProductBatch = {
  id: string;
  product_id: string;
  supplier_id?: string;
  purchase_bill_id?: string;
  batch_number: string;
  manufacture_date?: string;
  expiry_date?: string;
  initial_quantity: number;
  remaining_quantity: number;
  cost_price: number;
  received_at: string;
};

export type ExpiringBatch = {
  batch_id: string;
  product_id: string;
  product_name: string;
  batch_number: string;
  expiry_date: string;
  remaining_quantity: number;
  days_until_expiry: number;
};

export type StocktakeSession = {
  id: string;
  store_id: string;
  status: "Draft" | "InProgress" | "Completed";
  started_at: string;
  completed_at?: string;
  created_by_user_id?: string;
  item_count: number;
  variance_count: number;
};

export type StocktakeItem = {
  id: string;
  session_id: string;
  product_id: string;
  product_name: string;
  system_quantity: number;
  counted_quantity?: number;
  variance_quantity?: number;
  notes?: string;
};

export type WarrantyClaim = {
  id: string;
  serial_number_id: string;
  serial_value: string;
  product_name: string;
  claim_date: string;
  status: "Open" | "InRepair" | "Resolved" | "Rejected";
  resolution_notes?: string;
  created_at: string;
};

export type InventoryDashboard = {
  low_stock_count: number;
  expiry_alert_count: number;
  open_stocktake_sessions: number;
  open_warranty_claims: number;
  expiry_alerts: ExpiringBatch[];
};

// ---------- Mock data store ----------

const delay = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const uid = () => Math.random().toString(36).slice(2, 10);
const daysFromNow = (n: number) =>
  new Date(Date.now() + n * 86400000).toISOString();

const products: Product[] = [
  { id: "p1", name: "Panadol 500mg", sku: "PAN-500", price: 4.5, stock: 120, is_batch_tracked: true, expiry_alert_days: 30 },
  { id: "p2", name: "Sony WH-1000XM5", sku: "SNY-XM5", price: 399, stock: 8, is_serial_tracked: true, warranty_months: 24 },
  { id: "p3", name: "Amoxicillin 250mg", sku: "AMX-250", price: 12, stock: 60, is_batch_tracked: true, expiry_alert_days: 60 },
  { id: "p4", name: "iPhone 15 Pro", sku: "IPH-15P", price: 1199, stock: 4, is_serial_tracked: true, warranty_months: 12 },
  { id: "p5", name: "Vitamin C 1000mg", sku: "VITC-1K", price: 18, stock: 200, is_batch_tracked: true, expiry_alert_days: 45 },
];

const movements: StockMovement[] = [
  { id: uid(), product_id: "p1", product_name: "Panadol 500mg", movement_type: "Sale", quantity_before: 124, quantity_change: -4, quantity_after: 120, reference_type: "Sale", reference_id: "SALE-1029", reason: "POS sale", created_by_user_id: "u_clerk1", created_at: daysFromNow(-1) },
  { id: uid(), product_id: "p2", product_name: "Sony WH-1000XM5", movement_type: "Purchase", quantity_before: 0, quantity_change: 10, quantity_after: 10, reference_type: "PurchaseBill", reference_id: "PB-2031", reason: "Restock", created_by_user_id: "u_mgr", created_at: daysFromNow(-3) },
  { id: uid(), product_id: "p2", product_name: "Sony WH-1000XM5", movement_type: "Sale", quantity_before: 10, quantity_change: -2, quantity_after: 8, reference_type: "Sale", reference_id: "SALE-1031", serial_number: "SN-XM5-001", created_by_user_id: "u_clerk1", created_at: daysFromNow(-2) },
  { id: uid(), product_id: "p3", product_name: "Amoxicillin 250mg", movement_type: "ExpiryWriteOff", quantity_before: 75, quantity_change: -15, quantity_after: 60, reference_type: "Batch", batch_id: "b1", reason: "Expired stock removed", created_by_user_id: "u_mgr", created_at: daysFromNow(-5) },
  { id: uid(), product_id: "p1", product_name: "Panadol 500mg", movement_type: "StocktakeReconciliation", quantity_before: 130, quantity_change: -6, quantity_after: 124, reference_type: "Stocktake", reference_id: "ST-009", reason: "Variance adj.", created_by_user_id: "u_mgr", created_at: daysFromNow(-7) },
  { id: uid(), product_id: "p5", product_name: "Vitamin C 1000mg", movement_type: "Adjustment", quantity_before: 195, quantity_change: 5, quantity_after: 200, reference_type: "Manual", reason: "Found stock", created_by_user_id: "u_mgr", created_at: daysFromNow(-4) },
  { id: uid(), product_id: "p4", product_name: "iPhone 15 Pro", movement_type: "Refund", quantity_before: 3, quantity_change: 1, quantity_after: 4, reference_type: "Refund", reference_id: "RF-118", serial_number: "SN-IPH-014", created_by_user_id: "u_clerk2", created_at: daysFromNow(-6) },
  { id: uid(), product_id: "p2", product_name: "Sony WH-1000XM5", movement_type: "Transfer", quantity_before: 12, quantity_change: -2, quantity_after: 10, reference_type: "Transfer", reference_id: "TR-22", reason: "To Store B", created_by_user_id: "u_mgr", created_at: daysFromNow(-8) },
];

const serials: SerialNumberRecord[] = [
  { id: "s1", product_id: "p2", serial_value: "SN-XM5-001", status: "Sold", sale_id: "SALE-1031", warranty_expiry_date: daysFromNow(720), created_at: daysFromNow(-30) },
  { id: "s2", product_id: "p2", serial_value: "SN-XM5-002", status: "Available", created_at: daysFromNow(-30) },
  { id: "s3", product_id: "p2", serial_value: "SN-XM5-003", status: "Defective", created_at: daysFromNow(-30) },
  { id: "s4", product_id: "p4", serial_value: "SN-IPH-014", status: "Returned", refund_id: "RF-118", warranty_expiry_date: daysFromNow(360), created_at: daysFromNow(-60) },
  { id: "s5", product_id: "p4", serial_value: "SN-IPH-015", status: "Sold", sale_id: "SALE-1019", warranty_expiry_date: daysFromNow(340), created_at: daysFromNow(-60) },
  { id: "s6", product_id: "p4", serial_value: "SN-IPH-016", status: "UnderWarranty", warranty_expiry_date: daysFromNow(300), created_at: daysFromNow(-60) },
];

const batches: ProductBatch[] = [
  { id: "b1", product_id: "p3", batch_number: "AMX-2024-A", manufacture_date: daysFromNow(-200), expiry_date: daysFromNow(5), initial_quantity: 100, remaining_quantity: 30, cost_price: 6, received_at: daysFromNow(-180) },
  { id: "b2", product_id: "p3", batch_number: "AMX-2024-B", manufacture_date: daysFromNow(-90), expiry_date: daysFromNow(40), initial_quantity: 80, remaining_quantity: 30, cost_price: 6.2, received_at: daysFromNow(-60) },
  { id: "b3", product_id: "p1", batch_number: "PAN-2025-A", manufacture_date: daysFromNow(-30), expiry_date: daysFromNow(180), initial_quantity: 150, remaining_quantity: 120, cost_price: 1.8, received_at: daysFromNow(-25) },
  { id: "b4", product_id: "p5", batch_number: "VITC-25-Q1", manufacture_date: daysFromNow(-60), expiry_date: daysFromNow(20), initial_quantity: 250, remaining_quantity: 200, cost_price: 9, received_at: daysFromNow(-40) },
];

const stocktakeSessions: StocktakeSession[] = [
  { id: "st1", store_id: "store-1", status: "Completed", started_at: daysFromNow(-20), completed_at: daysFromNow(-19), item_count: 5, variance_count: 2, created_by_user_id: "u_mgr" },
  { id: "st2", store_id: "store-1", status: "InProgress", started_at: daysFromNow(-1), item_count: 5, variance_count: 0, created_by_user_id: "u_mgr" },
];

const stocktakeItemsBySession: Record<string, StocktakeItem[]> = {
  st1: products.map((p, i) => ({
    id: `sti-st1-${i}`,
    session_id: "st1",
    product_id: p.id,
    product_name: p.name,
    system_quantity: p.stock,
    counted_quantity: i === 0 ? p.stock - 3 : i === 2 ? p.stock + 1 : p.stock,
    variance_quantity: i === 0 ? -3 : i === 2 ? 1 : 0,
  })),
  st2: products.map((p, i) => ({
    id: `sti-st2-${i}`,
    session_id: "st2",
    product_id: p.id,
    product_name: p.name,
    system_quantity: p.stock,
  })),
};

const claims: WarrantyClaim[] = [
  { id: "c1", serial_number_id: "s4", serial_value: "SN-IPH-014", product_name: "iPhone 15 Pro", claim_date: daysFromNow(-3), status: "Open", created_at: daysFromNow(-3) },
  { id: "c2", serial_number_id: "s3", serial_value: "SN-XM5-003", product_name: "Sony WH-1000XM5", claim_date: daysFromNow(-10), status: "InRepair", created_at: daysFromNow(-10) },
  { id: "c3", serial_number_id: "s6", serial_value: "SN-IPH-016", product_name: "iPhone 15 Pro", claim_date: daysFromNow(-30), status: "Resolved", resolution_notes: "Replaced battery under warranty.", created_at: daysFromNow(-30) },
];

// ---------- Helpers ----------

const computeExpiringBatches = (within = 30): ExpiringBatch[] => {
  const now = Date.now();
  return batches
    .filter((b) => b.expiry_date)
    .map((b) => {
      const days = Math.round((new Date(b.expiry_date!).getTime() - now) / 86400000);
      return {
        batch_id: b.id,
        product_id: b.product_id,
        product_name: products.find((p) => p.id === b.product_id)?.name ?? "Unknown",
        batch_number: b.batch_number,
        expiry_date: b.expiry_date!,
        remaining_quantity: b.remaining_quantity,
        days_until_expiry: days,
      };
    })
    .filter((b) => b.days_until_expiry <= within)
    .sort((a, b) => a.days_until_expiry - b.days_until_expiry);
};

// ---------- Products ----------

export async function fetchProducts(): Promise<Product[]> {
  await delay();
  return [...products];
}

export async function updateProduct(id: string, data: Partial<Product>): Promise<Product> {
  await delay();
  const idx = products.findIndex((p) => p.id === id);
  if (idx < 0) throw new Error("Product not found");
  products[idx] = { ...products[idx], ...data };
  return products[idx];
}

export async function createProduct(data: Omit<Product, "id">): Promise<Product> {
  await delay();
  const p: Product = { id: uid(), ...data };
  products.push(p);
  return p;
}

// ---------- Dashboard ----------

export async function fetchInventoryDashboard(): Promise<InventoryDashboard> {
  await delay();
  const expiry_alerts = computeExpiringBatches(30);
  return {
    low_stock_count: products.filter((p) => p.stock < 10).length,
    expiry_alert_count: expiry_alerts.length,
    open_stocktake_sessions: stocktakeSessions.filter((s) => s.status !== "Completed").length,
    open_warranty_claims: claims.filter((c) => c.status === "Open" || c.status === "InRepair").length,
    expiry_alerts,
  };
}

// ---------- Stock Movements ----------

export async function fetchStockMovements(params: {
  product_id?: string;
  movement_type?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
  take?: number;
} = {}): Promise<StockMovementPage> {
  await delay();
  const page = params.page ?? 1;
  const take = params.take ?? 20;
  let items = [...movements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  if (params.product_id) {
    const q = params.product_id.toLowerCase();
    items = items.filter(
      (m) => m.product_id === params.product_id || m.product_name.toLowerCase().includes(q),
    );
  }
  if (params.movement_type && params.movement_type !== "all") {
    items = items.filter((m) => m.movement_type === params.movement_type);
  }
  if (params.from_date) {
    const t = new Date(params.from_date).getTime();
    items = items.filter((m) => new Date(m.created_at).getTime() >= t);
  }
  if (params.to_date) {
    const t = new Date(params.to_date).getTime() + 86400000;
    items = items.filter((m) => new Date(m.created_at).getTime() <= t);
  }
  const total = items.length;
  const start = (page - 1) * take;
  return { items: items.slice(start, start + take), total, page, take };
}

// ---------- Serial Numbers ----------

export async function fetchSerialNumbers(productId: string): Promise<SerialNumberRecord[]> {
  await delay();
  return serials.filter((s) => s.product_id === productId);
}

export async function addSerialNumbers(
  productId: string,
  serialValues: string[],
): Promise<SerialNumberRecord[]> {
  await delay();
  const created: SerialNumberRecord[] = serialValues.map((v) => ({
    id: uid(),
    product_id: productId,
    serial_value: v,
    status: "Available",
    created_at: new Date().toISOString(),
  }));
  serials.push(...created);
  return created;
}

export async function updateSerialNumber(
  _productId: string,
  serialId: string,
  data: { status: SerialNumberRecord["status"] },
): Promise<SerialNumberRecord> {
  await delay();
  const idx = serials.findIndex((s) => s.id === serialId);
  if (idx < 0) throw new Error("Serial not found");
  serials[idx] = { ...serials[idx], status: data.status, updated_at: new Date().toISOString() };
  return serials[idx];
}

export async function lookupSerial(serialValue: string): Promise<SerialLookupResult> {
  await delay();
  const s = serials.find((x) => x.serial_value.toLowerCase() === serialValue.toLowerCase());
  if (!s) throw new Error(`Serial "${serialValue}" not found`);
  const product = products.find((p) => p.id === s.product_id);
  return {
    serial_value: s.serial_value,
    product_id: s.product_id,
    product_name: product?.name ?? "Unknown",
    status: s.status,
    sale_date: s.sale_id ? s.created_at : undefined,
    warranty_expiry_date: s.warranty_expiry_date,
  };
}

// ---------- Batches ----------

export async function fetchProductBatches(productId: string): Promise<ProductBatch[]> {
  await delay();
  return batches.filter((b) => b.product_id === productId);
}

export async function createProductBatch(
  productId: string,
  data: Partial<ProductBatch>,
): Promise<ProductBatch> {
  await delay();
  const b: ProductBatch = {
    id: uid(),
    product_id: productId,
    batch_number: data.batch_number ?? `B-${uid()}`,
    manufacture_date: data.manufacture_date,
    expiry_date: data.expiry_date,
    initial_quantity: data.initial_quantity ?? 0,
    remaining_quantity: data.remaining_quantity ?? data.initial_quantity ?? 0,
    cost_price: data.cost_price ?? 0,
    supplier_id: data.supplier_id,
    purchase_bill_id: data.purchase_bill_id,
    received_at: new Date().toISOString(),
  };
  batches.push(b);
  return b;
}

export async function updateProductBatch(
  _productId: string,
  batchId: string,
  data: Partial<ProductBatch>,
): Promise<ProductBatch> {
  await delay();
  const idx = batches.findIndex((b) => b.id === batchId);
  if (idx < 0) throw new Error("Batch not found");
  batches[idx] = { ...batches[idx], ...data };
  return batches[idx];
}

export async function fetchExpiringBatches(days = 30): Promise<ExpiringBatch[]> {
  await delay();
  return computeExpiringBatches(days);
}

// ---------- Stocktake ----------

export async function fetchStocktakeSessions(params: {
  status?: string;
  page?: number;
  take?: number;
} = {}): Promise<StocktakeSession[]> {
  await delay();
  let items = [...stocktakeSessions].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  );
  if (params.status && params.status !== "all") {
    items = items.filter((s) => s.status === params.status);
  }
  return items;
}

export async function createStocktakeSession(): Promise<StocktakeSession> {
  await delay();
  const session: StocktakeSession = {
    id: uid(),
    store_id: "store-1",
    status: "Draft",
    started_at: new Date().toISOString(),
    item_count: products.length,
    variance_count: 0,
    created_by_user_id: "u_mgr",
  };
  stocktakeSessions.push(session);
  stocktakeItemsBySession[session.id] = products.map((p, i) => ({
    id: `sti-${session.id}-${i}`,
    session_id: session.id,
    product_id: p.id,
    product_name: p.name,
    system_quantity: p.stock,
  }));
  return session;
}

export async function getStocktakeSession(
  sessionId: string,
): Promise<{ session: StocktakeSession; items: StocktakeItem[] }> {
  await delay();
  const session = stocktakeSessions.find((s) => s.id === sessionId);
  if (!session) throw new Error("Session not found");
  return { session, items: stocktakeItemsBySession[sessionId] ?? [] };
}

export async function startStocktakeSession(sessionId: string): Promise<StocktakeSession> {
  await delay();
  const idx = stocktakeSessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) throw new Error("Session not found");
  stocktakeSessions[idx] = { ...stocktakeSessions[idx], status: "InProgress" };
  return stocktakeSessions[idx];
}

export async function updateStocktakeItem(
  sessionId: string,
  itemId: string,
  countedQty: number,
): Promise<StocktakeItem> {
  await delay(120);
  const items = stocktakeItemsBySession[sessionId] ?? [];
  const idx = items.findIndex((i) => i.id === itemId);
  if (idx < 0) throw new Error("Item not found");
  const item = items[idx];
  const variance = countedQty - item.system_quantity;
  items[idx] = { ...item, counted_quantity: countedQty, variance_quantity: variance };
  return items[idx];
}

export async function completeStocktakeSession(sessionId: string): Promise<StocktakeSession> {
  await delay();
  const idx = stocktakeSessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) throw new Error("Session not found");
  const items = stocktakeItemsBySession[sessionId] ?? [];
  const variance_count = items.filter((i) => (i.variance_quantity ?? 0) !== 0).length;
  stocktakeSessions[idx] = {
    ...stocktakeSessions[idx],
    status: "Completed",
    completed_at: new Date().toISOString(),
    variance_count,
  };
  return stocktakeSessions[idx];
}

// ---------- Warranty Claims ----------

export async function fetchWarrantyClaims(params: {
  status?: string;
  from_date?: string;
  to_date?: string;
  page?: number;
} = {}): Promise<WarrantyClaim[]> {
  await delay();
  let items = [...claims].sort(
    (a, b) => new Date(b.claim_date).getTime() - new Date(a.claim_date).getTime(),
  );
  if (params.status && params.status !== "all") {
    items = items.filter((c) => c.status === params.status);
  }
  if (params.from_date) {
    const t = new Date(params.from_date).getTime();
    items = items.filter((c) => new Date(c.claim_date).getTime() >= t);
  }
  if (params.to_date) {
    const t = new Date(params.to_date).getTime() + 86400000;
    items = items.filter((c) => new Date(c.claim_date).getTime() <= t);
  }
  return items;
}

export async function createWarrantyClaim(data: {
  serial_number_id: string;
  claim_date: string;
  notes?: string;
}): Promise<WarrantyClaim> {
  await delay();
  const serial = serials.find((s) => s.id === data.serial_number_id);
  if (!serial) throw new Error("Serial not found");
  const product = products.find((p) => p.id === serial.product_id);
  const claim: WarrantyClaim = {
    id: uid(),
    serial_number_id: data.serial_number_id,
    serial_value: serial.serial_value,
    product_name: product?.name ?? "Unknown",
    claim_date: data.claim_date,
    status: "Open",
    resolution_notes: data.notes,
    created_at: new Date().toISOString(),
  };
  claims.push(claim);
  return claim;
}

export async function updateWarrantyClaim(
  claimId: string,
  data: { status: WarrantyClaim["status"]; resolution_notes?: string },
): Promise<WarrantyClaim> {
  await delay();
  const idx = claims.findIndex((c) => c.id === claimId);
  if (idx < 0) throw new Error("Claim not found");
  claims[idx] = { ...claims[idx], ...data };
  return claims[idx];
}
