using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class DbSeederTests
{
    [Fact]
    public async Task SeedAsync_WhenSampleCatalogDisabled_SkipsCatalogButSeedsCoreData()
    {
        var dbPath = Path.Combine(Path.GetTempPath(), $"smartpos-seeder-it-{Guid.NewGuid():N}.db");

        try
        {
            var options = new DbContextOptionsBuilder<SmartPosDbContext>()
                .UseSqlite($"Data Source={dbPath}")
                .Options;

            await using var dbContext = new SmartPosDbContext(options);
            await dbContext.Database.EnsureCreatedAsync();

            await DbSeeder.SeedAsync(dbContext, seedSampleCatalog: false);

            Assert.Equal(0, await dbContext.Products.CountAsync());
            Assert.Equal(0, await dbContext.Inventory.CountAsync());
            Assert.Equal(0, await dbContext.Categories.CountAsync());
            Assert.Equal(1, await dbContext.ShopProfiles.CountAsync());
            Assert.Equal(1, await dbContext.Shops.CountAsync());
            Assert.Equal(6, await dbContext.Roles.CountAsync());
            Assert.Equal(6, await dbContext.Users.CountAsync());

            var owner = await dbContext.Users.SingleAsync(x => x.Username == "owner");
            Assert.NotNull(owner.StoreId);
        }
        finally
        {
            try
            {
                if (File.Exists(dbPath))
                {
                    File.Delete(dbPath);
                }
            }
            catch
            {
                // best-effort cleanup
            }
        }
    }
}
