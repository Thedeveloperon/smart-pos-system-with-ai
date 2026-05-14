using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddCustomerProfileSystem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "CustomerId",
                table: "sales",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LoyaltyPointsEarned",
                table: "sales",
                type: "TEXT",
                precision: 18,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "LoyaltyPointsRedeemed",
                table: "sales",
                type: "TEXT",
                precision: 18,
                scale: 3,
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "customer_price_tiers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoreId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Code = table.Column<string>(type: "TEXT", maxLength: 64, nullable: false),
                    DiscountPercent = table.Column<decimal>(type: "TEXT", precision: 6, scale: 4, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_price_tiers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "customers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoreId = table.Column<Guid>(type: "TEXT", nullable: true),
                    PriceTierId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Code = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    Phone = table.Column<string>(type: "TEXT", maxLength: 32, nullable: true),
                    Email = table.Column<string>(type: "TEXT", maxLength: 120, nullable: true),
                    Address = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    DateOfBirth = table.Column<DateOnly>(type: "TEXT", nullable: true),
                    FixedDiscountPercent = table.Column<decimal>(type: "TEXT", precision: 6, scale: 4, nullable: true),
                    CreditLimit = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    OutstandingBalance = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    LoyaltyPoints = table.Column<decimal>(type: "TEXT", precision: 18, scale: 3, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customers_customer_price_tiers_PriceTierId",
                        column: x => x.PriceTierId,
                        principalTable: "customer_price_tiers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "customer_credit_ledger",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoreId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SaleId = table.Column<Guid>(type: "TEXT", nullable: true),
                    EntryType = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    Amount = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    BalanceAfter = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Reference = table.Column<string>(type: "TEXT", maxLength: 160, nullable: true),
                    RecordedByUserId = table.Column<Guid>(type: "TEXT", nullable: true),
                    OccurredAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_credit_ledger", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customer_credit_ledger_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_customer_credit_ledger_sales_SaleId",
                        column: x => x.SaleId,
                        principalTable: "sales",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_customer_credit_ledger_users_RecordedByUserId",
                        column: x => x.RecordedByUserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "customer_tags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoreId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CustomerId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Tag = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_customer_tags", x => x.Id);
                    table.ForeignKey(
                        name: "FK_customer_tags_customers_CustomerId",
                        column: x => x.CustomerId,
                        principalTable: "customers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_sales_CustomerId",
                table: "sales",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_sales_StoreId_CustomerId",
                table: "sales",
                columns: new[] { "StoreId", "CustomerId" });

            migrationBuilder.CreateIndex(
                name: "IX_customer_credit_ledger_CustomerId",
                table: "customer_credit_ledger",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_credit_ledger_RecordedByUserId",
                table: "customer_credit_ledger",
                column: "RecordedByUserId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_credit_ledger_SaleId",
                table: "customer_credit_ledger",
                column: "SaleId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_credit_ledger_StoreId_CustomerId_OccurredAtUtc",
                table: "customer_credit_ledger",
                columns: new[] { "StoreId", "CustomerId", "OccurredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_customer_price_tiers_StoreId_Code",
                table: "customer_price_tiers",
                columns: new[] { "StoreId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customer_price_tiers_StoreId_Name",
                table: "customer_price_tiers",
                columns: new[] { "StoreId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customer_tags_CustomerId",
                table: "customer_tags",
                column: "CustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_customer_tags_StoreId_CustomerId_Tag",
                table: "customer_tags",
                columns: new[] { "StoreId", "CustomerId", "Tag" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customers_PriceTierId",
                table: "customers",
                column: "PriceTierId");

            migrationBuilder.CreateIndex(
                name: "IX_customers_StoreId_Code",
                table: "customers",
                columns: new[] { "StoreId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_customers_StoreId_Email",
                table: "customers",
                columns: new[] { "StoreId", "Email" });

            migrationBuilder.CreateIndex(
                name: "IX_customers_StoreId_Phone",
                table: "customers",
                columns: new[] { "StoreId", "Phone" });

            migrationBuilder.AddForeignKey(
                name: "FK_sales_customers_CustomerId",
                table: "sales",
                column: "CustomerId",
                principalTable: "customers",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_sales_customers_CustomerId",
                table: "sales");

            migrationBuilder.DropTable(
                name: "customer_credit_ledger");

            migrationBuilder.DropTable(
                name: "customer_tags");

            migrationBuilder.DropTable(
                name: "customers");

            migrationBuilder.DropTable(
                name: "customer_price_tiers");

            migrationBuilder.DropIndex(
                name: "IX_sales_CustomerId",
                table: "sales");

            migrationBuilder.DropIndex(
                name: "IX_sales_StoreId_CustomerId",
                table: "sales");

            migrationBuilder.DropColumn(
                name: "CustomerId",
                table: "sales");

            migrationBuilder.DropColumn(
                name: "LoyaltyPointsEarned",
                table: "sales");

            migrationBuilder.DropColumn(
                name: "LoyaltyPointsRedeemed",
                table: "sales");
        }
    }
}
