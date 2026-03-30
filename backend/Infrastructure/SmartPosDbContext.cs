using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;

namespace SmartPos.Backend.Infrastructure;

public sealed class SmartPosDbContext(DbContextOptions<SmartPosDbContext> options) : DbContext(options)
{
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<InventoryRecord> Inventory => Set<InventoryRecord>();
    public DbSet<Supplier> Suppliers => Set<Supplier>();
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
    public DbSet<Device> Devices => Set<Device>();
    public DbSet<OfflineEvent> OfflineEvents => Set<OfflineEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Category>(entity =>
        {
            entity.ToTable("categories");
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.HasIndex(x => new { x.StoreId, x.Name }).IsUnique();
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
        });

        modelBuilder.Entity<InventoryRecord>(entity =>
        {
            entity.ToTable("inventory");
            entity.Property(x => x.QuantityOnHand).HasPrecision(18, 3);
            entity.Property(x => x.ReorderLevel).HasPrecision(18, 3);
            entity.HasIndex(x => x.ProductId).IsUnique();
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

        modelBuilder.Entity<Device>(entity =>
        {
            entity.ToTable("devices");
            entity.Property(x => x.DeviceCode).HasMaxLength(64);
            entity.Property(x => x.Name).HasMaxLength(120);
            entity.HasIndex(x => x.DeviceCode).IsUnique();
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
        });
    }
}
