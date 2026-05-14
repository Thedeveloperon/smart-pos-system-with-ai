using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddPackAndBundleSelling : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "ReplacementDate",
                table: "warranty_claims",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ReplacementSerialNumberId",
                table: "warranty_claims",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductId",
                table: "stock_movements",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "TEXT");

            migrationBuilder.AddColumn<Guid>(
                name: "BundleId",
                table: "stock_movements",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductId",
                table: "sale_items",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "TEXT");

            migrationBuilder.AddColumn<Guid>(
                name: "BundleId",
                table: "sale_items",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BundleNameSnapshot",
                table: "sale_items",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPack",
                table: "sale_items",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<int>(
                name: "SalePackSize",
                table: "sale_items",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductId",
                table: "refund_items",
                type: "TEXT",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "TEXT");

            migrationBuilder.AddColumn<Guid>(
                name: "BundleId",
                table: "refund_items",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BundleNameSnapshot",
                table: "refund_items",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "HasPackOption",
                table: "products",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "PackLabel",
                table: "products",
                type: "TEXT",
                maxLength: 40,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PackPrice",
                table: "products",
                type: "TEXT",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "PackSize",
                table: "products",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "IdNumber",
                table: "customers",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "bundles",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoreId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Barcode = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    Description = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    Price = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bundles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "bundle_inventory",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    BundleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    QuantityOnHand = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    ReorderLevel = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    AllowNegativeStock = table.Column<bool>(type: "INTEGER", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bundle_inventory", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bundle_inventory_bundles_BundleId",
                        column: x => x.BundleId,
                        principalTable: "bundles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "bundle_items",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    BundleId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ProductId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ItemName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Quantity = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_bundle_items", x => x.Id);
                    table.ForeignKey(
                        name: "FK_bundle_items_bundles_BundleId",
                        column: x => x.BundleId,
                        principalTable: "bundles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_bundle_items_products_ProductId",
                        column: x => x.ProductId,
                        principalTable: "products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_warranty_claims_ReplacementSerialNumberId",
                table: "warranty_claims",
                column: "ReplacementSerialNumberId");

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_BundleId",
                table: "stock_movements",
                column: "BundleId");

            migrationBuilder.CreateIndex(
                name: "IX_stock_movements_StoreId_BundleId_CreatedAtUtc",
                table: "stock_movements",
                columns: new[] { "StoreId", "BundleId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_sale_items_BundleId",
                table: "sale_items",
                column: "BundleId");

            migrationBuilder.CreateIndex(
                name: "IX_refund_items_BundleId",
                table: "refund_items",
                column: "BundleId");

            migrationBuilder.CreateIndex(
                name: "IX_bundle_inventory_BundleId",
                table: "bundle_inventory",
                column: "BundleId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bundle_items_BundleId",
                table: "bundle_items",
                column: "BundleId");

            migrationBuilder.CreateIndex(
                name: "IX_bundle_items_ProductId",
                table: "bundle_items",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_bundles_StoreId_Barcode",
                table: "bundles",
                columns: new[] { "StoreId", "Barcode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_bundles_StoreId_Name",
                table: "bundles",
                columns: new[] { "StoreId", "Name" });

            migrationBuilder.AddForeignKey(
                name: "FK_sale_items_bundles_BundleId",
                table: "sale_items",
                column: "BundleId",
                principalTable: "bundles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_stock_movements_bundles_BundleId",
                table: "stock_movements",
                column: "BundleId",
                principalTable: "bundles",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_warranty_claims_serial_numbers_ReplacementSerialNumberId",
                table: "warranty_claims",
                column: "ReplacementSerialNumberId",
                principalTable: "serial_numbers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_sale_items_bundles_BundleId",
                table: "sale_items");

            migrationBuilder.DropForeignKey(
                name: "FK_stock_movements_bundles_BundleId",
                table: "stock_movements");

            migrationBuilder.DropForeignKey(
                name: "FK_warranty_claims_serial_numbers_ReplacementSerialNumberId",
                table: "warranty_claims");

            migrationBuilder.DropTable(
                name: "bundle_inventory");

            migrationBuilder.DropTable(
                name: "bundle_items");

            migrationBuilder.DropTable(
                name: "bundles");

            migrationBuilder.DropIndex(
                name: "IX_warranty_claims_ReplacementSerialNumberId",
                table: "warranty_claims");

            migrationBuilder.DropIndex(
                name: "IX_stock_movements_BundleId",
                table: "stock_movements");

            migrationBuilder.DropIndex(
                name: "IX_stock_movements_StoreId_BundleId_CreatedAtUtc",
                table: "stock_movements");

            migrationBuilder.DropIndex(
                name: "IX_sale_items_BundleId",
                table: "sale_items");

            migrationBuilder.DropIndex(
                name: "IX_refund_items_BundleId",
                table: "refund_items");

            migrationBuilder.DropColumn(
                name: "ReplacementDate",
                table: "warranty_claims");

            migrationBuilder.DropColumn(
                name: "ReplacementSerialNumberId",
                table: "warranty_claims");

            migrationBuilder.DropColumn(
                name: "BundleId",
                table: "stock_movements");

            migrationBuilder.DropColumn(
                name: "BundleId",
                table: "sale_items");

            migrationBuilder.DropColumn(
                name: "BundleNameSnapshot",
                table: "sale_items");

            migrationBuilder.DropColumn(
                name: "IsPack",
                table: "sale_items");

            migrationBuilder.DropColumn(
                name: "SalePackSize",
                table: "sale_items");

            migrationBuilder.DropColumn(
                name: "BundleId",
                table: "refund_items");

            migrationBuilder.DropColumn(
                name: "BundleNameSnapshot",
                table: "refund_items");

            migrationBuilder.DropColumn(
                name: "HasPackOption",
                table: "products");

            migrationBuilder.DropColumn(
                name: "PackLabel",
                table: "products");

            migrationBuilder.DropColumn(
                name: "PackPrice",
                table: "products");

            migrationBuilder.DropColumn(
                name: "PackSize",
                table: "products");

            migrationBuilder.DropColumn(
                name: "IdNumber",
                table: "customers");

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductId",
                table: "stock_movements",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "TEXT",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductId",
                table: "sale_items",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "TEXT",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductId",
                table: "refund_items",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "TEXT",
                oldNullable: true);
        }
    }
}
