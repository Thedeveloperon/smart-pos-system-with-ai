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

public sealed class Brand
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public required string Name { get; set; }
    public string? Code { get; set; }
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
    public Guid? BrandId { get; set; }
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
    public Brand? Brand { get; set; }
    public InventoryRecord? Inventory { get; set; }
    public ICollection<SaleItem> SaleItems { get; set; } = [];
    public ICollection<PurchaseBillItem> PurchaseBillItems { get; set; } = [];
    public ICollection<ProductSupplier> ProductSuppliers { get; set; } = [];
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
    public ICollection<ProductSupplier> ProductSuppliers { get; set; } = [];
}

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

    public required Product Product { get; set; }
    public required Supplier Supplier { get; set; }
}

public sealed class ShopProfile
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string ShopName { get; set; } = "SmartPOS Lanka";
    public string Language { get; set; } = "english";
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? Phone { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }
    public string? LogoUrl { get; set; }
    public string? ReceiptFooter { get; set; }
    public bool ShowNewItemForCashier { get; set; } = true;
    public bool ShowManageForCashier { get; set; } = true;
    public bool ShowReportsForCashier { get; set; } = true;
    public bool ShowAiInsightsForCashier { get; set; } = true;
    public bool ShowHeldBillsForCashier { get; set; } = true;
    public bool ShowRemindersForCashier { get; set; } = true;
    public bool ShowAuditTrailForCashier { get; set; } = true;
    public bool ShowEndShiftForCashier { get; set; } = true;
    public bool ShowTodaySalesForCashier { get; set; } = true;
    public bool ShowImportBillForCashier { get; set; } = true;
    public bool ShowShopSettingsForCashier { get; set; } = true;
    public bool ShowMyLicensesForCashier { get; set; } = true;
    public bool ShowOfflineSyncForCashier { get; set; } = true;
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
    public decimal SafetyStock { get; set; }
    public decimal TargetStockLevel { get; set; }
    public bool AllowNegativeStock { get; set; } = true;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public required Product Product { get; set; }
}

public sealed class ShopStockSettings
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? StoreId { get; set; }
    public decimal DefaultLowStockThreshold { get; set; } = 5m;
    public decimal ThresholdMultiplier { get; set; } = 1m;
    public decimal DefaultSafetyStock { get; set; }
    public int DefaultLeadTimeDays { get; set; } = 7;
    public decimal DefaultTargetDaysOfCover { get; set; } = 14m;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }
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
    public bool CustomPayoutUsed { get; set; }
    public decimal CashShortAmount { get; set; }
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
    public ICollection<AiConversation> AiConversations { get; set; } = [];
    public ICollection<AiConversationMessage> AiConversationMessages { get; set; } = [];
    public ICollection<AiSmartReportJob> AiSmartReportJobs { get; set; } = [];
    public ICollection<ReminderRule> ReminderRules { get; set; } = [];
    public ICollection<ReminderEvent> ReminderEvents { get; set; } = [];
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
    public string? DrawerCountsJson { get; set; }
    public decimal? DrawerTotal { get; set; }
    public DateTimeOffset? DrawerUpdatedAtUtc { get; set; }
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
    public Guid? OfflineGrantId { get; set; }
    public DateTimeOffset? OfflineGrantIssuedAtUtc { get; set; }
    public DateTimeOffset? OfflineGrantExpiresAtUtc { get; set; }
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
    public ICollection<ManualBillingInvoice> ManualBillingInvoices { get; set; } = [];
    public ICollection<ManualBillingPayment> ManualBillingPayments { get; set; } = [];
    public ICollection<CustomerActivationEntitlement> CustomerActivationEntitlements { get; set; } = [];
    public ICollection<AiCreditOrder> AiCreditOrders { get; set; } = [];
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
    public string? DeviceKeyFingerprint { get; set; }
    public string? DevicePublicKeySpki { get; set; }
    public string? DeviceKeyAlgorithm { get; set; }
    public DateTimeOffset? DeviceKeyRegisteredAtUtc { get; set; }

    public required Shop Shop { get; set; }
    public ICollection<LicenseRecord> Licenses { get; set; } = [];
    public ICollection<LicenseAuditLog> AuditLogs { get; set; } = [];
}

public sealed class DeviceKeyChallenge
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string DeviceCode { get; set; }
    public required string Nonce { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAtUtc { get; set; } = DateTimeOffset.UtcNow.AddMinutes(5);
    public DateTimeOffset? ConsumedAtUtc { get; set; }
}

public sealed class DeviceActionChallenge
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public required string DeviceCode { get; set; }
    public required string Nonce { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAtUtc { get; set; } = DateTimeOffset.UtcNow.AddMinutes(2);
    public DateTimeOffset? ConsumedAtUtc { get; set; }
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

public sealed class LicenseTokenSession
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public Guid ProvisionedDeviceId { get; set; }
    public Guid LicenseId { get; set; }
    public required string Jti { get; set; }
    public DateTimeOffset IssuedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAtUtc { get; set; } = DateTimeOffset.UtcNow.AddMinutes(15);
    public DateTimeOffset RejectAfterUtc { get; set; } = DateTimeOffset.UtcNow.AddMinutes(15);
    public DateTimeOffset? RevokedAtUtc { get; set; }
    public string? ReplacedByJti { get; set; }
    public DateTimeOffset? LastValidatedAtUtc { get; set; }
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

public sealed class ManualBillingInvoice
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public required string InvoiceNumber { get; set; }
    public decimal AmountDue { get; set; }
    public decimal AmountPaid { get; set; }
    public string Currency { get; set; } = "LKR";
    public ManualBillingInvoiceStatus Status { get; set; } = ManualBillingInvoiceStatus.Open;
    public DateTimeOffset DueAtUtc { get; set; } = DateTimeOffset.UtcNow.AddDays(7);
    public string? Notes { get; set; }
    public string? CreatedBy { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public required Shop Shop { get; set; }
    public ICollection<ManualBillingPayment> Payments { get; set; } = [];
}

public sealed class ManualBillingPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public Guid InvoiceId { get; set; }
    public ManualBillingPaymentMethod Method { get; set; } = ManualBillingPaymentMethod.BankDeposit;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "LKR";
    public ManualBillingPaymentStatus Status { get; set; } = ManualBillingPaymentStatus.PendingVerification;
    public string? BankReference { get; set; }
    public string? DepositSlipUrl { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public string? Notes { get; set; }
    public string? RecordedBy { get; set; }
    public string? VerifiedBy { get; set; }
    public DateTimeOffset? VerifiedAtUtc { get; set; }
    public string? RejectedBy { get; set; }
    public DateTimeOffset? RejectedAtUtc { get; set; }
    public string? RejectionReason { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public required Shop Shop { get; set; }
    public required ManualBillingInvoice Invoice { get; set; }
}

public sealed class CustomerActivationEntitlement
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public required string EntitlementKeyHash { get; set; }
    public required string EntitlementKey { get; set; }
    public string Source { get; set; } = "payment_success";
    public string? SourceReference { get; set; }
    public ActivationEntitlementStatus Status { get; set; } = ActivationEntitlementStatus.Active;
    public int MaxActivations { get; set; } = 1;
    public int ActivationsUsed { get; set; }
    public string? IssuedBy { get; set; }
    public DateTimeOffset IssuedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset ExpiresAtUtc { get; set; } = DateTimeOffset.UtcNow.AddDays(30);
    public DateTimeOffset? LastUsedAtUtc { get; set; }
    public DateTimeOffset? RevokedAtUtc { get; set; }

    public required Shop Shop { get; set; }
}

public sealed class AiCreditWallet
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public decimal AvailableCredits { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public required AppUser User { get; set; }
    public ICollection<AiCreditLedgerEntry> LedgerEntries { get; set; } = [];
}

public sealed class AiCreditLedgerEntry
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid WalletId { get; set; }
    public Guid? AiInsightRequestId { get; set; }
    public AiCreditLedgerEntryType EntryType { get; set; } = AiCreditLedgerEntryType.Adjustment;
    public decimal DeltaCredits { get; set; }
    public decimal BalanceAfterCredits { get; set; }
    public string? Reference { get; set; }
    public string? Description { get; set; }
    public string? MetadataJson { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public required AppUser User { get; set; }
    public required AiCreditWallet Wallet { get; set; }
    public AiInsightRequest? AiInsightRequest { get; set; }
}

public sealed class AiInsightRequest
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string IdempotencyKey { get; set; } = string.Empty;
    public AiInsightRequestStatus Status { get; set; } = AiInsightRequestStatus.Pending;
    public string Provider { get; set; } = "local";
    public string Model { get; set; } = string.Empty;
    public AiUsageType UsageType { get; set; } = AiUsageType.QuickInsights;
    public string PromptHash { get; set; } = string.Empty;
    public int PromptCharCount { get; set; }
    public decimal ReservedCredits { get; set; }
    public decimal ChargedCredits { get; set; }
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public string? ResponseText { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }
    public DateTimeOffset? CompletedAtUtc { get; set; }

    public required AppUser User { get; set; }
    public ICollection<AiCreditLedgerEntry> LedgerEntries { get; set; } = [];
}

public sealed class AiCreditPayment
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public AiCreditPaymentStatus Status { get; set; } = AiCreditPaymentStatus.Pending;
    public string Provider { get; set; } = "mockpay";
    public string? ProviderPaymentId { get; set; }
    public string? ProviderCheckoutSessionId { get; set; }
    public string ExternalReference { get; set; } = string.Empty;
    public decimal CreditsPurchased { get; set; }
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "USD";
    public string? PurchaseReference { get; set; }
    public string? LastWebhookEventId { get; set; }
    public string? LastWebhookEventType { get; set; }
    public string? FailureReason { get; set; }
    public string? MetadataJson { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }
    public DateTimeOffset? CompletedAtUtc { get; set; }

    public required AppUser User { get; set; }
    public ICollection<AiCreditPaymentWebhookEvent> WebhookEvents { get; set; } = [];
}

public sealed class AiCreditPaymentWebhookEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Provider { get; set; } = "mockpay";
    public string ProviderEventId { get; set; } = string.Empty;
    public string EventType { get; set; } = string.Empty;
    public string Status { get; set; } = "processing";
    public Guid? PaymentId { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset ReceivedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? ProcessedAtUtc { get; set; }
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public AiCreditPayment? Payment { get; set; }
}

public sealed class AiCreditOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ShopId { get; set; }
    public Guid? InvoiceId { get; set; }
    public Guid? PaymentId { get; set; }
    public Guid? TargetUserId { get; set; }
    public string? TargetUsername { get; set; }
    public string? PackageCode { get; set; }
    public decimal RequestedCredits { get; set; }
    public decimal SettledCredits { get; set; }
    public AiCreditOrderStatus Status { get; set; } = AiCreditOrderStatus.Submitted;
    public string Source { get; set; } = "marketing_website";
    public string? WalletLedgerReference { get; set; }
    public string? SettlementError { get; set; }
    public string? MetadataJson { get; set; }
    public DateTimeOffset SubmittedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? VerifiedAtUtc { get; set; }
    public DateTimeOffset? RejectedAtUtc { get; set; }
    public DateTimeOffset? SettledAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public required Shop Shop { get; set; }
    public ManualBillingInvoice? Invoice { get; set; }
    public ManualBillingPayment? Payment { get; set; }
    public AppUser? TargetUser { get; set; }
}

public sealed class AiConversation
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public string Title { get; set; } = "AI Chat";
    public AiUsageType DefaultUsageType { get; set; } = AiUsageType.QuickInsights;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastMessageAtUtc { get; set; }

    public required AppUser User { get; set; }
    public ICollection<AiConversationMessage> Messages { get; set; } = [];
}

public sealed class AiConversationMessage
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid ConversationId { get; set; }
    public Guid UserId { get; set; }
    public AiConversationMessageRole Role { get; set; } = AiConversationMessageRole.User;
    public AiConversationMessageStatus Status { get; set; } = AiConversationMessageStatus.Pending;
    public AiUsageType UsageType { get; set; } = AiUsageType.QuickInsights;
    public string Content { get; set; } = string.Empty;
    public string? IdempotencyKey { get; set; }
    public string? CitationsJson { get; set; }
    public string? BlocksJson { get; set; }
    public string? Confidence { get; set; }
    public decimal ReservedCredits { get; set; }
    public decimal ChargedCredits { get; set; }
    public decimal RefundedCredits { get; set; }
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public string? ErrorCode { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? CompletedAtUtc { get; set; }

    public required AiConversation Conversation { get; set; }
    public required AppUser User { get; set; }
}

public sealed class AiSmartReportJob
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public AiSmartReportCadence Cadence { get; set; } = AiSmartReportCadence.Weekly;
    public AiSmartReportJobStatus Status { get; set; } = AiSmartReportJobStatus.Pending;
    public DateTimeOffset PeriodStartUtc { get; set; }
    public DateTimeOffset PeriodEndUtc { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Summary { get; set; }
    public string? PayloadJson { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? StartedAtUtc { get; set; }
    public DateTimeOffset? CompletedAtUtc { get; set; }
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public required AppUser User { get; set; }
}

public sealed class ReminderRule
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public ReminderRuleType RuleType { get; set; } = ReminderRuleType.LowStock;
    public bool IsEnabled { get; set; } = true;
    public decimal? LowStockThreshold { get; set; }
    public DateTimeOffset? SnoozedUntilUtc { get; set; }
    public DateTimeOffset? LastEvaluatedAtUtc { get; set; }
    public DateTimeOffset? LastTriggeredAtUtc { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public required AppUser User { get; set; }
    public ICollection<ReminderEvent> Events { get; set; } = [];
}

public sealed class ReminderEvent
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }
    public Guid? RuleId { get; set; }
    public ReminderEventType EventType { get; set; } = ReminderEventType.LowStockThresholdCrossed;
    public ReminderSeverity Severity { get; set; } = ReminderSeverity.Info;
    public ReminderEventStatus Status { get; set; } = ReminderEventStatus.Open;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string? ActionPath { get; set; }
    public string? Fingerprint { get; set; }
    public string? MetadataJson { get; set; }
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? AcknowledgedAtUtc { get; set; }
    public DateTimeOffset? ExpiresAtUtc { get; set; }
    public DateTimeOffset? UpdatedAtUtc { get; set; }

    public required AppUser User { get; set; }
    public ReminderRule? Rule { get; set; }
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

public enum ManualBillingInvoiceStatus
{
    Open = 1,
    PendingVerification = 2,
    Paid = 3,
    Overdue = 4,
    Canceled = 5
}

public enum ManualBillingPaymentMethod
{
    Cash = 1,
    BankDeposit = 2,
    BankTransfer = 3
}

public enum ManualBillingPaymentStatus
{
    PendingVerification = 1,
    Verified = 2,
    Rejected = 3
}

public enum ActivationEntitlementStatus
{
    Active = 1,
    Revoked = 2,
    Expired = 3
}

public enum AiCreditLedgerEntryType
{
    Purchase = 1,
    Reserve = 2,
    Charge = 3,
    Refund = 4,
    Adjustment = 5
}

public enum AiInsightRequestStatus
{
    Pending = 1,
    Succeeded = 2,
    Failed = 3
}

public enum AiCreditPaymentStatus
{
    Pending = 1,
    Succeeded = 2,
    Failed = 3,
    Refunded = 4,
    Canceled = 5
}

public enum AiCreditOrderStatus
{
    Submitted = 1,
    PendingVerification = 2,
    Verified = 3,
    Rejected = 4,
    Settled = 5
}

public enum AiUsageType
{
    QuickInsights = 1,
    AdvancedAnalysis = 2,
    SmartReports = 3
}

public enum AiConversationMessageRole
{
    User = 1,
    Assistant = 2,
    System = 3
}

public enum AiConversationMessageStatus
{
    Pending = 1,
    Succeeded = 2,
    Failed = 3
}

public enum AiSmartReportCadence
{
    Weekly = 1,
    Monthly = 2
}

public enum AiSmartReportJobStatus
{
    Pending = 1,
    Running = 2,
    Succeeded = 3,
    Failed = 4
}

public enum ReminderRuleType
{
    LowStock = 1,
    UpdateAvailable = 2,
    SubscriptionFollowUp = 3,
    WeeklySmartReport = 4,
    MonthlySmartReport = 5
}

public enum ReminderEventType
{
    LowStockThresholdCrossed = 1,
    UpdateAvailable = 2,
    SubscriptionFollowUp = 3,
    WeeklyReportReady = 4,
    MonthlyReportReady = 5
}

public enum ReminderSeverity
{
    Info = 1,
    Warning = 2,
    Critical = 3
}

public enum ReminderEventStatus
{
    Open = 1,
    Acknowledged = 2
}
