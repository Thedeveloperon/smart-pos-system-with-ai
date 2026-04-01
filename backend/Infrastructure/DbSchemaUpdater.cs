using Microsoft.EntityFrameworkCore;

namespace SmartPos.Backend.Infrastructure;

public static class DbSchemaUpdater
{
    public static async Task EnsureProductImageSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            if (await ColumnExistsAsync(dbContext, "products", "ImageUrl", cancellationToken))
            {
                return;
            }

            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE "products" ADD COLUMN "ImageUrl" TEXT NULL;""",
                cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            if (await ColumnExistsAsync(dbContext, "products", "ImageUrl", cancellationToken))
            {
                return;
            }

            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE products ADD COLUMN IF NOT EXISTS "ImageUrl" varchar(500);""",
                cancellationToken);
        }
    }

    public static async Task EnsureShopProfileSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            var sql = """
                CREATE TABLE IF NOT EXISTS "shop_profiles" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_shop_profiles" PRIMARY KEY,
                  "ShopName" TEXT NOT NULL,
                  "AddressLine1" TEXT NULL,
                  "AddressLine2" TEXT NULL,
                  "Phone" TEXT NULL,
                  "Email" TEXT NULL,
                  "Website" TEXT NULL,
                  "LogoUrl" TEXT NULL,
                  "ReceiptFooter" TEXT NULL,
                  "CreatedAtUtc" TEXT NOT NULL,
                  "UpdatedAtUtc" TEXT NULL
                );
                """;

            await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            var sql = """
                CREATE TABLE IF NOT EXISTS shop_profiles (
                  "Id" uuid NOT NULL PRIMARY KEY,
                  "ShopName" varchar(160) NOT NULL,
                  "AddressLine1" varchar(180) NULL,
                  "AddressLine2" varchar(180) NULL,
                  "Phone" varchar(32) NULL,
                  "Email" varchar(120) NULL,
                  "Website" varchar(120) NULL,
                  "LogoUrl" varchar(500) NULL,
                  "ReceiptFooter" varchar(500) NULL,
                  "CreatedAtUtc" timestamptz NOT NULL,
                  "UpdatedAtUtc" timestamptz NULL
                );
                """;

            await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
        }
    }

    public static async Task EnsureRefundSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            await EnsureSqliteRefundSchemaAsync(dbContext, cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            await EnsurePostgresRefundSchemaAsync(dbContext, cancellationToken);
        }
    }

    public static async Task EnsureCashSessionSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            var sql = """
                CREATE TABLE IF NOT EXISTS "cash_sessions" (
                  "Id" TEXT NOT NULL CONSTRAINT "PK_cash_sessions" PRIMARY KEY,
                  "StoreId" TEXT NULL,
                  "DeviceId" TEXT NULL,
                  "AppUserId" TEXT NULL,
                  "CashierName" TEXT NOT NULL,
                  "Status" TEXT NOT NULL,
                  "OpeningCountsJson" TEXT NOT NULL,
                  "OpeningTotal" TEXT NOT NULL,
                  "OpeningSubmittedAtUtc" TEXT NOT NULL,
                  "OpeningApprovedBy" TEXT NULL,
                  "OpeningApprovedAtUtc" TEXT NULL,
                  "ClosingCountsJson" TEXT NULL,
                  "ClosingTotal" TEXT NULL,
                  "ClosingSubmittedAtUtc" TEXT NULL,
                  "ClosingApprovedBy" TEXT NULL,
                  "ClosingApprovedAtUtc" TEXT NULL,
                  "CashSalesTotal" TEXT NOT NULL,
                  "ExpectedCash" TEXT NULL,
                  "Difference" TEXT NULL,
                  "DifferenceReason" TEXT NULL,
                  "OpenedAtUtc" TEXT NOT NULL,
                  "ClosedAtUtc" TEXT NULL,
                  "UpdatedAtUtc" TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS "IX_cash_sessions_DeviceId" ON "cash_sessions" ("DeviceId");
                CREATE INDEX IF NOT EXISTS "IX_cash_sessions_DeviceId_OpenedAtUtc" ON "cash_sessions" ("DeviceId", "OpenedAtUtc");
                CREATE INDEX IF NOT EXISTS "IX_cash_sessions_StoreId_Status" ON "cash_sessions" ("StoreId", "Status");
                CREATE INDEX IF NOT EXISTS "IX_cash_sessions_AppUserId" ON "cash_sessions" ("AppUserId");
                """;

            await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            var sql = """
                CREATE TABLE IF NOT EXISTS cash_sessions (
                  "Id" uuid NOT NULL PRIMARY KEY,
                  "StoreId" uuid NULL,
                  "DeviceId" uuid NULL,
                  "AppUserId" uuid NULL,
                  "CashierName" varchar(120) NOT NULL,
                  "Status" varchar(32) NOT NULL,
                  "OpeningCountsJson" text NOT NULL,
                  "OpeningTotal" numeric(18,2) NOT NULL,
                  "OpeningSubmittedAtUtc" timestamptz NOT NULL,
                  "OpeningApprovedBy" varchar(120) NULL,
                  "OpeningApprovedAtUtc" timestamptz NULL,
                  "ClosingCountsJson" text NULL,
                  "ClosingTotal" numeric(18,2) NULL,
                  "ClosingSubmittedAtUtc" timestamptz NULL,
                  "ClosingApprovedBy" varchar(120) NULL,
                  "ClosingApprovedAtUtc" timestamptz NULL,
                  "CashSalesTotal" numeric(18,2) NOT NULL,
                  "ExpectedCash" numeric(18,2) NULL,
                  "Difference" numeric(18,2) NULL,
                  "DifferenceReason" varchar(250) NULL,
                  "OpenedAtUtc" timestamptz NOT NULL,
                  "ClosedAtUtc" timestamptz NULL,
                  "UpdatedAtUtc" timestamptz NOT NULL
                );

                CREATE INDEX IF NOT EXISTS "IX_cash_sessions_DeviceId" ON cash_sessions ("DeviceId");
                CREATE INDEX IF NOT EXISTS "IX_cash_sessions_DeviceId_OpenedAtUtc" ON cash_sessions ("DeviceId", "OpenedAtUtc");
                CREATE INDEX IF NOT EXISTS "IX_cash_sessions_StoreId_Status" ON cash_sessions ("StoreId", "Status");
                CREATE INDEX IF NOT EXISTS "IX_cash_sessions_AppUserId" ON cash_sessions ("AppUserId");
                """;

            await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
        }
    }

    public static async Task EnsurePurchasingSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            await EnsureSqlitePurchasingSchemaAsync(dbContext, cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            await EnsurePostgresPurchasingSchemaAsync(dbContext, cancellationToken);
        }
    }

    public static async Task EnsureLicensingSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            await EnsureSqliteLicensingSchemaAsync(dbContext, cancellationToken);
            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            await EnsurePostgresLicensingSchemaAsync(dbContext, cancellationToken);
        }
    }

    public static async Task EnsureAuthSecuritySchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken = default)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;

        if (provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase))
        {
            if (!await ColumnExistsAsync(dbContext, "users", "IsMfaEnabled", cancellationToken))
            {
                await dbContext.Database.ExecuteSqlRawAsync(
                    """ALTER TABLE "users" ADD COLUMN "IsMfaEnabled" INTEGER NOT NULL DEFAULT 0;""",
                    cancellationToken);
            }

            if (!await ColumnExistsAsync(dbContext, "users", "MfaSecret", cancellationToken))
            {
                await dbContext.Database.ExecuteSqlRawAsync(
                    """ALTER TABLE "users" ADD COLUMN "MfaSecret" TEXT NULL;""",
                    cancellationToken);
            }

            if (!await ColumnExistsAsync(dbContext, "users", "MfaConfiguredAtUtc", cancellationToken))
            {
                await dbContext.Database.ExecuteSqlRawAsync(
                    """ALTER TABLE "users" ADD COLUMN "MfaConfiguredAtUtc" TEXT NULL;""",
                    cancellationToken);
            }

            return;
        }

        if (provider.Contains("Npgsql", StringComparison.OrdinalIgnoreCase))
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE users ADD COLUMN IF NOT EXISTS "IsMfaEnabled" boolean NOT NULL DEFAULT false;""",
                cancellationToken);
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE users ADD COLUMN IF NOT EXISTS "MfaSecret" varchar(256) NULL;""",
                cancellationToken);
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE users ADD COLUMN IF NOT EXISTS "MfaConfiguredAtUtc" timestamptz NULL;""",
                cancellationToken);
        }
    }

    private static async Task EnsureSqliteRefundSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS "refunds" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_refunds" PRIMARY KEY,
              "StoreId" TEXT NULL,
              "SaleId" TEXT NOT NULL,
              "RefundNumber" TEXT NOT NULL,
              "Reason" TEXT NOT NULL,
              "SubtotalAmount" TEXT NOT NULL,
              "DiscountAmount" TEXT NOT NULL,
              "TaxAmount" TEXT NOT NULL,
              "GrandTotal" TEXT NOT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              CONSTRAINT "FK_refunds_sales_SaleId" FOREIGN KEY ("SaleId") REFERENCES "sales" ("Id") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS "refund_items" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_refund_items" PRIMARY KEY,
              "RefundId" TEXT NOT NULL,
              "SaleItemId" TEXT NOT NULL,
              "ProductId" TEXT NOT NULL,
              "ProductNameSnapshot" TEXT NOT NULL,
              "Quantity" TEXT NOT NULL,
              "SubtotalAmount" TEXT NOT NULL,
              "DiscountAmount" TEXT NOT NULL,
              "TaxAmount" TEXT NOT NULL,
              "TotalAmount" TEXT NOT NULL,
              CONSTRAINT "FK_refund_items_refunds_RefundId" FOREIGN KEY ("RefundId") REFERENCES "refunds" ("Id") ON DELETE CASCADE,
              CONSTRAINT "FK_refund_items_sale_items_SaleItemId" FOREIGN KEY ("SaleItemId") REFERENCES "sale_items" ("Id") ON DELETE RESTRICT
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_refunds_RefundNumber" ON "refunds" ("RefundNumber");
            CREATE INDEX IF NOT EXISTS "IX_refunds_SaleId" ON "refunds" ("SaleId");
            CREATE INDEX IF NOT EXISTS "IX_refund_items_RefundId" ON "refund_items" ("RefundId");
            CREATE INDEX IF NOT EXISTS "IX_refund_items_SaleItemId" ON "refund_items" ("SaleItemId");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }

    private static async Task<bool> ColumnExistsAsync(
        SmartPosDbContext dbContext,
        string tableName,
        string columnName,
        CancellationToken cancellationToken)
    {
        var provider = dbContext.Database.ProviderName ?? string.Empty;
        var connection = dbContext.Database.GetDbConnection();

        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        var sql = provider.Contains("Sqlite", StringComparison.OrdinalIgnoreCase)
            ? $"""SELECT 1 FROM pragma_table_info('{tableName}') WHERE name = '{columnName}' LIMIT 1;"""
            : $"""SELECT 1 FROM information_schema.columns WHERE table_name = '{tableName}' AND column_name = '{columnName}' LIMIT 1;""";

        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        var result = await command.ExecuteScalarAsync(cancellationToken);
        return result is not null && result is not DBNull;
    }

    private static async Task EnsurePostgresRefundSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS refunds (
              "Id" uuid NOT NULL PRIMARY KEY,
              "StoreId" uuid NULL,
              "SaleId" uuid NOT NULL REFERENCES sales("Id") ON DELETE CASCADE,
              "RefundNumber" varchar(32) NOT NULL,
              "Reason" varchar(250) NOT NULL,
              "SubtotalAmount" numeric(18,2) NOT NULL,
              "DiscountAmount" numeric(18,2) NOT NULL,
              "TaxAmount" numeric(18,2) NOT NULL,
              "GrandTotal" numeric(18,2) NOT NULL,
              "CreatedAtUtc" timestamptz NOT NULL
            );

            CREATE TABLE IF NOT EXISTS refund_items (
              "Id" uuid NOT NULL PRIMARY KEY,
              "RefundId" uuid NOT NULL REFERENCES refunds("Id") ON DELETE CASCADE,
              "SaleItemId" uuid NOT NULL REFERENCES sale_items("Id") ON DELETE RESTRICT,
              "ProductId" uuid NOT NULL,
              "ProductNameSnapshot" varchar(200) NOT NULL,
              "Quantity" numeric(18,3) NOT NULL,
              "SubtotalAmount" numeric(18,2) NOT NULL,
              "DiscountAmount" numeric(18,2) NOT NULL,
              "TaxAmount" numeric(18,2) NOT NULL,
              "TotalAmount" numeric(18,2) NOT NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_refunds_RefundNumber" ON refunds("RefundNumber");
            CREATE INDEX IF NOT EXISTS "IX_refunds_SaleId" ON refunds("SaleId");
            CREATE INDEX IF NOT EXISTS "IX_refund_items_RefundId" ON refund_items("RefundId");
            CREATE INDEX IF NOT EXISTS "IX_refund_items_SaleItemId" ON refund_items("SaleItemId");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
    }

    private static async Task EnsureSqlitePurchasingSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS "suppliers" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_suppliers" PRIMARY KEY,
              "StoreId" TEXT NULL,
              "Name" TEXT NOT NULL,
              "Code" TEXT NULL,
              "ContactName" TEXT NULL,
              "Phone" TEXT NULL,
              "Email" TEXT NULL,
              "Address" TEXT NULL,
              "IsActive" INTEGER NOT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              "UpdatedAtUtc" TEXT NULL
            );

            CREATE TABLE IF NOT EXISTS "purchase_bills" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_purchase_bills" PRIMARY KEY,
              "StoreId" TEXT NULL,
              "ImportRequestId" TEXT NULL,
              "SupplierId" TEXT NOT NULL,
              "InvoiceNumber" TEXT NOT NULL,
              "InvoiceDateUtc" TEXT NOT NULL,
              "Currency" TEXT NOT NULL,
              "Subtotal" TEXT NOT NULL,
              "DiscountTotal" TEXT NOT NULL,
              "TaxTotal" TEXT NOT NULL,
              "GrandTotal" TEXT NOT NULL,
              "SourceType" TEXT NOT NULL,
              "OcrConfidence" TEXT NULL,
              "CreatedByUserId" TEXT NULL,
              "Notes" TEXT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              "UpdatedAtUtc" TEXT NULL,
              CONSTRAINT "FK_purchase_bills_suppliers_SupplierId" FOREIGN KEY ("SupplierId") REFERENCES "suppliers" ("Id") ON DELETE RESTRICT,
              CONSTRAINT "FK_purchase_bills_users_CreatedByUserId" FOREIGN KEY ("CreatedByUserId") REFERENCES "users" ("Id") ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS "purchase_bill_items" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_purchase_bill_items" PRIMARY KEY,
              "PurchaseBillId" TEXT NOT NULL,
              "ProductId" TEXT NOT NULL,
              "ProductNameSnapshot" TEXT NOT NULL,
              "SupplierItemName" TEXT NULL,
              "Quantity" TEXT NOT NULL,
              "UnitCost" TEXT NOT NULL,
              "TaxAmount" TEXT NOT NULL,
              "LineTotal" TEXT NOT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              CONSTRAINT "FK_purchase_bill_items_purchase_bills_PurchaseBillId" FOREIGN KEY ("PurchaseBillId") REFERENCES "purchase_bills" ("Id") ON DELETE CASCADE,
              CONSTRAINT "FK_purchase_bill_items_products_ProductId" FOREIGN KEY ("ProductId") REFERENCES "products" ("Id") ON DELETE RESTRICT
            );

            CREATE TABLE IF NOT EXISTS "bill_documents" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_bill_documents" PRIMARY KEY,
              "StoreId" TEXT NULL,
              "PurchaseBillId" TEXT NULL,
              "FileName" TEXT NOT NULL,
              "ContentType" TEXT NOT NULL,
              "StoragePath" TEXT NULL,
              "FileHash" TEXT NULL,
              "OcrStatus" TEXT NOT NULL,
              "OcrConfidence" TEXT NULL,
              "ExtractedPayloadJson" TEXT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              "ProcessedAtUtc" TEXT NULL,
              CONSTRAINT "FK_bill_documents_purchase_bills_PurchaseBillId" FOREIGN KEY ("PurchaseBillId") REFERENCES "purchase_bills" ("Id") ON DELETE SET NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_suppliers_StoreId_Name" ON "suppliers" ("StoreId", "Name");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_suppliers_StoreId_Code" ON "suppliers" ("StoreId", "Code");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_SupplierId_InvoiceNumber" ON "purchase_bills" ("StoreId", "SupplierId", "InvoiceNumber");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_ImportRequestId" ON "purchase_bills" ("StoreId", "ImportRequestId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_ImportRequestId" ON "purchase_bills" ("ImportRequestId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bills_SupplierId" ON "purchase_bills" ("SupplierId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bills_CreatedByUserId" ON "purchase_bills" ("CreatedByUserId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bill_items_PurchaseBillId" ON "purchase_bill_items" ("PurchaseBillId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bill_items_ProductId" ON "purchase_bill_items" ("ProductId");
            CREATE INDEX IF NOT EXISTS "IX_bill_documents_PurchaseBillId" ON "bill_documents" ("PurchaseBillId");
            CREATE INDEX IF NOT EXISTS "IX_bill_documents_FileHash" ON "bill_documents" ("FileHash");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);

        if (!await ColumnExistsAsync(dbContext, "purchase_bills", "ImportRequestId", cancellationToken))
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE "purchase_bills" ADD COLUMN "ImportRequestId" TEXT NULL;""",
                cancellationToken);
        }

        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_ImportRequestId" ON "purchase_bills" ("StoreId", "ImportRequestId");""",
            cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_ImportRequestId" ON "purchase_bills" ("ImportRequestId");""",
            cancellationToken);
    }

    private static async Task EnsureSqliteLicensingSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS "shops" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_shops" PRIMARY KEY,
              "Code" TEXT NOT NULL,
              "Name" TEXT NOT NULL,
              "IsActive" INTEGER NOT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              "UpdatedAtUtc" TEXT NULL
            );

            CREATE TABLE IF NOT EXISTS "subscriptions" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_subscriptions" PRIMARY KEY,
              "ShopId" TEXT NOT NULL,
              "Plan" TEXT NOT NULL,
              "Status" TEXT NOT NULL,
              "PeriodStartUtc" TEXT NOT NULL,
              "PeriodEndUtc" TEXT NOT NULL,
              "SeatLimit" INTEGER NOT NULL,
              "FeatureFlagsJson" TEXT NULL,
              "BillingCustomerId" TEXT NULL,
              "BillingSubscriptionId" TEXT NULL,
              "BillingPriceId" TEXT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              "UpdatedAtUtc" TEXT NULL,
              CONSTRAINT "FK_subscriptions_shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "shops" ("Id") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS "provisioned_devices" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_provisioned_devices" PRIMARY KEY,
              "ShopId" TEXT NOT NULL,
              "DeviceId" TEXT NULL,
              "DeviceCode" TEXT NOT NULL,
              "Name" TEXT NOT NULL,
              "Status" TEXT NOT NULL,
              "AssignedAtUtc" TEXT NOT NULL,
              "RevokedAtUtc" TEXT NULL,
              "LastHeartbeatAtUtc" TEXT NULL,
              CONSTRAINT "FK_provisioned_devices_shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "shops" ("Id") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS "licenses" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_licenses" PRIMARY KEY,
              "ShopId" TEXT NOT NULL,
              "ProvisionedDeviceId" TEXT NOT NULL,
              "Token" TEXT NOT NULL,
              "ValidUntil" TEXT NOT NULL,
              "GraceUntil" TEXT NOT NULL,
              "SignatureKeyId" TEXT NOT NULL,
              "SignatureAlgorithm" TEXT NOT NULL,
              "Signature" TEXT NOT NULL,
              "Status" TEXT NOT NULL,
              "IssuedAtUtc" TEXT NOT NULL,
              "RevokedAtUtc" TEXT NULL,
              "LastValidatedAtUtc" TEXT NULL,
              CONSTRAINT "FK_licenses_shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "shops" ("Id") ON DELETE CASCADE,
              CONSTRAINT "FK_licenses_provisioned_devices_ProvisionedDeviceId" FOREIGN KEY ("ProvisionedDeviceId") REFERENCES "provisioned_devices" ("Id") ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS "license_audit_logs" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_license_audit_logs" PRIMARY KEY,
              "ShopId" TEXT NULL,
              "ProvisionedDeviceId" TEXT NULL,
              "Action" TEXT NOT NULL,
              "Actor" TEXT NOT NULL,
              "Reason" TEXT NULL,
              "MetadataJson" TEXT NULL,
              "CreatedAtUtc" TEXT NOT NULL,
              CONSTRAINT "FK_license_audit_logs_shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "shops" ("Id") ON DELETE SET NULL,
              CONSTRAINT "FK_license_audit_logs_provisioned_devices_ProvisionedDeviceId" FOREIGN KEY ("ProvisionedDeviceId") REFERENCES "provisioned_devices" ("Id") ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS "billing_webhook_events" (
              "Id" TEXT NOT NULL CONSTRAINT "PK_billing_webhook_events" PRIMARY KEY,
              "ProviderEventId" TEXT NOT NULL,
              "EventType" TEXT NOT NULL,
              "Status" TEXT NOT NULL,
              "ShopId" TEXT NULL,
              "BillingSubscriptionId" TEXT NULL,
              "LastErrorCode" TEXT NULL,
              "ReceivedAtUtc" TEXT NOT NULL,
              "ProcessedAtUtc" TEXT NULL,
              "UpdatedAtUtc" TEXT NULL,
              CONSTRAINT "FK_billing_webhook_events_shops_ShopId" FOREIGN KEY ("ShopId") REFERENCES "shops" ("Id") ON DELETE SET NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_shops_Code" ON "shops" ("Code");
            CREATE INDEX IF NOT EXISTS "IX_subscriptions_ShopId" ON "subscriptions" ("ShopId");
            CREATE INDEX IF NOT EXISTS "IX_subscriptions_Status" ON "subscriptions" ("Status");
            CREATE INDEX IF NOT EXISTS "IX_subscriptions_PeriodEndUtc" ON "subscriptions" ("PeriodEndUtc");
            CREATE INDEX IF NOT EXISTS "IX_provisioned_devices_ShopId" ON "provisioned_devices" ("ShopId");
            CREATE INDEX IF NOT EXISTS "IX_provisioned_devices_DeviceId" ON "provisioned_devices" ("DeviceId");
            CREATE INDEX IF NOT EXISTS "IX_provisioned_devices_Status" ON "provisioned_devices" ("Status");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_provisioned_devices_DeviceCode" ON "provisioned_devices" ("DeviceCode");
            CREATE INDEX IF NOT EXISTS "IX_licenses_ShopId" ON "licenses" ("ShopId");
            CREATE INDEX IF NOT EXISTS "IX_licenses_ProvisionedDeviceId" ON "licenses" ("ProvisionedDeviceId");
            CREATE INDEX IF NOT EXISTS "IX_licenses_Status" ON "licenses" ("Status");
            CREATE INDEX IF NOT EXISTS "IX_licenses_ValidUntil" ON "licenses" ("ValidUntil");
            CREATE INDEX IF NOT EXISTS "IX_license_audit_logs_ShopId" ON "license_audit_logs" ("ShopId");
            CREATE INDEX IF NOT EXISTS "IX_license_audit_logs_ProvisionedDeviceId" ON "license_audit_logs" ("ProvisionedDeviceId");
            CREATE INDEX IF NOT EXISTS "IX_license_audit_logs_Action" ON "license_audit_logs" ("Action");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_billing_webhook_events_ProviderEventId" ON "billing_webhook_events" ("ProviderEventId");
            CREATE INDEX IF NOT EXISTS "IX_billing_webhook_events_EventType" ON "billing_webhook_events" ("EventType");
            CREATE INDEX IF NOT EXISTS "IX_billing_webhook_events_ShopId" ON "billing_webhook_events" ("ShopId");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);

        if (!await ColumnExistsAsync(dbContext, "license_audit_logs", "IsManualOverride", cancellationToken))
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE "license_audit_logs" ADD COLUMN "IsManualOverride" INTEGER NOT NULL DEFAULT 0;""",
                cancellationToken);
        }

        if (!await ColumnExistsAsync(dbContext, "license_audit_logs", "ImmutableHash", cancellationToken))
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE "license_audit_logs" ADD COLUMN "ImmutableHash" TEXT NULL;""",
                cancellationToken);
        }

        if (!await ColumnExistsAsync(dbContext, "license_audit_logs", "ImmutablePreviousHash", cancellationToken))
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE "license_audit_logs" ADD COLUMN "ImmutablePreviousHash" TEXT NULL;""",
                cancellationToken);
        }

        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE INDEX IF NOT EXISTS "IX_license_audit_logs_IsManualOverride" ON "license_audit_logs" ("IsManualOverride");""",
            cancellationToken);
    }

    private static async Task EnsurePostgresPurchasingSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS suppliers (
              "Id" uuid NOT NULL PRIMARY KEY,
              "StoreId" uuid NULL,
              "Name" varchar(160) NOT NULL,
              "Code" varchar(64) NULL,
              "ContactName" varchar(120) NULL,
              "Phone" varchar(32) NULL,
              "Email" varchar(120) NULL,
              "Address" varchar(500) NULL,
              "IsActive" boolean NOT NULL,
              "CreatedAtUtc" timestamptz NOT NULL,
              "UpdatedAtUtc" timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS purchase_bills (
              "Id" uuid NOT NULL PRIMARY KEY,
              "StoreId" uuid NULL,
              "ImportRequestId" varchar(80) NULL,
              "SupplierId" uuid NOT NULL REFERENCES suppliers("Id") ON DELETE RESTRICT,
              "InvoiceNumber" varchar(80) NOT NULL,
              "InvoiceDateUtc" timestamptz NOT NULL,
              "Currency" varchar(8) NOT NULL,
              "Subtotal" numeric(18,2) NOT NULL,
              "DiscountTotal" numeric(18,2) NOT NULL,
              "TaxTotal" numeric(18,2) NOT NULL,
              "GrandTotal" numeric(18,2) NOT NULL,
              "SourceType" varchar(32) NOT NULL,
              "OcrConfidence" numeric(6,4) NULL,
              "CreatedByUserId" uuid NULL REFERENCES users("Id") ON DELETE SET NULL,
              "Notes" varchar(500) NULL,
              "CreatedAtUtc" timestamptz NOT NULL,
              "UpdatedAtUtc" timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS purchase_bill_items (
              "Id" uuid NOT NULL PRIMARY KEY,
              "PurchaseBillId" uuid NOT NULL REFERENCES purchase_bills("Id") ON DELETE CASCADE,
              "ProductId" uuid NOT NULL REFERENCES products("Id") ON DELETE RESTRICT,
              "ProductNameSnapshot" varchar(200) NOT NULL,
              "SupplierItemName" varchar(200) NULL,
              "Quantity" numeric(18,3) NOT NULL,
              "UnitCost" numeric(18,2) NOT NULL,
              "TaxAmount" numeric(18,2) NOT NULL,
              "LineTotal" numeric(18,2) NOT NULL,
              "CreatedAtUtc" timestamptz NOT NULL
            );

            CREATE TABLE IF NOT EXISTS bill_documents (
              "Id" uuid NOT NULL PRIMARY KEY,
              "StoreId" uuid NULL,
              "PurchaseBillId" uuid NULL REFERENCES purchase_bills("Id") ON DELETE SET NULL,
              "FileName" varchar(260) NOT NULL,
              "ContentType" varchar(120) NOT NULL,
              "StoragePath" varchar(500) NULL,
              "FileHash" varchar(128) NULL,
              "OcrStatus" varchar(32) NOT NULL,
              "OcrConfidence" numeric(6,4) NULL,
              "ExtractedPayloadJson" text NULL,
              "CreatedAtUtc" timestamptz NOT NULL,
              "ProcessedAtUtc" timestamptz NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_suppliers_StoreId_Name" ON suppliers("StoreId", "Name");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_suppliers_StoreId_Code" ON suppliers("StoreId", "Code");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_SupplierId_InvoiceNumber" ON purchase_bills("StoreId", "SupplierId", "InvoiceNumber");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_ImportRequestId" ON purchase_bills("StoreId", "ImportRequestId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_ImportRequestId" ON purchase_bills("ImportRequestId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bills_SupplierId" ON purchase_bills("SupplierId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bills_CreatedByUserId" ON purchase_bills("CreatedByUserId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bill_items_PurchaseBillId" ON purchase_bill_items("PurchaseBillId");
            CREATE INDEX IF NOT EXISTS "IX_purchase_bill_items_ProductId" ON purchase_bill_items("ProductId");
            CREATE INDEX IF NOT EXISTS "IX_bill_documents_PurchaseBillId" ON bill_documents("PurchaseBillId");
            CREATE INDEX IF NOT EXISTS "IX_bill_documents_FileHash" ON bill_documents("FileHash");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);

        if (!await ColumnExistsAsync(dbContext, "purchase_bills", "ImportRequestId", cancellationToken))
        {
            await dbContext.Database.ExecuteSqlRawAsync(
                """ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS "ImportRequestId" varchar(80);""",
                cancellationToken);
        }

        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_StoreId_ImportRequestId" ON purchase_bills("StoreId", "ImportRequestId");""",
            cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE UNIQUE INDEX IF NOT EXISTS "IX_purchase_bills_ImportRequestId" ON purchase_bills("ImportRequestId");""",
            cancellationToken);
    }

    private static async Task EnsurePostgresLicensingSchemaAsync(
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var sql = """
            CREATE TABLE IF NOT EXISTS shops (
              "Id" uuid NOT NULL PRIMARY KEY,
              "Code" varchar(64) NOT NULL,
              "Name" varchar(160) NOT NULL,
              "IsActive" boolean NOT NULL,
              "CreatedAtUtc" timestamptz NOT NULL,
              "UpdatedAtUtc" timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
              "Id" uuid NOT NULL PRIMARY KEY,
              "ShopId" uuid NOT NULL REFERENCES shops("Id") ON DELETE CASCADE,
              "Plan" varchar(64) NOT NULL,
              "Status" varchar(32) NOT NULL,
              "PeriodStartUtc" timestamptz NOT NULL,
              "PeriodEndUtc" timestamptz NOT NULL,
              "SeatLimit" integer NOT NULL,
              "FeatureFlagsJson" text NULL,
              "BillingCustomerId" varchar(120) NULL,
              "BillingSubscriptionId" varchar(120) NULL,
              "BillingPriceId" varchar(120) NULL,
              "CreatedAtUtc" timestamptz NOT NULL,
              "UpdatedAtUtc" timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS provisioned_devices (
              "Id" uuid NOT NULL PRIMARY KEY,
              "ShopId" uuid NOT NULL REFERENCES shops("Id") ON DELETE CASCADE,
              "DeviceId" uuid NULL,
              "DeviceCode" varchar(64) NOT NULL,
              "Name" varchar(120) NOT NULL,
              "Status" varchar(32) NOT NULL,
              "AssignedAtUtc" timestamptz NOT NULL,
              "RevokedAtUtc" timestamptz NULL,
              "LastHeartbeatAtUtc" timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS licenses (
              "Id" uuid NOT NULL PRIMARY KEY,
              "ShopId" uuid NOT NULL REFERENCES shops("Id") ON DELETE CASCADE,
              "ProvisionedDeviceId" uuid NOT NULL REFERENCES provisioned_devices("Id") ON DELETE CASCADE,
              "Token" text NOT NULL,
              "ValidUntil" timestamptz NOT NULL,
              "GraceUntil" timestamptz NOT NULL,
              "SignatureKeyId" varchar(64) NOT NULL,
              "SignatureAlgorithm" varchar(32) NOT NULL,
              "Signature" text NOT NULL,
              "Status" varchar(32) NOT NULL,
              "IssuedAtUtc" timestamptz NOT NULL,
              "RevokedAtUtc" timestamptz NULL,
              "LastValidatedAtUtc" timestamptz NULL
            );

            CREATE TABLE IF NOT EXISTS license_audit_logs (
              "Id" uuid NOT NULL PRIMARY KEY,
              "ShopId" uuid NULL REFERENCES shops("Id") ON DELETE SET NULL,
              "ProvisionedDeviceId" uuid NULL REFERENCES provisioned_devices("Id") ON DELETE SET NULL,
              "Action" varchar(120) NOT NULL,
              "Actor" varchar(120) NOT NULL,
              "Reason" varchar(500) NULL,
              "MetadataJson" text NULL,
              "CreatedAtUtc" timestamptz NOT NULL
            );

            CREATE TABLE IF NOT EXISTS billing_webhook_events (
              "Id" uuid NOT NULL PRIMARY KEY,
              "ProviderEventId" varchar(160) NOT NULL,
              "EventType" varchar(120) NOT NULL,
              "Status" varchar(32) NOT NULL,
              "ShopId" uuid NULL REFERENCES shops("Id") ON DELETE SET NULL,
              "BillingSubscriptionId" varchar(120) NULL,
              "LastErrorCode" varchar(120) NULL,
              "ReceivedAtUtc" timestamptz NOT NULL,
              "ProcessedAtUtc" timestamptz NULL,
              "UpdatedAtUtc" timestamptz NULL
            );

            CREATE UNIQUE INDEX IF NOT EXISTS "IX_shops_Code" ON shops("Code");
            CREATE INDEX IF NOT EXISTS "IX_subscriptions_ShopId" ON subscriptions("ShopId");
            CREATE INDEX IF NOT EXISTS "IX_subscriptions_Status" ON subscriptions("Status");
            CREATE INDEX IF NOT EXISTS "IX_subscriptions_PeriodEndUtc" ON subscriptions("PeriodEndUtc");
            CREATE INDEX IF NOT EXISTS "IX_provisioned_devices_ShopId" ON provisioned_devices("ShopId");
            CREATE INDEX IF NOT EXISTS "IX_provisioned_devices_DeviceId" ON provisioned_devices("DeviceId");
            CREATE INDEX IF NOT EXISTS "IX_provisioned_devices_Status" ON provisioned_devices("Status");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_provisioned_devices_DeviceCode" ON provisioned_devices("DeviceCode");
            CREATE INDEX IF NOT EXISTS "IX_licenses_ShopId" ON licenses("ShopId");
            CREATE INDEX IF NOT EXISTS "IX_licenses_ProvisionedDeviceId" ON licenses("ProvisionedDeviceId");
            CREATE INDEX IF NOT EXISTS "IX_licenses_Status" ON licenses("Status");
            CREATE INDEX IF NOT EXISTS "IX_licenses_ValidUntil" ON licenses("ValidUntil");
            CREATE INDEX IF NOT EXISTS "IX_license_audit_logs_ShopId" ON license_audit_logs("ShopId");
            CREATE INDEX IF NOT EXISTS "IX_license_audit_logs_ProvisionedDeviceId" ON license_audit_logs("ProvisionedDeviceId");
            CREATE INDEX IF NOT EXISTS "IX_license_audit_logs_Action" ON license_audit_logs("Action");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_billing_webhook_events_ProviderEventId" ON billing_webhook_events("ProviderEventId");
            CREATE INDEX IF NOT EXISTS "IX_billing_webhook_events_EventType" ON billing_webhook_events("EventType");
            CREATE INDEX IF NOT EXISTS "IX_billing_webhook_events_ShopId" ON billing_webhook_events("ShopId");
            """;

        await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            """ALTER TABLE license_audit_logs ADD COLUMN IF NOT EXISTS "IsManualOverride" boolean NOT NULL DEFAULT false;""",
            cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            """ALTER TABLE license_audit_logs ADD COLUMN IF NOT EXISTS "ImmutableHash" varchar(128) NULL;""",
            cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            """ALTER TABLE license_audit_logs ADD COLUMN IF NOT EXISTS "ImmutablePreviousHash" varchar(128) NULL;""",
            cancellationToken);
        await dbContext.Database.ExecuteSqlRawAsync(
            """CREATE INDEX IF NOT EXISTS "IX_license_audit_logs_IsManualOverride" ON license_audit_logs("IsManualOverride");""",
            cancellationToken);
    }
}
