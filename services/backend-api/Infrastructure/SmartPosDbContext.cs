using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;

namespace SmartPos.Backend.Infrastructure;

public sealed class SmartPosDbContext(DbContextOptions<SmartPosDbContext> options) : DbContext(options)
{
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Brand> Brands => Set<Brand>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<InventoryRecord> Inventory => Set<InventoryRecord>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
    public DbSet<ProductSupplier> ProductSuppliers => Set<ProductSupplier>();
    public DbSet<ShopStockSettings> ShopStockSettings => Set<ShopStockSettings>();
    public DbSet<ShopProfile> ShopProfiles => Set<ShopProfile>();
    public DbSet<PurchaseBill> PurchaseBills => Set<PurchaseBill>();
    public DbSet<PurchaseBillItem> PurchaseBillItems => Set<PurchaseBillItem>();
    public DbSet<BillDocument> BillDocuments => Set<BillDocument>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<SaleItem> SaleItems => Set<SaleItem>();
    public DbSet<Refund> Refunds => Set<Refund>();
    public DbSet<RefundItem> RefundItems => Set<RefundItem>();
    public DbSet<Payment> Payments => Set<Payment>();
    public DbSet<LedgerEntry> Ledger => Set<LedgerEntry>();
    public DbSet<AppUser> Users => Set<AppUser>();
    public DbSet<AppRole> Roles => Set<AppRole>();
    public DbSet<UserRole> UserRoles => Set<UserRole>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<CashSession> CashSessions => Set<CashSession>();
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<OfflineEvent> OfflineEvents => Set<OfflineEvent>();
    public DbSet<Shop> Shops => Set<Shop>();
    public DbSet<Subscription> Subscriptions => Set<Subscription>();
    public DbSet<ProvisionedDevice> ProvisionedDevices => Set<ProvisionedDevice>();
    public DbSet<DeviceKeyChallenge> DeviceKeyChallenges => Set<DeviceKeyChallenge>();
    public DbSet<DeviceActionChallenge> DeviceActionChallenges => Set<DeviceActionChallenge>();
    public DbSet<LicenseRecord> Licenses => Set<LicenseRecord>();
    public DbSet<LicenseTokenSession> LicenseTokenSessions => Set<LicenseTokenSession>();
    public DbSet<LicenseAuditLog> LicenseAuditLogs => Set<LicenseAuditLog>();
    public DbSet<ShopBranchSeatAllocation> ShopBranchSeatAllocations => Set<ShopBranchSeatAllocation>();
    public DbSet<BillingWebhookEvent> BillingWebhookEvents => Set<BillingWebhookEvent>();
    public DbSet<CloudWriteIdempotencyRecord> CloudWriteIdempotencyRecords => Set<CloudWriteIdempotencyRecord>();
    public DbSet<ManualBillingInvoice> ManualBillingInvoices => Set<ManualBillingInvoice>();
    public DbSet<ManualBillingPayment> ManualBillingPayments => Set<ManualBillingPayment>();
    public DbSet<CustomerActivationEntitlement> CustomerActivationEntitlements => Set<CustomerActivationEntitlement>();
    public DbSet<AiCreditWallet> AiCreditWallets => Set<AiCreditWallet>();
    public DbSet<AiCreditLedgerEntry> AiCreditLedgerEntries => Set<AiCreditLedgerEntry>();
    public DbSet<AiInsightRequest> AiInsightRequests => Set<AiInsightRequest>();
    public DbSet<AiCreditPayment> AiCreditPayments => Set<AiCreditPayment>();
    public DbSet<AiCreditPaymentWebhookEvent> AiCreditPaymentWebhookEvents => Set<AiCreditPaymentWebhookEvent>();
    public DbSet<AiCreditWalletMigrationEntry> AiCreditWalletMigrationEntries => Set<AiCreditWalletMigrationEntry>();
    public DbSet<AiCreditOrder> AiCreditOrders => Set<AiCreditOrder>();
    public DbSet<AiConversation> AiConversations => Set<AiConversation>();
    public DbSet<AiConversationMessage> AiConversationMessages => Set<AiConversationMessage>();
    public DbSet<AiSmartReportJob> AiSmartReportJobs => Set<AiSmartReportJob>();
    public DbSet<ReminderRule> ReminderRules => Set<ReminderRule>();
    public DbSet<ReminderEvent> ReminderEvents => Set<ReminderEvent>();
    public DbSet<CloudAccountLink> CloudAccountLinks => Set<CloudAccountLink>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Category>(entity =>
        {
            entity.ToTable("categories");
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.HasIndex(x => new { x.StoreId, x.Name }).IsUnique();
        });

        modelBuilder.Entity<Brand>(entity =>
        {
            entity.ToTable("brands");
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.Code).HasMaxLength(64);
            entity.Property(x => x.Description).HasMaxLength(500);
            entity.HasIndex(x => new { x.StoreId, x.Name }).IsUnique();
            entity.HasIndex(x => new { x.StoreId, x.Code }).IsUnique();
        });

        modelBuilder.Entity<Product>(entity =>
        {
            entity.ToTable("products");
            entity.Property(x => x.Name).HasMaxLength(200);
            entity.Property(x => x.Sku).HasMaxLength(64);
            entity.Property(x => x.Barcode).HasMaxLength(64);
            entity.Property(x => x.ImageUrl).HasMaxLength(500);
            entity.Property(x => x.UnitPrice).HasPrecision(18, 2);
            entity.Property(x => x.CostPrice).HasPrecision(18, 2);
            entity.HasIndex(x => new { x.StoreId, x.Barcode }).IsUnique();
            entity.HasOne(x => x.Category)
                .WithMany(x => x.Products)
                .HasForeignKey(x => x.CategoryId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.Brand)
                .WithMany(x => x.Products)
                .HasForeignKey(x => x.BrandId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<InventoryRecord>(entity =>
        {
            entity.ToTable("inventory");
            entity.Property(x => x.InitialStockQuantity).HasPrecision(18, 3);
            entity.Property(x => x.QuantityOnHand).HasPrecision(18, 3);
            entity.Property(x => x.ReorderLevel).HasPrecision(18, 3);
            entity.Property(x => x.SafetyStock).HasPrecision(18, 3);
            entity.Property(x => x.TargetStockLevel).HasPrecision(18, 3);
            entity.HasIndex(x => x.ProductId).IsUnique();
            entity.HasIndex(x => x.StoreId);
            entity.HasOne(x => x.Product)
                .WithOne(x => x.Inventory)
                .HasForeignKey<InventoryRecord>(x => x.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Supplier>(entity =>
        {
            entity.ToTable("suppliers");
            entity.Property(x => x.Name).HasMaxLength(160);
            entity.Property(x => x.Code).HasMaxLength(64);
            entity.Property(x => x.ContactName).HasMaxLength(120);
            entity.Property(x => x.Phone).HasMaxLength(32);
            entity.Property(x => x.Email).HasMaxLength(120);
            entity.Property(x => x.Address).HasMaxLength(500);
            entity.HasIndex(x => new { x.StoreId, x.Name }).IsUnique();
            entity.HasIndex(x => new { x.StoreId, x.Code }).IsUnique();
        });

        modelBuilder.Entity<ProductSupplier>(entity =>
        {
            entity.ToTable("product_suppliers");
            entity.Property(x => x.SupplierSku).HasMaxLength(64);
            entity.Property(x => x.SupplierItemName).HasMaxLength(200);
            entity.Property(x => x.MinOrderQty).HasPrecision(18, 3);
            entity.Property(x => x.PackSize).HasPrecision(18, 3);
            entity.Property(x => x.LastPurchasePrice).HasPrecision(18, 2);
            entity.HasIndex(x => new { x.StoreId, x.ProductId, x.SupplierId }).IsUnique();
            entity.HasIndex(x => new { x.StoreId, x.ProductId }).HasFilter("\"IsPreferred\" = TRUE").IsUnique();
            entity.HasIndex(x => new { x.StoreId, x.SupplierId });
            entity.HasOne(x => x.Product)
                .WithMany(x => x.ProductSuppliers)
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Supplier)
                .WithMany(x => x.ProductSuppliers)
                .HasForeignKey(x => x.SupplierId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ShopStockSettings>(entity =>
        {
            entity.ToTable("shop_stock_settings");
            entity.Property(x => x.DefaultLowStockThreshold).HasPrecision(18, 3);
            entity.Property(x => x.ThresholdMultiplier).HasPrecision(18, 3);
            entity.Property(x => x.DefaultSafetyStock).HasPrecision(18, 3);
            entity.Property(x => x.DefaultTargetDaysOfCover).HasPrecision(18, 3);
            entity.HasIndex(x => x.StoreId).IsUnique();
        });

        modelBuilder.Entity<ShopProfile>(entity =>
        {
            entity.ToTable("shop_profiles");
            entity.Property(x => x.ShopName).HasMaxLength(160);
            entity.Property(x => x.Language).HasMaxLength(24);
            entity.Property(x => x.AddressLine1).HasMaxLength(180);
            entity.Property(x => x.AddressLine2).HasMaxLength(180);
            entity.Property(x => x.Phone).HasMaxLength(32);
            entity.Property(x => x.Email).HasMaxLength(120);
            entity.Property(x => x.Website).HasMaxLength(120);
            entity.Property(x => x.LogoUrl).HasMaxLength(500);
            entity.Property(x => x.ReceiptFooter).HasMaxLength(500);
        });

        modelBuilder.Entity<PurchaseBill>(entity =>
        {
            entity.ToTable("purchase_bills");
            entity.Property(x => x.ImportRequestId).HasMaxLength(80);
            entity.Property(x => x.InvoiceNumber).HasMaxLength(80);
            entity.Property(x => x.Currency).HasMaxLength(8);
            entity.Property(x => x.Subtotal).HasPrecision(18, 2);
            entity.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            entity.Property(x => x.TaxTotal).HasPrecision(18, 2);
            entity.Property(x => x.GrandTotal).HasPrecision(18, 2);
            entity.Property(x => x.SourceType).HasMaxLength(32);
            entity.Property(x => x.OcrConfidence).HasPrecision(6, 4);
            entity.Property(x => x.Notes).HasMaxLength(500);
            entity.HasIndex(x => new { x.StoreId, x.SupplierId, x.InvoiceNumber }).IsUnique();
            entity.HasIndex(x => new { x.StoreId, x.ImportRequestId }).IsUnique();
            entity.HasIndex(x => x.ImportRequestId).IsUnique();
            entity.HasOne(x => x.Supplier)
                .WithMany(x => x.PurchaseBills)
                .HasForeignKey(x => x.SupplierId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasOne(x => x.CreatedByUser)
                .WithMany(x => x.CreatedPurchaseBills)
                .HasForeignKey(x => x.CreatedByUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<PurchaseBillItem>(entity =>
        {
            entity.ToTable("purchase_bill_items");
            entity.Property(x => x.ProductNameSnapshot).HasMaxLength(200);
            entity.Property(x => x.SupplierItemName).HasMaxLength(200);
            entity.Property(x => x.Quantity).HasPrecision(18, 3);
            entity.Property(x => x.UnitCost).HasPrecision(18, 2);
            entity.Property(x => x.TaxAmount).HasPrecision(18, 2);
            entity.Property(x => x.LineTotal).HasPrecision(18, 2);
            entity.HasOne(x => x.PurchaseBill)
                .WithMany(x => x.Items)
                .HasForeignKey(x => x.PurchaseBillId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Product)
                .WithMany(x => x.PurchaseBillItems)
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => x.PurchaseBillId);
            entity.HasIndex(x => x.ProductId);
        });

        modelBuilder.Entity<BillDocument>(entity =>
        {
            entity.ToTable("bill_documents");
            entity.Property(x => x.FileName).HasMaxLength(260);
            entity.Property(x => x.ContentType).HasMaxLength(120);
            entity.Property(x => x.StoragePath).HasMaxLength(500);
            entity.Property(x => x.FileHash).HasMaxLength(128);
            entity.Property(x => x.OcrStatus).HasMaxLength(32);
            entity.Property(x => x.OcrConfidence).HasPrecision(6, 4);
            entity.Property(x => x.ExtractedPayloadJson).HasColumnType("text");
            entity.HasOne(x => x.PurchaseBill)
                .WithMany(x => x.Documents)
                .HasForeignKey(x => x.PurchaseBillId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasIndex(x => x.PurchaseBillId);
            entity.HasIndex(x => x.FileHash);
        });

        modelBuilder.Entity<Sale>(entity =>
        {
            entity.ToTable("sales");
            entity.Property(x => x.SaleNumber).HasMaxLength(32);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Subtotal).HasPrecision(18, 2);
            entity.Property(x => x.DiscountTotal).HasPrecision(18, 2);
            entity.Property(x => x.TaxTotal).HasPrecision(18, 2);
            entity.Property(x => x.GrandTotal).HasPrecision(18, 2);
            entity.Property(x => x.CashShortAmount).HasPrecision(18, 2);
            entity.HasIndex(x => new { x.StoreId, x.SaleNumber }).IsUnique();
        });

        modelBuilder.Entity<SaleItem>(entity =>
        {
            entity.ToTable("sale_items");
            entity.Property(x => x.ProductNameSnapshot).HasMaxLength(200);
            entity.Property(x => x.UnitPrice).HasPrecision(18, 2);
            entity.Property(x => x.Quantity).HasPrecision(18, 3);
            entity.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            entity.Property(x => x.TaxAmount).HasPrecision(18, 2);
            entity.Property(x => x.LineTotal).HasPrecision(18, 2);
            entity.HasOne(x => x.Sale)
                .WithMany(x => x.Items)
                .HasForeignKey(x => x.SaleId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Product)
                .WithMany(x => x.SaleItems)
                .HasForeignKey(x => x.ProductId)
                .OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.ToTable("payments");
            entity.Property(x => x.Method).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Amount).HasPrecision(18, 2);
            entity.Property(x => x.Currency).HasMaxLength(8);
            entity.Property(x => x.ReferenceNumber).HasMaxLength(128);
            entity.HasOne(x => x.Sale)
                .WithMany(x => x.Payments)
                .HasForeignKey(x => x.SaleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Refund>(entity =>
        {
            entity.ToTable("refunds");
            entity.Property(x => x.RefundNumber).HasMaxLength(32);
            entity.Property(x => x.Reason).HasMaxLength(250);
            entity.Property(x => x.SubtotalAmount).HasPrecision(18, 2);
            entity.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            entity.Property(x => x.TaxAmount).HasPrecision(18, 2);
            entity.Property(x => x.GrandTotal).HasPrecision(18, 2);
            entity.HasIndex(x => x.RefundNumber).IsUnique();
            entity.HasOne(x => x.Sale)
                .WithMany(x => x.Refunds)
                .HasForeignKey(x => x.SaleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<RefundItem>(entity =>
        {
            entity.ToTable("refund_items");
            entity.Property(x => x.ProductNameSnapshot).HasMaxLength(200);
            entity.Property(x => x.Quantity).HasPrecision(18, 3);
            entity.Property(x => x.SubtotalAmount).HasPrecision(18, 2);
            entity.Property(x => x.DiscountAmount).HasPrecision(18, 2);
            entity.Property(x => x.TaxAmount).HasPrecision(18, 2);
            entity.Property(x => x.TotalAmount).HasPrecision(18, 2);
            entity.HasOne(x => x.Refund)
                .WithMany(x => x.Items)
                .HasForeignKey(x => x.RefundId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.SaleItem)
                .WithMany(x => x.RefundItems)
                .HasForeignKey(x => x.SaleItemId)
                .OnDelete(DeleteBehavior.Restrict);
            entity.HasIndex(x => x.SaleItemId);
        });

        modelBuilder.Entity<LedgerEntry>(entity =>
        {
            entity.ToTable("ledger");
            entity.Property(x => x.EntryType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Description).HasMaxLength(250);
            entity.Property(x => x.Debit).HasPrecision(18, 2);
            entity.Property(x => x.Credit).HasPrecision(18, 2);
        });

        modelBuilder.Entity<AppUser>(entity =>
        {
            entity.ToTable("users");
            entity.Property(x => x.Username).HasMaxLength(64);
            entity.Property(x => x.FullName).HasMaxLength(120);
            entity.Property(x => x.PasswordHash).HasMaxLength(512);
            entity.Property(x => x.MfaSecret).HasMaxLength(256);
            entity.HasIndex(x => x.LockoutEndAtUtc);
            entity.HasIndex(x => x.Username).IsUnique();
        });

        modelBuilder.Entity<AppRole>(entity =>
        {
            entity.ToTable("roles");
            entity.Property(x => x.Code).HasMaxLength(32);
            entity.Property(x => x.Name).HasMaxLength(80);
            entity.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<UserRole>(entity =>
        {
            entity.ToTable("user_roles");
            entity.HasKey(x => new { x.UserId, x.RoleId });
            entity.HasOne(x => x.User)
                .WithMany(x => x.UserRoles)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Role)
                .WithMany(x => x.UserRoles)
                .HasForeignKey(x => x.RoleId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.ToTable("audit_logs");
            entity.Property(x => x.Action).HasMaxLength(120);
            entity.Property(x => x.EntityName).HasMaxLength(120);
            entity.Property(x => x.EntityId).HasMaxLength(64);
        });

        modelBuilder.Entity<CashSession>(entity =>
        {
            entity.ToTable("cash_sessions");
            entity.Property(x => x.CashierName).HasMaxLength(120);
            entity.Property(x => x.OpeningCountsJson).HasColumnType("text");
            entity.Property(x => x.OpeningTotal).HasPrecision(18, 2);
            entity.Property(x => x.OpeningApprovedBy).HasMaxLength(120);
            entity.Property(x => x.DrawerCountsJson).HasColumnType("text");
            entity.Property(x => x.DrawerTotal).HasPrecision(18, 2);
            entity.Property(x => x.ClosingCountsJson).HasColumnType("text");
            entity.Property(x => x.ClosingTotal).HasPrecision(18, 2);
            entity.Property(x => x.ClosingApprovedBy).HasMaxLength(120);
            entity.Property(x => x.CashSalesTotal).HasPrecision(18, 2);
            entity.Property(x => x.ExpectedCash).HasPrecision(18, 2);
            entity.Property(x => x.Difference).HasPrecision(18, 2);
            entity.Property(x => x.DifferenceReason).HasMaxLength(250);
            entity.HasIndex(x => x.DeviceId);
            entity.HasIndex(x => new { x.DeviceId, x.OpenedAtUtc });
            entity.HasIndex(x => new { x.StoreId, x.Status });
        });

        modelBuilder.Entity<Device>(entity =>
        {
            entity.ToTable("devices");
            entity.Property(x => x.DeviceCode).HasMaxLength(64);
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.AuthSessionVersion).HasDefaultValue(1);
            entity.Property(x => x.AuthSessionRevocationReason).HasMaxLength(250);
            entity.HasIndex(x => x.DeviceCode).IsUnique();
            entity.HasIndex(x => x.AuthSessionRevokedAtUtc);
            entity.HasIndex(x => new { x.AppUserId, x.AuthSessionVersion });
            entity.HasOne(x => x.User)
                .WithMany(x => x.Devices)
                .HasForeignKey(x => x.AppUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<OfflineEvent>(entity =>
        {
            entity.ToTable("offline_events");
            entity.Property(x => x.Type).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.PayloadJson).HasColumnType("text");
            entity.Property(x => x.RejectionReason).HasMaxLength(250);
            entity.HasIndex(x => x.EventId).IsUnique();
            entity.HasIndex(x => x.DeviceId);
            entity.HasIndex(x => x.OfflineGrantId);
        });

        modelBuilder.Entity<Shop>(entity =>
        {
            entity.ToTable("shops");
            entity.Property(x => x.Code).HasMaxLength(64);
            entity.Property(x => x.Name).HasMaxLength(160);
            entity.HasIndex(x => x.Code).IsUnique();
        });

        modelBuilder.Entity<Subscription>(entity =>
        {
            entity.ToTable("subscriptions");
            entity.Property(x => x.Plan).HasMaxLength(64);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.FeatureFlagsJson).HasColumnType("text");
            entity.Property(x => x.BillingCustomerId).HasMaxLength(120);
            entity.Property(x => x.BillingSubscriptionId).HasMaxLength(120);
            entity.Property(x => x.BillingPriceId).HasMaxLength(120);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.PeriodEndUtc);
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.Subscriptions)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ProvisionedDevice>(entity =>
        {
            entity.ToTable("provisioned_devices");
            entity.Property(x => x.DeviceCode).HasMaxLength(64);
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.Property(x => x.BranchCode).HasMaxLength(64);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.DeviceKeyFingerprint).HasMaxLength(128);
            entity.Property(x => x.DeviceKeyAlgorithm).HasMaxLength(64);
            entity.Property(x => x.DevicePublicKeySpki).HasColumnType("text");
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => new { x.ShopId, x.BranchCode, x.Status });
            entity.HasIndex(x => x.DeviceId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.DeviceCode).IsUnique();
            entity.HasIndex(x => x.DeviceKeyFingerprint);
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.ProvisionedDevices)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DeviceKeyChallenge>(entity =>
        {
            entity.ToTable("device_key_challenges");
            entity.Property(x => x.DeviceCode).HasMaxLength(128);
            entity.Property(x => x.Nonce).HasMaxLength(256);
            entity.HasIndex(x => x.DeviceCode);
            entity.HasIndex(x => x.ExpiresAtUtc);
            entity.HasIndex(x => x.ConsumedAtUtc);
        });

        modelBuilder.Entity<DeviceActionChallenge>(entity =>
        {
            entity.ToTable("device_action_challenges");
            entity.Property(x => x.DeviceCode).HasMaxLength(128);
            entity.Property(x => x.Nonce).HasMaxLength(256);
            entity.HasIndex(x => x.DeviceCode);
            entity.HasIndex(x => x.ExpiresAtUtc);
            entity.HasIndex(x => x.ConsumedAtUtc);
        });

        modelBuilder.Entity<LicenseRecord>(entity =>
        {
            entity.ToTable("licenses");
            entity.Property(x => x.Token).HasColumnType("text");
            entity.Property(x => x.Signature).HasColumnType("text");
            entity.Property(x => x.SignatureKeyId).HasMaxLength(64);
            entity.Property(x => x.SignatureAlgorithm).HasMaxLength(32);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.ProvisionedDeviceId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.ValidUntil);
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.Licenses)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.ProvisionedDevice)
                .WithMany(x => x.Licenses)
                .HasForeignKey(x => x.ProvisionedDeviceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LicenseTokenSession>(entity =>
        {
            entity.ToTable("license_token_sessions");
            entity.Property(x => x.Jti).HasMaxLength(120);
            entity.Property(x => x.ReplacedByJti).HasMaxLength(120);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.ProvisionedDeviceId);
            entity.HasIndex(x => x.LicenseId);
            entity.HasIndex(x => x.Jti).IsUnique();
            entity.HasIndex(x => x.RejectAfterUtc);
            entity.HasIndex(x => x.RevokedAtUtc);
            entity.HasOne<Shop>()
                .WithMany()
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<ProvisionedDevice>()
                .WithMany()
                .HasForeignKey(x => x.ProvisionedDeviceId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne<LicenseRecord>()
                .WithMany()
                .HasForeignKey(x => x.LicenseId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<LicenseAuditLog>(entity =>
        {
            entity.ToTable("license_audit_logs");
            entity.Property(x => x.Action).HasMaxLength(120);
            entity.Property(x => x.Actor).HasMaxLength(120);
            entity.Property(x => x.Reason).HasMaxLength(500);
            entity.Property(x => x.MetadataJson).HasColumnType("text");
            entity.Property(x => x.ImmutableHash).HasMaxLength(128);
            entity.Property(x => x.ImmutablePreviousHash).HasMaxLength(128);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.ProvisionedDeviceId);
            entity.HasIndex(x => x.IsManualOverride);
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.LicenseAuditLogs)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.ProvisionedDevice)
                .WithMany(x => x.AuditLogs)
                .HasForeignKey(x => x.ProvisionedDeviceId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<BillingWebhookEvent>(entity =>
        {
            entity.ToTable("billing_webhook_events");
            entity.Property(x => x.ProviderEventId).HasMaxLength(160);
            entity.Property(x => x.EventType).HasMaxLength(120);
            entity.Property(x => x.Status).HasMaxLength(32);
            entity.Property(x => x.BillingSubscriptionId).HasMaxLength(120);
            entity.Property(x => x.LastErrorCode).HasMaxLength(120);
            entity.HasIndex(x => x.ProviderEventId).IsUnique();
            entity.HasIndex(x => x.EventType);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.DeadLetteredAtUtc);
            entity.HasOne<Shop>()
                .WithMany()
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<CloudWriteIdempotencyRecord>(entity =>
        {
            entity.ToTable("cloud_write_idempotency");
            entity.Property(x => x.EndpointKey).HasMaxLength(180);
            entity.Property(x => x.IdempotencyKey).HasMaxLength(128);
            entity.Property(x => x.DeviceId).HasMaxLength(128);
            entity.Property(x => x.PosVersion).HasMaxLength(64);
            entity.Property(x => x.RequestHash).HasMaxLength(128);
            entity.Property(x => x.ResponseContentType).HasMaxLength(120);
            entity.Property(x => x.ResponseBody).HasColumnType("text");
            entity.HasIndex(x => new { x.EndpointKey, x.DeviceId, x.IdempotencyKey, x.RequestHash }).IsUnique();
            entity.HasIndex(x => x.ExpiresAtUtc);
            entity.HasIndex(x => x.CreatedAtUtc);
        });

        modelBuilder.Entity<ManualBillingInvoice>(entity =>
        {
            entity.ToTable("manual_billing_invoices");
            entity.Property(x => x.InvoiceNumber).HasMaxLength(80);
            entity.Property(x => x.AmountDue).HasPrecision(18, 2);
            entity.Property(x => x.AmountPaid).HasPrecision(18, 2);
            entity.Property(x => x.Currency).HasMaxLength(8);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Notes).HasMaxLength(500);
            entity.Property(x => x.CreatedBy).HasMaxLength(120);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.DueAtUtc);
            entity.HasIndex(x => new { x.ShopId, x.InvoiceNumber }).IsUnique();
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.ManualBillingInvoices)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ManualBillingPayment>(entity =>
        {
            entity.ToTable("manual_billing_payments");
            entity.Property(x => x.Method).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Amount).HasPrecision(18, 2);
            entity.Property(x => x.Currency).HasMaxLength(8);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.BankReference).HasMaxLength(160);
            entity.Property(x => x.DepositSlipUrl).HasMaxLength(500);
            entity.Property(x => x.Notes).HasMaxLength(500);
            entity.Property(x => x.RecordedBy).HasMaxLength(120);
            entity.Property(x => x.VerifiedBy).HasMaxLength(120);
            entity.Property(x => x.RejectedBy).HasMaxLength(120);
            entity.Property(x => x.RejectionReason).HasMaxLength(500);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.InvoiceId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.ReceivedAtUtc);
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.ManualBillingPayments)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Invoice)
                .WithMany(x => x.Payments)
                .HasForeignKey(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<CustomerActivationEntitlement>(entity =>
        {
            entity.ToTable("customer_activation_entitlements");
            entity.Property(x => x.EntitlementKeyHash).HasMaxLength(128);
            entity.Property(x => x.EntitlementKey).HasColumnType("text");
            entity.Property(x => x.Source).HasMaxLength(80);
            entity.Property(x => x.SourceReference).HasMaxLength(160);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.IssuedBy).HasMaxLength(120);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.ExpiresAtUtc);
            entity.HasIndex(x => x.EntitlementKeyHash).IsUnique();
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.CustomerActivationEntitlements)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiCreditWallet>(entity =>
        {
            entity.ToTable("ai_credit_wallets");
            entity.Property(x => x.AvailableCredits).HasPrecision(18, 2);
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => x.ShopId).IsUnique();
            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.AiCreditWallets)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ShopBranchSeatAllocation>(entity =>
        {
            entity.ToTable("shop_branch_seat_allocations");
            entity.Property(x => x.BranchCode).HasMaxLength(64);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => new { x.ShopId, x.BranchCode }).IsUnique();
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.BranchSeatAllocations)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiCreditLedgerEntry>(entity =>
        {
            entity.ToTable("ai_credit_ledger");
            entity.Property(x => x.EntryType).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.DeltaCredits).HasPrecision(18, 2);
            entity.Property(x => x.BalanceAfterCredits).HasPrecision(18, 2);
            entity.Property(x => x.Reference).HasMaxLength(120);
            entity.Property(x => x.Description).HasMaxLength(250);
            entity.Property(x => x.MetadataJson).HasColumnType("text");
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.WalletId);
            entity.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
            entity.HasIndex(x => new { x.ShopId, x.CreatedAtUtc });
            entity.HasIndex(x => x.AiInsightRequestId);
            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Shop)
                .WithMany()
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Wallet)
                .WithMany(x => x.LedgerEntries)
                .HasForeignKey(x => x.WalletId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.AiInsightRequest)
                .WithMany(x => x.LedgerEntries)
                .HasForeignKey(x => x.AiInsightRequestId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AiInsightRequest>(entity =>
        {
            entity.ToTable("ai_insight_requests");
            entity.Property(x => x.IdempotencyKey).HasMaxLength(120);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.Provider).HasMaxLength(24);
            entity.Property(x => x.Model).HasMaxLength(120);
            entity.Property(x => x.UsageType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.PromptHash).HasMaxLength(128);
            entity.Property(x => x.ReservedCredits).HasPrecision(18, 2);
            entity.Property(x => x.ChargedCredits).HasPrecision(18, 2);
            entity.Property(x => x.ResponseText).HasColumnType("text");
            entity.Property(x => x.ErrorCode).HasMaxLength(80);
            entity.Property(x => x.ErrorMessage).HasMaxLength(500);
            entity.HasIndex(x => new { x.UserId, x.IdempotencyKey }).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
            entity.HasIndex(x => new { x.UserId, x.UsageType, x.CreatedAtUtc });
            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiCreditPayment>(entity =>
        {
            entity.ToTable("ai_credit_payments");
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.Provider).HasMaxLength(32);
            entity.Property(x => x.ProviderPaymentId).HasMaxLength(160);
            entity.Property(x => x.ProviderCheckoutSessionId).HasMaxLength(160);
            entity.Property(x => x.ExternalReference).HasMaxLength(120);
            entity.Property(x => x.CreditsPurchased).HasPrecision(18, 2);
            entity.Property(x => x.Amount).HasPrecision(18, 2);
            entity.Property(x => x.Currency).HasMaxLength(8);
            entity.Property(x => x.PurchaseReference).HasMaxLength(120);
            entity.Property(x => x.LastWebhookEventId).HasMaxLength(160);
            entity.Property(x => x.LastWebhookEventType).HasMaxLength(80);
            entity.Property(x => x.FailureReason).HasMaxLength(300);
            entity.Property(x => x.MetadataJson).HasColumnType("text");
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.CreatedAtUtc);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.ExternalReference).IsUnique();
            entity.HasIndex(x => x.ProviderPaymentId).IsUnique();
            entity.HasOne(x => x.User)
                .WithMany()
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.AiCreditPayments)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiCreditPaymentWebhookEvent>(entity =>
        {
            entity.ToTable("ai_credit_payment_webhook_events");
            entity.Property(x => x.Provider).HasMaxLength(32);
            entity.Property(x => x.ProviderEventId).HasMaxLength(160);
            entity.Property(x => x.EventType).HasMaxLength(80);
            entity.Property(x => x.Status).HasMaxLength(24);
            entity.Property(x => x.ErrorCode).HasMaxLength(80);
            entity.Property(x => x.ErrorMessage).HasMaxLength(300);
            entity.HasIndex(x => x.ProviderEventId).IsUnique();
            entity.HasIndex(x => x.EventType);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.ReceivedAtUtc);
            entity.HasIndex(x => x.PaymentId);
            entity.HasOne(x => x.Payment)
                .WithMany(x => x.WebhookEvents)
                .HasForeignKey(x => x.PaymentId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AiCreditWalletMigrationEntry>(entity =>
        {
            entity.ToTable("ai_credit_wallet_migration_ledger");
            entity.Property(x => x.MigratedCredits).HasPrecision(18, 2);
            entity.Property(x => x.MigrationReference).HasMaxLength(160);
            entity.Property(x => x.MetadataJson).HasColumnType("text");
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.SourceUserId);
            entity.HasIndex(x => x.SourceWalletId).IsUnique();
            entity.HasIndex(x => x.TargetWalletId);
            entity.HasIndex(x => x.CreatedAtUtc);
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.AiCreditWalletMigrations)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.SourceUser)
                .WithMany()
                .HasForeignKey(x => x.SourceUserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiCreditOrder>(entity =>
        {
            entity.ToTable("ai_credit_orders");
            entity.Property(x => x.TargetUsername).HasMaxLength(64);
            entity.Property(x => x.PackageCode).HasMaxLength(80);
            entity.Property(x => x.RequestedCredits).HasPrecision(18, 2);
            entity.Property(x => x.SettledCredits).HasPrecision(18, 2);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Source).HasMaxLength(80);
            entity.Property(x => x.WalletLedgerReference).HasMaxLength(120);
            entity.Property(x => x.SettlementError).HasMaxLength(500);
            entity.Property(x => x.MetadataJson).HasColumnType("text");
            entity.HasIndex(x => x.ShopId);
            entity.HasIndex(x => x.InvoiceId);
            entity.HasIndex(x => x.PaymentId);
            entity.HasIndex(x => x.TargetUserId);
            entity.HasIndex(x => x.Status);
            entity.HasIndex(x => x.CreatedAtUtc);
            entity.HasOne(x => x.Shop)
                .WithMany(x => x.AiCreditOrders)
                .HasForeignKey(x => x.ShopId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Invoice)
                .WithMany()
                .HasForeignKey(x => x.InvoiceId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.Payment)
                .WithMany()
                .HasForeignKey(x => x.PaymentId)
                .OnDelete(DeleteBehavior.SetNull);
            entity.HasOne(x => x.TargetUser)
                .WithMany()
                .HasForeignKey(x => x.TargetUserId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<AiConversation>(entity =>
        {
            entity.ToTable("ai_conversations");
            entity.Property(x => x.Title).HasMaxLength(120);
            entity.Property(x => x.DefaultUsageType).HasConversion<string>().HasMaxLength(32);
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => new { x.UserId, x.UpdatedAtUtc });
            entity.HasOne(x => x.User)
                .WithMany(x => x.AiConversations)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiConversationMessage>(entity =>
        {
            entity.ToTable("ai_conversation_messages");
            entity.Property(x => x.Role).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.UsageType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Content).HasColumnType("text");
            entity.Property(x => x.IdempotencyKey).HasMaxLength(120);
            entity.Property(x => x.CitationsJson).HasColumnType("text");
            entity.Property(x => x.BlocksJson).HasColumnType("text");
            entity.Property(x => x.Confidence).HasMaxLength(24);
            entity.Property(x => x.ReservedCredits).HasPrecision(18, 2);
            entity.Property(x => x.ChargedCredits).HasPrecision(18, 2);
            entity.Property(x => x.RefundedCredits).HasPrecision(18, 2);
            entity.Property(x => x.ErrorCode).HasMaxLength(80);
            entity.Property(x => x.ErrorMessage).HasMaxLength(500);
            entity.HasIndex(x => x.ConversationId);
            entity.HasIndex(x => new { x.ConversationId, x.CreatedAtUtc });
            entity.HasIndex(x => new { x.ConversationId, x.IdempotencyKey });
            entity.HasOne(x => x.Conversation)
                .WithMany(x => x.Messages)
                .HasForeignKey(x => x.ConversationId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.User)
                .WithMany(x => x.AiConversationMessages)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<AiSmartReportJob>(entity =>
        {
            entity.ToTable("ai_smart_report_jobs");
            entity.Property(x => x.Cadence).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(24);
            entity.Property(x => x.Title).HasMaxLength(180);
            entity.Property(x => x.Summary).HasColumnType("text");
            entity.Property(x => x.PayloadJson).HasColumnType("text");
            entity.Property(x => x.ErrorMessage).HasMaxLength(500);
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => new { x.UserId, x.Cadence, x.PeriodStartUtc }).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.CreatedAtUtc });
            entity.HasOne(x => x.User)
                .WithMany(x => x.AiSmartReportJobs)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ReminderRule>(entity =>
        {
            entity.ToTable("reminder_rules");
            entity.Property(x => x.RuleType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.LowStockThreshold).HasPrecision(18, 3);
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => new { x.UserId, x.RuleType }).IsUnique();
            entity.HasIndex(x => new { x.UserId, x.IsEnabled });
            entity.HasOne(x => x.User)
                .WithMany(x => x.ReminderRules)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ReminderEvent>(entity =>
        {
            entity.ToTable("reminder_events");
            entity.Property(x => x.EventType).HasConversion<string>().HasMaxLength(32);
            entity.Property(x => x.Severity).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.Status).HasConversion<string>().HasMaxLength(16);
            entity.Property(x => x.Title).HasMaxLength(180);
            entity.Property(x => x.Message).HasMaxLength(600);
            entity.Property(x => x.ActionPath).HasMaxLength(220);
            entity.Property(x => x.Fingerprint).HasMaxLength(180);
            entity.Property(x => x.MetadataJson).HasColumnType("text");
            entity.HasIndex(x => x.UserId);
            entity.HasIndex(x => new { x.UserId, x.Status, x.CreatedAtUtc });
            entity.HasIndex(x => x.RuleId);
            entity.HasIndex(x => new { x.UserId, x.Fingerprint });
            entity.HasOne(x => x.User)
                .WithMany(x => x.ReminderEvents)
                .HasForeignKey(x => x.UserId)
                .OnDelete(DeleteBehavior.Cascade);
            entity.HasOne(x => x.Rule)
                .WithMany(x => x.Events)
                .HasForeignKey(x => x.RuleId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<CloudAccountLink>(entity =>
        {
            entity.ToTable("cloud_account_links");
            entity.Property(x => x.CloudUsername).HasMaxLength(200);
            entity.Property(x => x.CloudFullName).HasMaxLength(300);
            entity.Property(x => x.CloudRole).HasMaxLength(64);
            entity.Property(x => x.CloudShopCode).HasMaxLength(80);
            entity.Property(x => x.CloudAuthToken).HasMaxLength(4000);
            entity.HasIndex(x => x.LinkedAtUtc);
        });
    }
}
