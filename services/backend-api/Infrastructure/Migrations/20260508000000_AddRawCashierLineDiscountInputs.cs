using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Infrastructure.Migrations
{
    public partial class AddRawCashierLineDiscountInputs : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "RawCashierLineDiscountPercent",
                table: "sale_items",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RawCashierLineDiscountFixed",
                table: "sale_items",
                type: "numeric(18,2)",
                precision: 18,
                scale: 2,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "RawCashierLineDiscountPercent", table: "sale_items");
            migrationBuilder.DropColumn(name: "RawCashierLineDiscountFixed", table: "sale_items");
        }
    }
}

