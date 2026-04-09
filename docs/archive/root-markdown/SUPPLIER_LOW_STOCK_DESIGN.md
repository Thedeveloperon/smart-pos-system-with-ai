# Supplier and Low-Stock Planning Design

## Goal

Add supplier management that lets each shop:

- see low-stock products early
- group stock alerts by brand
- plan replenishment by supplier
- keep stock rules separate per shop

This project already has:

- `Product`
- `Supplier`
- `InventoryRecord`
- purchase bills and purchase bill items
- low-stock reporting

The missing part is shop-aware inventory planning and a proper product-to-supplier link.

---

## Current Situation

### What already exists

- `InventoryRecord.QuantityOnHand`
- `InventoryRecord.ReorderLevel`
- `Supplier` master data
- `PurchaseBillItem.SupplierItemName`
- low-stock report logic

### Main limitation

Low-stock is currently too global for a multi-shop setup.

If two shops sell the same product at different speeds, they should not share the same reorder rule.

---

## Best Solution

Use this model:

- `Shop` owns stock rules
- `Brand` groups products for reporting
- `Product` belongs to one brand
- `InventoryRecord` is per shop and per product
- `ProductSupplier` connects products to suppliers
- low-stock is computed from inventory values, not stored as a permanent flag

---

## Recommended Database Fields

### 1. Brand

Create a new `Brand` table.

Fields:

- `Id`
- `StoreId` or `ShopId`
- `Name`
- `Code`
- `IsActive`
- `CreatedAtUtc`
- `UpdatedAtUtc`

Purpose:

- show low stock by brand
- filter replenishment reports by brand
- keep brand names consistent

### 2. Product

Add:

- `BrandId`

Optional:

- `PreferredSupplierId` if each product has one default supplier

Purpose:

- tie products to a brand
- make brand-based reporting easy

### 3. InventoryRecord

Keep the existing fields and make inventory shop-aware.

Fields:

- `Id`
- `ShopId` or `StoreId`
- `ProductId`
- `QuantityOnHand`
- `ReorderLevel`
- `SafetyStock`
- `TargetStockLevel`
- `AllowNegativeStock`
- `UpdatedAtUtc`

Important rule:

- unique key should be `(ShopId, ProductId)`
- not just `ProductId`

Purpose:

- each shop has its own stock
- each shop can have different reorder rules

### 4. Supplier

Keep existing supplier fields:

- `Name`
- `Code`
- `ContactName`
- `Phone`
- `Email`
- `Address`

Optional additions:

- `LeadTimeDaysDefault`
- `PaymentTermsDays`
- `PreferredCurrency`
- `Notes`

Purpose:

- supplier master record
- communication and ordering details

### 5. ProductSupplier

Create a new join table.

Fields:

- `Id`
- `ShopId` or `StoreId`
- `ProductId`
- `SupplierId`
- `SupplierSku`
- `SupplierItemName`
- `IsPreferred`
- `LeadTimeDays`
- `MinOrderQty`
- `PackSize`
- `LastPurchasePrice`
- `IsActive`
- `CreatedAtUtc`
- `UpdatedAtUtc`

Purpose:

- one product can come from multiple suppliers
- one supplier can supply many products
- choose the preferred supplier for reorder
- generate purchase suggestions correctly

### 6. ShopStockSettings

Optional but useful.

Fields:

- `ShopId`
- `DefaultLowStockThreshold`
- `DefaultSafetyStock`
- `DefaultLeadTimeDays`
- `DefaultTargetDaysOfCover`

Purpose:

- different shops can use different stock policies
- avoids hardcoding thresholds in code

---

## EF Core Entity Changes

### Product entity

Add:

- `BrandId` nullable foreign key
- optional `PreferredSupplierId`

Keep:

- `StoreId`
- `CategoryId`
- `Sku`
- `Barcode`
- `UnitPrice`
- `CostPrice`

Recommended relationship:

- `Product.HasOne(x => x.Brand).WithMany(x => x.Products)`

### Brand entity

Add:

```csharp
public sealed class Brand
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public required string Name { get; set; }
    public string? Code { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public ICollection<Product> Products { get; set; } = [];
}
```

### InventoryRecord entity

Add:

- `StoreId`
- `SafetyStock`
- `TargetStockLevel`

Keep:

- `ProductId`
- `QuantityOnHand`
- `ReorderLevel`
- `AllowNegativeStock`

Recommended rule:

- if the app already treats `StoreId` as the shop scope, use `StoreId` here to stay consistent with existing product/supplier tables
- if you later need true branch separation, you can map `StoreId` to a branch id or introduce a separate `ShopId` bridge without changing the logic

Recommended unique constraint:

- `(StoreId, ProductId)`

This replaces the current single-product uniqueness for inventory.

### Supplier entity

Keep the existing supplier table.

Optional additions:

- `LeadTimeDaysDefault`
- `PaymentTermsDays`
- `PreferredCurrency`
- `Notes`

These are optional and can come later. Do not block the first release on them.

### ProductSupplier entity

Add:

```csharp
public sealed class ProductSupplier
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public Guid ProductId { get; set; }
    public Guid SupplierId { get; set; }
    public string? SupplierSku { get; set; }
    public string? SupplierItemName { get; set; }
    public bool IsPreferred { get; set; }
    public int? LeadTimeDays { get; set; }
    public decimal? MinOrderQty { get; set; }
    public decimal? PackSize { get; set; }
    public decimal? LastPurchasePrice { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }
}
```

Recommended unique constraints:

- `(StoreId, ProductId, SupplierId)`
- optional filtered unique index for one preferred supplier per product per store

### ShopStockSettings entity

Add:

```csharp
public sealed class ShopStockSettings
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid StoreId { get; set; }
    public decimal DefaultLowStockThreshold { get; set; } = 5m;
    public decimal DefaultSafetyStock { get; set; }
    public int DefaultLeadTimeDays { get; set; } = 7;
    public decimal DefaultTargetDaysOfCover { get; set; } = 14m;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }
}
```

This is optional for phase 1, but it is the cleanest way to avoid hardcoded thresholds.

---

## EF Core Configuration

### Brand

Add:

- table name `brands`
- unique index on `(StoreId, Name)`
- unique index on `(StoreId, Code)` if code is used

### Product

Add:

- `BrandId` foreign key
- index on `BrandId`

### InventoryRecord

Add:

- `StoreId` column if it does not exist yet
- precision for new numeric fields
- unique index on `(StoreId, ProductId)`

### ProductSupplier

Add:

- table name `product_suppliers`
- foreign keys to `products` and `suppliers`
- indexes on `ProductId`, `SupplierId`, and `StoreId`

### ShopStockSettings

Add:

- table name `shop_stock_settings`
- unique index on `StoreId`

---

## Migration Plan

### Migration 1: Add schema

Create a single migration that:

1. adds `BrandId` to `products`
2. creates `brands`
3. extends `inventory`
4. creates `product_suppliers`
5. creates `shop_stock_settings` if you want defaults now

### Migration 2: Backfill data

Backfill in-place:

- create one default brand per store if needed, or keep `BrandId` null initially
- set `InventoryRecord.StoreId` from the owning product if the inventory is already store-bound in your app
- create a preferred supplier link from the latest purchase bill supplier when available

### Migration 3: Add constraints carefully

Only after the data is clean:

- enforce `(StoreId, ProductId)` on inventory
- enforce `(StoreId, ProductId, SupplierId)` on product suppliers
- optionally enforce a single preferred supplier per product per store

### Migration 4: Update reports and writes

Change the application code so that:

- product create/update accepts `brand_id`
- low-stock report filters by store
- supplier ordering uses `ProductSupplier`

### Deployment Order

1. deploy schema additions first
2. deploy read-path changes next
3. backfill existing data
4. enable strict uniqueness constraints
5. enable supplier ordering UI/API

This order prevents downtime and lets the app run during the transition.

---

## Low-Stock Logic

Do not store `IsLowStock` permanently.

Compute it from the current stock data:

```text
is_low_stock = QuantityOnHand <= max(ReorderLevel, ShopDefaultLowStockThreshold)
```

Better planning formula:

```text
ReorderPoint = ExpectedDailySales * LeadTimeDays + SafetyStock
```

Then:

```text
ReorderQty = TargetStockLevel - QuantityOnHand
```

This is the best choice if you want early ordering before stock becomes critical.

---

## Reporting That Should Be Supported

### 1. Low stock by shop

Show:

- product
- brand
- current stock
- reorder level
- deficit
- preferred supplier

### 2. Low stock by brand

Show:

- brand name
- number of low-stock products
- total deficit
- estimated reorder value

### 3. Low stock by supplier

Show:

- supplier name
- products to order
- total suggested order quantity
- estimated cost

### 4. Reorder suggestion list

Show:

- product
- brand
- supplier
- current qty
- suggested order qty
- last purchase cost
- expected lead time

---

## Backend API Spec for Supplier Ordering

### Core principles

1. Low stock is computed from inventory values.
2. APIs should be scoped to the active store/shop context.
3. Supplier ordering should be suggestion-first, not automatic.
4. Purchase drafts should be reviewable before confirmation.

### Read APIs

#### 1. Low stock report

`GET /api/reports/low-stock`

Current report can stay, but it should accept store scope internally or through the current user context.

Recommended query params:

- `take`
- `threshold`
- `brand_id`
- `supplier_id`

Response should include:

- `product_id`
- `product_name`
- `brand_name`
- `sku`
- `barcode`
- `quantity_on_hand`
- `reorder_level`
- `alert_level`
- `deficit`
- `preferred_supplier_id`
- `preferred_supplier_name`

#### 2. Low stock by brand

`GET /api/reports/low-stock/by-brand`

Query params:

- `take`
- `threshold`

Response:

- `brand_id`
- `brand_name`
- `low_stock_count`
- `total_deficit`
- `estimated_reorder_value`
- `items`

#### 3. Low stock by supplier

`GET /api/reports/low-stock/by-supplier`

Query params:

- `take`
- `threshold`

Response:

- `supplier_id`
- `supplier_name`
- `item_count`
- `total_deficit`
- `estimated_cost`
- `items`

#### 4. Reorder suggestions

`GET /api/purchases/reorder-suggestions`

Query params:

- `store_id` or use the active store context
- `brand_id` optional
- `supplier_id` optional
- `include_inactive` optional
- `take` optional

Response:

- `product_id`
- `product_name`
- `brand_id`
- `brand_name`
- `supplier_id`
- `supplier_name`
- `quantity_on_hand`
- `reorder_level`
- `safety_stock`
- `target_stock_level`
- `lead_time_days`
- `suggested_order_qty`
- `min_order_qty`
- `pack_size`
- `last_purchase_price`

### Write APIs

#### 1. Upsert product supplier mapping

`POST /api/products/{productId}/suppliers`

Request:

- `supplier_id`
- `supplier_sku`
- `supplier_item_name`
- `is_preferred`
- `lead_time_days`
- `min_order_qty`
- `pack_size`
- `last_purchase_price`
- `is_active`

Behavior:

- creates or updates the mapping for the product and supplier
- if `is_preferred = true`, clear other preferred mappings for that product in the same store

#### 2. Set preferred supplier

`PUT /api/products/{productId}/preferred-supplier`

Request:

- `supplier_id`

Behavior:

- marks that supplier mapping as preferred
- optionally unsets other preferred mappings

#### 3. Update inventory planning values

`PUT /api/products/{productId}/inventory-settings`

Request:

- `reorder_level`
- `safety_stock`
- `target_stock_level`
- `allow_negative_stock`

Behavior:

- updates the inventory planning values for the current store

#### 4. Create reorder draft

`POST /api/purchases/reorder-drafts`

Request:

- `supplier_id`
- `items[]`
- `notes`

Each item:

- `product_id`
- `quantity`
- `unit_cost`
- `supplier_item_name`

Behavior:

- creates a draft purchase bill or draft reorder record
- does not change stock
- can be reviewed and confirmed later

#### 5. Confirm reorder draft

`POST /api/purchases/reorder-drafts/{draftId}/confirm`

Behavior:

- creates the purchase bill
- updates inventory
- records audit trail

### Suggested DTOs

#### Reorder suggestion row

```csharp
public sealed class ReorderSuggestionRow
{
    public Guid ProductId { get; set; }
    public string ProductName { get; set; } = string.Empty;
    public Guid? BrandId { get; set; }
    public string? BrandName { get; set; }
    public Guid? SupplierId { get; set; }
    public string? SupplierName { get; set; }
    public decimal QuantityOnHand { get; set; }
    public decimal ReorderLevel { get; set; }
    public decimal SafetyStock { get; set; }
    public decimal TargetStockLevel { get; set; }
    public int? LeadTimeDays { get; set; }
    public decimal SuggestedOrderQty { get; set; }
    public decimal? MinOrderQty { get; set; }
    public decimal? PackSize { get; set; }
    public decimal? LastPurchasePrice { get; set; }
}
```

#### Product supplier upsert request

```csharp
public sealed class UpsertProductSupplierRequest
{
    public Guid SupplierId { get; set; }
    public string? SupplierSku { get; set; }
    public string? SupplierItemName { get; set; }
    public bool IsPreferred { get; set; }
    public int? LeadTimeDays { get; set; }
    public decimal? MinOrderQty { get; set; }
    public decimal? PackSize { get; set; }
    public decimal? LastPurchasePrice { get; set; }
    public bool IsActive { get; set; } = true;
}
```

### Authorization

Use the current manager-or-owner policy for all write APIs.

Recommended access:

- `GET` reports: manager or owner
- supplier mapping writes: manager or owner
- reorder draft creation: manager or owner
- reorder confirmation: manager or owner

### Validation rules

- `QuantityOnHand` must not be negative unless `AllowNegativeStock` is enabled
- `ReorderLevel`, `SafetyStock`, and `TargetStockLevel` must be non-negative
- `TargetStockLevel` should be greater than or equal to `ReorderLevel`
- `LeadTimeDays` must be positive when provided
- `MinOrderQty` and `PackSize` must be positive when provided
- only one preferred supplier should exist per product per store

### Suggested workflow

1. manager reviews low-stock report
2. manager filters by brand or supplier
3. system builds reorder suggestions
4. manager creates a draft purchase order
5. manager confirms the draft
6. stock updates through the existing purchase flow

### Recommended endpoint order

If you build this in phases, do it in this order:

1. `GET /api/reports/low-stock`
2. `GET /api/reports/low-stock/by-brand`
3. `GET /api/reports/low-stock/by-supplier`
4. `POST /api/products/{productId}/suppliers`
5. `GET /api/purchases/reorder-suggestions`
6. `POST /api/purchases/reorder-drafts`
7. `POST /api/purchases/reorder-drafts/{draftId}/confirm`

This gives you reporting first, then ordering.

---

## Minimal Schema If You Want To Start Small

If you want the fastest safe implementation, add only:

- `Brand`
- `Product.BrandId`
- `InventoryRecord.StoreId`
- `InventoryRecord.SafetyStock`
- `InventoryRecord.TargetStockLevel`
- `ProductSupplier`

This is enough to support:

- shop-level low stock
- brand grouping
- supplier-based ordering

---

## Suggested Implementation Order

### Phase 1

- make inventory shop-aware
- keep low-stock report shop filtered
- add brand support to product

### Phase 2

- add `ProductSupplier`
- store preferred supplier and lead time
- generate reorder suggestions

### Phase 3

- add shop-level stock settings
- add supplier-based purchase planning
- add dashboards by brand and supplier

---

## Design Rule

Do not force all shops to share one stock rule.

Use:

- shop-specific inventory
- product-brand grouping
- supplier mapping per product
- computed low-stock alerts

That gives you cleaner reporting and more accurate early ordering.
