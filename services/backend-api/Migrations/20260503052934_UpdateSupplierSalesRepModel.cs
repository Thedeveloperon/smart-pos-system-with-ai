using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <inheritdoc />
    public partial class UpdateSupplierSalesRepModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_suppliers_StoreId_Code",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "Code",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "ContactName",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "Email",
                table: "suppliers");

            migrationBuilder.AddColumn<string>(
                name: "CompanyName",
                table: "suppliers",
                type: "TEXT",
                maxLength: 160,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CompanyPhone",
                table: "suppliers",
                type: "TEXT",
                maxLength: 32,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "supplier_brands",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    StoreId = table.Column<Guid>(type: "TEXT", nullable: true),
                    SupplierId = table.Column<Guid>(type: "TEXT", nullable: false),
                    BrandId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_supplier_brands", x => x.Id);
                    table.ForeignKey(
                        name: "FK_supplier_brands_brands_BrandId",
                        column: x => x.BrandId,
                        principalTable: "brands",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_supplier_brands_suppliers_SupplierId",
                        column: x => x.SupplierId,
                        principalTable: "suppliers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_supplier_brands_BrandId",
                table: "supplier_brands",
                column: "BrandId");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_brands_StoreId",
                table: "supplier_brands",
                column: "StoreId");

            migrationBuilder.CreateIndex(
                name: "IX_supplier_brands_SupplierId_BrandId",
                table: "supplier_brands",
                columns: new[] { "SupplierId", "BrandId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "supplier_brands");

            migrationBuilder.DropColumn(
                name: "CompanyName",
                table: "suppliers");

            migrationBuilder.DropColumn(
                name: "CompanyPhone",
                table: "suppliers");

            migrationBuilder.AddColumn<string>(
                name: "Code",
                table: "suppliers",
                type: "TEXT",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContactName",
                table: "suppliers",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Email",
                table: "suppliers",
                type: "TEXT",
                maxLength: 120,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_suppliers_StoreId_Code",
                table: "suppliers",
                columns: new[] { "StoreId", "Code" },
                unique: true);
        }
    }
}
