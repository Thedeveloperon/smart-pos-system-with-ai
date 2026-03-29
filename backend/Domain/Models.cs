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
    public bool IsActive { get; set; } = true;
    public DateTimeOffset CreatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastLoginAtUtc { get; set; }

    public ICollection<UserRole> UserRoles { get; set; } = [];
    public ICollection<Device> Devices { get; set; } = [];
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
