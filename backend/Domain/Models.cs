namespace SmartPos.Backend.Domain;

public sealed class Category
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public ICollection<Product> Products { get; set; } = [];
}

public sealed class Product
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public Guid? CategoryId { get; set; }
    public required string Name { get; set; }
    public string? Sku { get; set; }
    public string? Barcode { get; set; }
    public string? ImageUrl { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal CostPrice { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public Category? Category { get; set; }
    public InventoryRecord? Inventory { get; set; }
    public ICollection<SaleItem> SaleItems { get; set; } = [];
    public ICollection<PurchaseBillItem> PurchaseBillItems { get; set; } = [];
}

public sealed class Supplier
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public required string Name { get; set; }
    public string? Code { get; set; }
    public string? ContactName { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public ICollection<PurchaseBill> PurchaseBills { get; set; } = [];
}

public sealed class ShopProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ShopName { get; set; } = "SmartPOS Lanka";
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }
    public string? LogoUrl { get; set; }
    public string? ReceiptFooter { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }
}

public sealed class PurchaseBill
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public string? ImportRequestId { get; set; }
    public Guid SupplierId { get; set; }
    public required string InvoiceNumber { get; set; }
    public DateTimeOffset InvoiceDateUtc { get; set; } = DateTimeOffset.UtcNow;
    public string Currency { get; set; } = "LKR";
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public string SourceType { get; set; } = "manual";
    public decimal? OcrConfidence { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public string? Notes { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public required Supplier Supplier { get; set; }
    public AppUser? CreatedByUser { get; set; }
    public ICollection<PurchaseBillItem> Items { get; set; } = [];
    public ICollection<BillDocument> Documents { get; set; } = [];
}

public sealed class PurchaseBillItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid PurchaseBillId { get; set; }
    public Guid ProductId { get; set; }
    public required string ProductNameSnapshot { get; set; }
    public string? SupplierItemName { get; set; }
    public decimal Quantity { get; set; }
    public decimal UnitCost { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public required PurchaseBill PurchaseBill { get; set; }
    public required Product Product { get; set; }
}

public sealed class BillDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public Guid? PurchaseBillId { get; set; }
    public required string FileName { get; set; }
    public required string ContentType { get; set; }
    public string? StoragePath { get; set; }
    public string? FileHash { get; set; }
    public string OcrStatus { get; set; } = "pending";
    public decimal? OcrConfidence { get; set; }
    public string? ExtractedPayloadJson { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ProcessedAtUtc { get; set; }

    public PurchaseBill? PurchaseBill { get; set; }
}

public sealed class InventoryRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public Guid ProductId { get; set; }
    public decimal QuantityOnHand { get; set; }
    public decimal ReorderLevel { get; set; }
    public bool AllowNegativeStock { get; set; } = true;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public required Product Product { get; set; }
}

public sealed class Sale
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public required string SaleNumber { get; set; }
    public SaleStatus Status { get; set; } = SaleStatus.Held;
    public decimal Subtotal { get; set; }
    public decimal DiscountTotal { get; set; }
    public decimal TaxTotal { get; set; }
    public decimal GrandTotal { get; set; }
    public Guid? CreatedByUserId { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAtUtc { get; set; }

    public ICollection<SaleItem> Items { get; set; } = [];
    public ICollection<Payment> Payments { get; set; } = [];
    public ICollection<Refund> Refunds { get; set; } = [];
}

public sealed class SaleItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SaleId { get; set; }
    public Guid ProductId { get; set; }
    public required string ProductNameSnapshot { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal Quantity { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal LineTotal { get; set; }

    public required Sale Sale { get; set; }
    public required Product Product { get; set; }
    public ICollection<RefundItem> RefundItems { get; set; } = [];
}

public sealed class Payment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid SaleId { get; set; }
    public PaymentMethod Method { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "LKR";
    public string? ReferenceNumber { get; set; }
    public bool IsReversal { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public required Sale Sale { get; set; }
}

public sealed class LedgerEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public Guid? SaleId { get; set; }
    public LedgerEntryType EntryType { get; set; }
    public required string Description { get; set; }
    public decimal Debit { get; set; }
    public decimal Credit { get; set; }
    public DateTimeOffset OccurredAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Refund
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public Guid SaleId { get; set; }
    public required string RefundNumber { get; set; }
    public required string Reason { get; set; }
    public decimal SubtotalAmount { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal GrandTotal { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public required Sale Sale { get; set; }
    public ICollection<RefundItem> Items { get; set; } = [];
}

public sealed class RefundItem
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid RefundId { get; set; }
    public Guid SaleItemId { get; set; }
    public Guid ProductId { get; set; }
    public required string ProductNameSnapshot { get; set; }
    public decimal Quantity { get; set; }
    public decimal SubtotalAmount { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }

    public required Refund Refund { get; set; }
    public required SaleItem SaleItem { get; set; }
}

public sealed class AppUser
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public required string Username { get; set; }
    public required string FullName { get; set; }
    public required string PasswordHash { get; set; }
    public bool IsMfaEnabled { get; set; }
    public string? MfaSecret { get; set; }
    public DateTimeOffset? MfaConfiguredAtUtc { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAtUtc { get; set; }

    public ICollection<UserRole> UserRoles { get; set; } = [];
    public ICollection<Device> Devices { get; set; } = [];
    public ICollection<PurchaseBill> CreatedPurchaseBills { get; set; } = [];
}

public sealed class AppRole
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Code { get; set; }
    public required string Name { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public ICollection<UserRole> UserRoles { get; set; } = [];
}

public sealed class UserRole
{
    public Guid UserId { get; set; }
    public Guid RoleId { get; set; }
    public DateTimeOffset AssignedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public required AppUser User { get; set; }
    public required AppRole Role { get; set; }
}

public sealed class AuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public Guid? UserId { get; set; }
    public required string Action { get; set; }
    public required string EntityName { get; set; }
    public required string EntityId { get; set; }
    public string? BeforeJson { get; set; }
    public string? AfterJson { get; set; }
    public Guid? DeviceId { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class CashSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public Guid? DeviceId { get; set; }
    public Guid? AppUserId { get; set; }
    public required string CashierName { get; set; }
    public CashSessionStatus Status { get; set; } = CashSessionStatus.Active;
    public required string OpeningCountsJson { get; set; }
    public decimal OpeningTotal { get; set; }
    public DateTimeOffset OpeningSubmittedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string? OpeningApprovedBy { get; set; }
    public DateTimeOffset? OpeningApprovedAtUtc { get; set; }
    public string? ClosingCountsJson { get; set; }
    public decimal? ClosingTotal { get; set; }
    public DateTimeOffset? ClosingSubmittedAtUtc { get; set; }
    public string? ClosingApprovedBy { get; set; }
    public DateTimeOffset? ClosingApprovedAtUtc { get; set; }
    public decimal CashSalesTotal { get; set; }
    public decimal? ExpectedCash { get; set; }
    public decimal? Difference { get; set; }
    public string? DifferenceReason { get; set; }
    public DateTimeOffset OpenedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ClosedAtUtc { get; set; }
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

public sealed class Device
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public Guid? AppUserId { get; set; }
    public required string DeviceCode { get; set; }
    public required string Name { get; set; }
    public bool IsTrusted { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastSeenAtUtc { get; set; }

    public AppUser? User { get; set; }
}

public sealed class OfflineEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string EventId { get; set; }
    public Guid? StoreId { get; set; }
    public Guid? DeviceId { get; set; }
    public DateTimeOffset DeviceTimestampUtc { get; set; }
    public DateTimeOffset? ServerTimestampUtc { get; set; }
    public OfflineEventType Type { get; set; }
    public string PayloadJson { get; set; } = "{}";
    public OfflineEventStatus Status { get; set; } = OfflineEventStatus.Pending;
    public string? RejectionReason { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }
}

public sealed class Shop
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string Code { get; set; }
    public required string Name { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public ICollection<Subscription> Subscriptions { get; set; } = [];
    public ICollection<ProvisionedDevice> ProvisionedDevices { get; set; } = [];
    public ICollection<LicenseRecord> Licenses { get; set; } = [];
    public ICollection<LicenseAuditLog> LicenseAuditLogs { get; set; } = [];
}

public sealed class Subscription
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public string Plan { get; set; } = "trial";
    public SubscriptionStatus Status { get; set; } = SubscriptionStatus.Trialing;
    public DateTimeOffset PeriodStartUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset PeriodEndUtc { get; set; } = DateTimeOffset.UtcNow.AddDays(14);
    public int SeatLimit { get; set; } = 1;
    public string? FeatureFlagsJson { get; set; }
    public string? BillingCustomerId { get; set; }
    public string? BillingSubscriptionId { get; set; }
    public string? BillingPriceId { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public required Shop Shop { get; set; }
}

public sealed class ProvisionedDevice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public Guid? DeviceId { get; set; }
    public required string DeviceCode { get; set; }
    public required string Name { get; set; }
    public ProvisionedDeviceStatus Status { get; set; } = ProvisionedDeviceStatus.Active;
    public DateTimeOffset AssignedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public DateTimeOffset? LastHeartbeatAtUtc { get; set; }

    public required Shop Shop { get; set; }
    public ICollection<LicenseRecord> Licenses { get; set; } = [];
    public ICollection<LicenseAuditLog> AuditLogs { get; set; } = [];
}

public sealed class LicenseRecord
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public Guid ProvisionedDeviceId { get; set; }
    public required string Token { get; set; }
    public DateTimeOffset ValidUntil { get; set; }
    public DateTimeOffset GraceUntil { get; set; }
    public string SignatureKeyId { get; set; } = "k1";
    public string SignatureAlgorithm { get; set; } = "HS256";
    public required string Signature { get; set; }
    public LicenseRecordStatus Status { get; set; } = LicenseRecordStatus.Active;
    public DateTimeOffset IssuedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public DateTimeOffset? LastValidatedAtUtc { get; set; }

    public required Shop Shop { get; set; }
    public required ProvisionedDevice ProvisionedDevice { get; set; }
}

public sealed class LicenseAuditLog
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? ShopId { get; set; }
    public Guid? ProvisionedDeviceId { get; set; }
    public required string Action { get; set; }
    public string Actor { get; set; } = "system";
    public string? Reason { get; set; }
    public string? MetadataJson { get; set; }
    public bool IsManualOverride { get; set; }
    public string? ImmutableHash { get; set; }
    public string? ImmutablePreviousHash { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public Shop? Shop { get; set; }
    public ProvisionedDevice? ProvisionedDevice { get; set; }
}

public sealed class BillingWebhookEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string ProviderEventId { get; set; }
    public required string EventType { get; set; }
    public string Status { get; set; } = "processing";
    public Guid? ShopId { get; set; }
    public string? BillingSubscriptionId { get; set; }
    public string? LastErrorCode { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ProcessedAtUtc { get; set; }
    public DateTimeOffset? UpdatedAtUtc { get; set; }
}

public enum SaleStatus
{
    Held = 1,
    Completed = 2,
    Voided = 3,
    RefundedPartially = 4,
    RefundedFully = 5
}

public enum PaymentMethod
{
    Cash = 1,
    Card = 2,
    LankaQr = 3
}

public enum LedgerEntryType
{
    Sale = 1,
    Payment = 2,
    Refund = 3,
    Reversal = 4,
    StockAdjustment = 5
}

public enum OfflineEventType
{
    Sale = 1,
    Refund = 2,
    StockUpdate = 3
}

public enum OfflineEventStatus
{
    Pending = 1,
    Synced = 2,
    Conflict = 3,
    Rejected = 4
}

public enum CashSessionStatus
{
    Active = 1,
    Closing = 2,
    Closed = 3,
    Locked = 4
}

public enum SubscriptionStatus
{
    Trialing = 1,
    Active = 2,
    PastDue = 3,
    Canceled = 4
}

public enum LicenseState
{
    Unprovisioned = 1,
    Active = 2,
    Grace = 3,
    Suspended = 4,
    Revoked = 5
}

public enum ProvisionedDeviceStatus
{
    Active = 1,
    Revoked = 2
}

public enum LicenseRecordStatus
{
    Active = 1,
    Revoked = 2
}
