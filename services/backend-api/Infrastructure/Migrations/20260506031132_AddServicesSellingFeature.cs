using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddServicesSellingFeature : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CustomPrice",
                table: "sale_items",
                type: "TEXT",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsService",
                table: "sale_items",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<Guid>(
                name: "ServiceId",
                table: "sale_items",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceNameSnapshot",
                table: "sale_items",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ServiceId",
                table: "refund_items",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ServiceNameSnapshot",
                table: "refund_items",
                type: "TEXT",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "services",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoreId = table.Column<Guid>(type: "TEXT", nullable: true),
                    CategoryId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Sku = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    Price = table.Column<decimal>(type: "TEXT", precision: 18, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: true),
                    DurationMinutes = table.Column<int>(type: "INTEGER", nullable: true),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_services", x => x.Id);
                    table.ForeignKey(
                        name: "FK_services_categories_CategoryId",
                        column: x => x.CategoryId,
                        principalTable: "categories",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_sale_items_ServiceId",
                table: "sale_items",
                column: "ServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_refund_items_ServiceId",
                table: "refund_items",
                column: "ServiceId");

            migrationBuilder.CreateIndex(
                name: "IX_services_CategoryId",
                table: "services",
                column: "CategoryId");

            migrationBuilder.CreateIndex(
                name: "IX_services_StoreId_Name",
                table: "services",
                columns: new[] { "StoreId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_services_StoreId_Sku",
                table: "services",
                columns: new[] { "StoreId", "Sku" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_refund_items_services_ServiceId",
                table: "refund_items",
                column: "ServiceId",
                principalTable: "services",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_sale_items_services_ServiceId",
                table: "sale_items",
                column: "ServiceId",
                principalTable: "services",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_refund_items_services_ServiceId",
                table: "refund_items");

            migrationBuilder.DropForeignKey(
                name: "FK_sale_items_services_ServiceId",
                table: "sale_items");

            migrationBuilder.DropTable(
                name: "services");

            migrationBuilder.DropIndex(
                name: "IX_sale_items_ServiceId",
                table: "sale_items");

            migrationBuilder.DropIndex(
                name: "IX_refund_items_ServiceId",
                table: "refund_items");

            migrationBuilder.DropColumn(
                name: "CustomPrice",
                table: "sale_items");

            migrationBuilder.DropColumn(
                name: "IsService",
                table: "sale_items");

            migrationBuilder.DropColumn(
                name: "ServiceId",
                table: "sale_items");

            migrationBuilder.DropColumn(
                name: "ServiceNameSnapshot",
                table: "sale_items");

            migrationBuilder.DropColumn(
                name: "ServiceId",
                table: "refund_items");

            migrationBuilder.DropColumn(
                name: "ServiceNameSnapshot",
                table: "refund_items");
        }
    }
}
