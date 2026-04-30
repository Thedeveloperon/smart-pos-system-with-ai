using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace backend.Migrations
{
    /// <summary>
    /// Baseline marker for the pre-purchase schema.
    /// The runtime still provisions the database via EnsureCreated; this migration
    /// exists so the EF history can stay clean and purchase changes can live in a
    /// dedicated incremental migration.
    /// </summary>
    public partial class InitialBaseline : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
