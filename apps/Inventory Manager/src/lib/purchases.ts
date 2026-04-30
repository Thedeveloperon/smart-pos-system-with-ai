const delay = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));
const uid = () => Math.random().toString(36).slice(2, 10);
const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const todayIso = () => new Date().toISOString().slice(0, 10);

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

export type Supplier = {
  id: string;
  name: string;
  contact_email?: string;
};

export type PurchaseOrderStatus = "Draft" | "Sent" | "PartiallyReceived" | "Received" | "Cancelled";

export type PurchaseOrderLine = {
  id: string;
  product_id: string;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_pending: number;
  unit_cost_estimate: number;
};

export type PurchaseBillSummary = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  source_type: "manual" | "ocr_import" | "po_receipt";
  grand_total: number;
  supplier_id?: string;
  supplier_name?: string;
  purchase_order_id?: string | null;
  purchase_order_number?: string | null;
  created_at: string;
};

export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  po_number: string;
  po_date: string;
  expected_delivery_date: string | null;
  status: PurchaseOrderStatus;
  currency: string;
  subtotal_estimate: number;
  notes: string | null;
  created_at: string;
  updated_at: string | null;
  lines: PurchaseOrderLine[];
  bills: PurchaseBillSummary[];
};

export type PurchaseBillItem = {
  id: string;
  product_id: string;
  product_name: string;
  supplier_item_name: string | null;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

export type PurchaseBillDetail = {
  id: string;
  purchase_order_id: string | null;
  purchase_order_number: string | null;
  supplier_id: string;
  supplier_name: string;
  invoice_number: string;
  invoice_date: string;
  currency: string;
  subtotal: number;
  tax_total: number;
  grand_total: number;
  source_type: string;
  notes: string | null;
  created_at: string;
  items: PurchaseBillItem[];
};

export type OcrDraftLine = {
  line_number: number;
  raw_name: string;
  matched_product_id: string;
  matched_product_name: string;
  quantity: number;
  unit_cost: number;
  match_status: "matched" | "needs_review" | "unmatched";
  confidence: number | null;
};

export type PurchaseOcrDraftResponse = {
  draft_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string;
  invoice_date: string;
  tax_total: number;
  grand_total: number;
  lines: OcrDraftLine[];
};

const products: Product[] = [
  { id: "p1", name: "Panadol 500mg", sku: "PAN-500", price: 4.5, stock: 120, is_batch_tracked: true, expiry_alert_days: 30 },
  { id: "p2", name: "Sony WH-1000XM5", sku: "SNY-XM5", price: 399, stock: 8, is_serial_tracked: true, warranty_months: 24 },
  { id: "p3", name: "Amoxicillin 250mg", sku: "AMX-250", price: 12, stock: 60, is_batch_tracked: true, expiry_alert_days: 60 },
  { id: "p4", name: "iPhone 15 Pro", sku: "IPH-15P", price: 1199, stock: 4, is_serial_tracked: true, warranty_months: 12 },
  { id: "p5", name: "Vitamin C 1000mg", sku: "VITC-1K", price: 18, stock: 200, is_batch_tracked: true, expiry_alert_days: 45 },
];

const suppliers: Supplier[] = [
  { id: "sup1", name: "MediCorp Pharma", contact_email: "orders@medicorp.lk" },
  { id: "sup2", name: "Sony Lanka Distributors", contact_email: "b2b@sonylk.com" },
  { id: "sup3", name: "Apple Authorized Reseller", contact_email: "wholesale@apl.lk" },
  { id: "sup4", name: "Healthwise Supplies", contact_email: "sales@healthwise.lk" },
];

const movements: Array<{
  id: string;
  product_id: string;
  product_name: string;
  movement_type: "Sale" | "Purchase" | "Adjustment" | "Refund" | "ExpiryWriteOff" | "StocktakeReconciliation" | "Transfer";
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
}> = [
  {
    id: uid(),
    product_id: "p1",
    product_name: "Panadol 500mg",
    movement_type: "Sale",
    quantity_before: 124,
    quantity_change: -4,
    quantity_after: 120,
    reference_type: "Sale",
    reference_id: "SALE-1029",
    reason: "POS sale",
    created_by_user_id: "u_clerk1",
    created_at: daysFromNow(-1),
  },
  {
    id: uid(),
    product_id: "p2",
    product_name: "Sony WH-1000XM5",
    movement_type: "Purchase",
    quantity_before: 0,
    quantity_change: 10,
    quantity_after: 10,
    reference_type: "PurchaseBill",
    reference_id: "PB-2031",
    reason: "Restock",
    created_by_user_id: "u_mgr",
    created_at: daysFromNow(-3),
  },
];

const batches: Array<{
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
}> = [
  {
    id: "b1",
    product_id: "p3",
    batch_number: "AMX-2024-A",
    manufacture_date: daysFromNow(-200),
    expiry_date: daysFromNow(5),
    initial_quantity: 100,
    remaining_quantity: 30,
    cost_price: 6,
    received_at: daysFromNow(-180),
  },
  {
    id: "b3",
    product_id: "p1",
    batch_number: "PAN-2025-A",
    manufacture_date: daysFromNow(-30),
    expiry_date: daysFromNow(180),
    initial_quantity: 150,
    remaining_quantity: 120,
    cost_price: 1.8,
    received_at: daysFromNow(-25),
  },
];

const purchaseOrders: PurchaseOrder[] = [
  {
    id: "po1",
    supplier_id: "sup1",
    supplier_name: "MediCorp Pharma",
    po_number: "PO-2025-001",
    po_date: daysFromNow(-10),
    expected_delivery_date: daysFromNow(-3),
    status: "Received",
    currency: "LKR",
    subtotal_estimate: 600,
    notes: "Q1 stock replenishment",
    created_at: daysFromNow(-10),
    updated_at: daysFromNow(-3),
    lines: [
      { id: "pol1", product_id: "p1", product_name: "Panadol 500mg", quantity_ordered: 100, quantity_received: 100, quantity_pending: 0, unit_cost_estimate: 2 },
      { id: "pol2", product_id: "p3", product_name: "Amoxicillin 250mg", quantity_ordered: 50, quantity_received: 50, quantity_pending: 0, unit_cost_estimate: 8 },
    ],
    bills: [],
  },
  {
    id: "po2",
    supplier_id: "sup2",
    supplier_name: "Sony Lanka Distributors",
    po_number: "PO-2025-002",
    po_date: daysFromNow(-2),
    expected_delivery_date: daysFromNow(7),
    status: "Sent",
    currency: "LKR",
    subtotal_estimate: 2394,
    notes: null,
    created_at: daysFromNow(-2),
    updated_at: daysFromNow(-1),
    lines: [
      { id: "pol3", product_id: "p2", product_name: "Sony WH-1000XM5", quantity_ordered: 4, quantity_received: 0, quantity_pending: 4, unit_cost_estimate: 399 },
      { id: "pol4", product_id: "p5", product_name: "Vitamin C 1000mg", quantity_ordered: 30, quantity_received: 0, quantity_pending: 30, unit_cost_estimate: 18 },
    ],
    bills: [],
  },
];

const purchaseBills: PurchaseBillDetail[] = [
  {
    id: "bill1",
    purchase_order_id: "po1",
    purchase_order_number: "PO-2025-001",
    supplier_id: "sup1",
    supplier_name: "MediCorp Pharma",
    invoice_number: "INV-MC-7781",
    invoice_date: daysFromNow(-3),
    currency: "LKR",
    subtotal: 600,
    tax_total: 0,
    grand_total: 600,
    source_type: "po_receipt",
    notes: null,
    created_at: daysFromNow(-3),
    items: [
      {
        id: "bill1-1",
        product_id: "p1",
        product_name: "Panadol 500mg",
        supplier_item_name: null,
        quantity: 100,
        unit_cost: 2,
        line_total: 200,
      },
      {
        id: "bill1-2",
        product_id: "p3",
        product_name: "Amoxicillin 250mg",
        supplier_item_name: null,
        quantity: 50,
        unit_cost: 8,
        line_total: 400,
      },
    ],
  },
];

purchaseOrders[0].bills.push({
  id: "bill1",
  invoice_number: "INV-MC-7781",
  invoice_date: daysFromNow(-3),
  source_type: "po_receipt",
  grand_total: 600,
  supplier_id: "sup1",
  supplier_name: "MediCorp Pharma",
  purchase_order_id: "po1",
  purchase_order_number: "PO-2025-001",
  created_at: daysFromNow(-3),
});

function recomputePoStatus(po: PurchaseOrder) {
  if (po.status === "Cancelled" || po.status === "Draft") return;
  const totalOrdered = po.lines.reduce((sum, line) => sum + line.quantity_ordered, 0);
  const totalReceived = po.lines.reduce((sum, line) => sum + line.quantity_received, 0);
  if (totalReceived === 0) po.status = "Sent";
  else if (totalReceived >= totalOrdered) po.status = "Received";
  else po.status = "PartiallyReceived";
}

function clonePurchaseOrder(po: PurchaseOrder): PurchaseOrder {
  return {
    ...po,
    lines: po.lines.map((line) => ({ ...line })),
    bills: po.bills.map((bill) => ({ ...bill })),
  };
}

function clonePurchaseBill(bill: PurchaseBillDetail): PurchaseBillDetail {
  return {
    ...bill,
    items: bill.items.map((item) => ({ ...item })),
  };
}

export async function fetchProducts(): Promise<Product[]> {
  await delay();
  return products.map((product) => ({ ...product }));
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  await delay();
  return suppliers.map((supplier) => ({ ...supplier }));
}

export async function fetchPurchaseOrders(params: {
  status?: string;
  supplier_id?: string;
  from_date?: string;
  to_date?: string;
} = {}): Promise<PurchaseOrder[]> {
  await delay();
  let items = purchaseOrders.map(clonePurchaseOrder).sort(
    (a, b) => new Date(b.po_date).getTime() - new Date(a.po_date).getTime(),
  );
  if (params.status && params.status !== "all") {
    items = items.filter((order) => order.status === params.status);
  }
  if (params.supplier_id && params.supplier_id !== "all") {
    items = items.filter((order) => order.supplier_id === params.supplier_id);
  }
  if (params.from_date) {
    const fromTime = new Date(params.from_date).getTime();
    items = items.filter((order) => new Date(order.po_date).getTime() >= fromTime);
  }
  if (params.to_date) {
    const toTime = new Date(params.to_date).getTime() + 86400000;
    items = items.filter((order) => new Date(order.po_date).getTime() <= toTime);
  }
  return items;
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder> {
  await delay();
  const po = purchaseOrders.find((order) => order.id === id);
  if (!po) {
    throw new Error("Purchase order not found");
  }
  return clonePurchaseOrder(po);
}

export async function createPurchaseOrder(body: {
  supplier_id: string;
  po_number: string;
  po_date?: string;
  expected_delivery_date?: string;
  notes?: string;
  lines: { product_id: string; quantity_ordered: number; unit_cost_estimate: number }[];
}): Promise<PurchaseOrder> {
  await delay();
  const supplier = suppliers.find((item) => item.id === body.supplier_id);
  if (!supplier) {
    throw new Error("Supplier not found");
  }
  const po: PurchaseOrder = {
    id: uid(),
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    po_number: body.po_number,
    po_date: body.po_date ?? todayIso(),
    expected_delivery_date: body.expected_delivery_date ?? null,
    status: "Draft",
    currency: "LKR",
    notes: body.notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: null,
    lines: body.lines.map((line) => {
      const product = products.find((item) => item.id === line.product_id);
      return {
        id: uid(),
        product_id: line.product_id,
        product_name: product?.name ?? "Unknown",
        quantity_ordered: line.quantity_ordered,
        quantity_received: 0,
        quantity_pending: line.quantity_ordered,
        unit_cost_estimate: line.unit_cost_estimate,
      };
    }),
    bills: [],
    subtotal_estimate: body.lines.reduce((sum, line) => sum + line.quantity_ordered * line.unit_cost_estimate, 0),
  };
  purchaseOrders.push(po);
  return clonePurchaseOrder(po);
}

export async function updatePurchaseOrder(
  id: string,
  body: {
    supplier_id?: string;
    po_number?: string;
    expected_delivery_date?: string;
    notes?: string;
    lines?: { product_id: string; quantity_ordered: number; unit_cost_estimate: number }[];
  },
): Promise<PurchaseOrder> {
  await delay();
  const po = purchaseOrders.find((order) => order.id === id);
  if (!po) {
    throw new Error("PO not found");
  }
  if (body.supplier_id) {
    const supplier = suppliers.find((item) => item.id === body.supplier_id);
    if (supplier) {
      po.supplier_id = supplier.id;
      po.supplier_name = supplier.name;
    }
  }
  if (body.po_number) {
    po.po_number = body.po_number;
  }
  if (body.expected_delivery_date !== undefined) {
    po.expected_delivery_date = body.expected_delivery_date || null;
  }
  if (body.notes !== undefined) {
    po.notes = body.notes || null;
  }
  if (body.lines) {
    po.lines = body.lines.map((line) => {
      const product = products.find((item) => item.id === line.product_id);
      return {
        id: uid(),
        product_id: line.product_id,
        product_name: product?.name ?? "Unknown",
        quantity_ordered: line.quantity_ordered,
        quantity_received: 0,
        quantity_pending: line.quantity_ordered,
        unit_cost_estimate: line.unit_cost_estimate,
      };
    });
    po.subtotal_estimate = body.lines.reduce((sum, line) => sum + line.quantity_ordered * line.unit_cost_estimate, 0);
  }
  po.updated_at = new Date().toISOString();
  return clonePurchaseOrder(po);
}

export async function sendPurchaseOrder(id: string): Promise<PurchaseOrder> {
  await delay();
  const po = purchaseOrders.find((order) => order.id === id);
  if (!po) {
    throw new Error("PO not found");
  }
  if (po.status !== "Draft") {
    throw new Error("Only Draft POs can be sent");
  }
  po.status = "Sent";
  po.updated_at = new Date().toISOString();
  return clonePurchaseOrder(po);
}

export async function cancelPurchaseOrder(id: string): Promise<PurchaseOrder> {
  await delay();
  const po = purchaseOrders.find((order) => order.id === id);
  if (!po) {
    throw new Error("PO not found");
  }
  if (po.status === "Received" || po.status === "Cancelled") {
    throw new Error("Cannot cancel this PO");
  }
  po.status = "Cancelled";
  po.updated_at = new Date().toISOString();
  return clonePurchaseOrder(po);
}

export async function receivePurchaseOrder(
  id: string,
  body: {
    invoice_number: string;
    invoice_date: string;
    notes?: string;
    update_cost_price: boolean;
    lines: {
      product_id: string;
      quantity_received: number;
      unit_cost: number;
      batch_number?: string;
      expiry_date?: string;
      manufacture_date?: string;
    }[];
  },
): Promise<PurchaseOrder> {
  await delay();
  const po = purchaseOrders.find((order) => order.id === id);
  if (!po) {
    throw new Error("PO not found");
  }

  for (const receivedLine of body.lines) {
    const line = po.lines.find((item) => item.product_id === receivedLine.product_id);
    if (!line) {
      continue;
    }
    line.quantity_received += receivedLine.quantity_received;
    line.quantity_pending = Math.max(0, line.quantity_ordered - line.quantity_received);

    const product = products.find((item) => item.id === receivedLine.product_id);
    if (product) {
      const before = product.stock;
      product.stock += receivedLine.quantity_received;
      movements.push({
        id: uid(),
        product_id: product.id,
        product_name: product.name,
        movement_type: "Purchase",
        quantity_before: before,
        quantity_change: receivedLine.quantity_received,
        quantity_after: product.stock,
        reference_type: "PurchaseBill",
        reference_id: po.po_number,
        reason: `Received against ${po.po_number}`,
        created_at: new Date().toISOString(),
        created_by_user_id: "u_mgr",
      });

      if (product.is_batch_tracked && receivedLine.batch_number) {
        batches.push({
          id: uid(),
          product_id: product.id,
          batch_number: receivedLine.batch_number,
          manufacture_date: receivedLine.manufacture_date,
          expiry_date: receivedLine.expiry_date,
          initial_quantity: receivedLine.quantity_received,
          remaining_quantity: receivedLine.quantity_received,
          cost_price: receivedLine.unit_cost,
          received_at: new Date().toISOString(),
        });
      }
    }
  }

  const subtotal = body.lines.reduce((sum, line) => sum + line.quantity_received * line.unit_cost, 0);
  const billDetail: PurchaseBillDetail = {
    id: uid(),
    purchase_order_id: po.id,
    purchase_order_number: po.po_number,
    supplier_id: po.supplier_id,
    supplier_name: po.supplier_name,
    invoice_number: body.invoice_number,
    invoice_date: body.invoice_date,
    currency: "LKR",
    subtotal,
    tax_total: 0,
    grand_total: subtotal,
    source_type: "po_receipt",
    notes: body.notes ?? null,
    created_at: new Date().toISOString(),
    items: body.lines.map((line) => {
      const product = products.find((item) => item.id === line.product_id);
      return {
        id: uid(),
        product_id: line.product_id,
        product_name: product?.name ?? "Unknown",
        supplier_item_name: null,
        quantity: line.quantity_received,
        unit_cost: line.unit_cost,
        line_total: line.quantity_received * line.unit_cost,
      };
    }),
  };
  purchaseBills.push(billDetail);
  po.bills.push({
    id: billDetail.id,
    invoice_number: billDetail.invoice_number,
    invoice_date: billDetail.invoice_date,
    source_type: "po_receipt",
    grand_total: billDetail.grand_total,
    supplier_id: po.supplier_id,
    supplier_name: po.supplier_name,
    purchase_order_id: po.id,
    purchase_order_number: po.po_number,
    created_at: billDetail.created_at,
  });

  recomputePoStatus(po);
  po.updated_at = new Date().toISOString();
  return clonePurchaseOrder(po);
}

export async function fetchPurchaseBills(params: {
  supplier_id?: string;
  po_id?: string;
  from_date?: string;
  to_date?: string;
} = {}): Promise<PurchaseBillSummary[]> {
  await delay();
  let items: PurchaseBillSummary[] = purchaseBills.map((bill) => ({
    id: bill.id,
    invoice_number: bill.invoice_number,
    invoice_date: bill.invoice_date,
    source_type: bill.source_type as PurchaseBillSummary["source_type"],
    grand_total: bill.grand_total,
    supplier_id: bill.supplier_id,
    supplier_name: bill.supplier_name,
    purchase_order_id: bill.purchase_order_id,
    purchase_order_number: bill.purchase_order_number,
    created_at: bill.created_at,
  }));
  items.sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());
  if (params.supplier_id && params.supplier_id !== "all") {
    items = items.filter((bill) => bill.supplier_id === params.supplier_id);
  }
  if (params.po_id) {
    items = items.filter((bill) => bill.purchase_order_id === params.po_id);
  }
  if (params.from_date) {
    const fromTime = new Date(params.from_date).getTime();
    items = items.filter((bill) => new Date(bill.invoice_date).getTime() >= fromTime);
  }
  if (params.to_date) {
    const toTime = new Date(params.to_date).getTime() + 86400000;
    items = items.filter((bill) => new Date(bill.invoice_date).getTime() <= toTime);
  }
  return items;
}

export async function getPurchaseBill(id: string): Promise<PurchaseBillDetail> {
  await delay();
  const bill = purchaseBills.find((item) => item.id === id);
  if (!bill) {
    throw new Error("Bill not found");
  }
  return clonePurchaseBill(bill);
}

export async function createManualBill(body: {
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  purchase_order_id?: string;
  update_cost_price: boolean;
  notes?: string;
  items: {
    product_id: string;
    quantity: number;
    unit_cost: number;
    batch_number?: string;
    expiry_date?: string;
    manufacture_date?: string;
  }[];
}): Promise<PurchaseBillDetail> {
  await delay();
  const supplier = suppliers.find((item) => item.id === body.supplier_id);
  if (!supplier) {
    throw new Error("Supplier not found");
  }
  const subtotal = body.items.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
  const bill: PurchaseBillDetail = {
    id: uid(),
    purchase_order_id: body.purchase_order_id ?? null,
    purchase_order_number: body.purchase_order_id ? purchaseOrders.find((po) => po.id === body.purchase_order_id)?.po_number ?? null : null,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    invoice_number: body.invoice_number,
    invoice_date: body.invoice_date,
    currency: "LKR",
    subtotal,
    tax_total: 0,
    grand_total: subtotal,
    source_type: "manual",
    notes: body.notes ?? null,
    created_at: new Date().toISOString(),
    items: body.items.map((item) => {
      const product = products.find((entry) => entry.id === item.product_id);
      const matched = products.find((entry) => entry.id === item.product_id);
      if (product) {
        product.stock += item.quantity;
        movements.push({
          id: uid(),
          product_id: product.id,
          product_name: product.name,
          movement_type: "Purchase",
          quantity_before: product.stock - item.quantity,
          quantity_change: item.quantity,
          quantity_after: product.stock,
          reference_type: "PurchaseBill",
          reference_id: body.invoice_number,
          reason: `Manual bill ${body.invoice_number}`,
          created_at: new Date().toISOString(),
          created_by_user_id: "u_mgr",
        });

        if (product.is_batch_tracked && item.batch_number) {
          batches.push({
            id: uid(),
            product_id: product.id,
            batch_number: item.batch_number,
            manufacture_date: item.manufacture_date,
            expiry_date: item.expiry_date,
            initial_quantity: item.quantity,
            remaining_quantity: item.quantity,
            cost_price: item.unit_cost,
            received_at: new Date().toISOString(),
          });
        }
      }
      return {
        id: uid(),
        product_id: item.product_id,
        product_name: matched?.name ?? "Unknown",
        supplier_item_name: null,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        line_total: item.quantity * item.unit_cost,
      };
    }),
  };

  purchaseBills.push(bill);
  if (body.purchase_order_id) {
    const po = purchaseOrders.find((order) => order.id === body.purchase_order_id);
    if (po) {
      po.bills.push({
        id: bill.id,
        invoice_number: bill.invoice_number,
        invoice_date: bill.invoice_date,
        source_type: bill.source_type,
        grand_total: bill.grand_total,
        supplier_id: bill.supplier_id,
        supplier_name: bill.supplier_name,
        purchase_order_id: bill.purchase_order_id,
        purchase_order_number: bill.purchase_order_number,
        created_at: bill.created_at,
      });
      recomputePoStatus(po);
      po.updated_at = new Date().toISOString();
    }
  }
  return clonePurchaseBill(bill);
}

export async function createPurchaseOcrDraft(
  _file: File,
  supplierHint?: string,
): Promise<PurchaseOcrDraftResponse> {
  await delay(1200);
  const supplier =
    suppliers.find((item) =>
      supplierHint ? item.name.toLowerCase().includes(supplierHint.toLowerCase()) : false,
    ) ?? suppliers[0];
  const sample = products.slice(0, 2);
  const lines: OcrDraftLine[] = sample.map((product, index) => ({
    line_number: index + 1,
    raw_name: product.name,
    matched_product_id: product.id,
    matched_product_name: product.name,
    quantity: 10,
    unit_cost: Math.max(1, Math.round(product.price * 0.6 * 100) / 100),
    match_status: index === 0 ? "matched" : "needs_review",
    confidence: index === 0 ? 0.97 : 0.62,
  }));
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.unit_cost, 0);
  return {
    draft_id: uid(),
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    invoice_number: `AI-${uid().toUpperCase()}`,
    invoice_date: todayIso(),
    tax_total: Math.round(subtotal * 0.1 * 100) / 100,
    grand_total: Math.round(subtotal * 1.1 * 100) / 100,
    lines,
  };
}

export async function confirmPurchaseImport(body: {
  import_request_id: string;
  draft_id: string;
  supplier_id: string;
  invoice_number: string;
  invoice_date: string;
  tax_total: number;
  grand_total: number;
  approval_reason?: string;
  update_cost_price: boolean;
  items: { line_number: number; product_id: string; quantity: number; unit_cost: number; line_total: number }[];
}): Promise<PurchaseBillDetail> {
  await delay();
  const supplier = suppliers.find((item) => item.id === body.supplier_id);
  if (!supplier) {
    throw new Error("Supplier not found");
  }
  const bill: PurchaseBillDetail = {
    id: uid(),
    purchase_order_id: null,
    purchase_order_number: null,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    invoice_number: body.invoice_number,
    invoice_date: body.invoice_date,
    currency: "LKR",
    subtotal: body.grand_total - body.tax_total,
    tax_total: body.tax_total,
    grand_total: body.grand_total,
    source_type: "ocr_import",
    notes: body.approval_reason ?? null,
    created_at: new Date().toISOString(),
    items: body.items.map((line) => {
      const product = products.find((item) => item.id === line.product_id);
      if (product) {
        product.stock += line.quantity;
        movements.push({
          id: uid(),
          product_id: product.id,
          product_name: product.name,
          movement_type: "Purchase",
          quantity_before: product.stock - line.quantity,
          quantity_change: line.quantity,
          quantity_after: product.stock,
          reference_type: "PurchaseBill",
          reference_id: body.invoice_number,
          reason: `OCR import ${body.invoice_number}`,
          created_at: new Date().toISOString(),
          created_by_user_id: "u_mgr",
        });
      }
      return {
        id: uid(),
        product_id: line.product_id,
        product_name: product?.name ?? "Unknown",
        supplier_item_name: null,
        quantity: line.quantity,
        unit_cost: line.unit_cost,
        line_total: line.line_total,
      };
    }),
  };
  purchaseBills.push(bill);
  return clonePurchaseBill(bill);
}

