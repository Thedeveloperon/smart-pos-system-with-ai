using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class WarrantyClaimTimelineEndpointTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private sealed record DirectReplacementFixture(
        Guid ProductId,
        Guid OriginalSerialId,
        Guid ReplacementSerialId,
        Guid SaleId,
        Guid SaleItemId);

    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task WarrantyClaimTimelineFields_ShouldPersistAndBeReturnedByGetAndList()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        var serialId = await CreateClaimableSerialIdAsync();
        var createResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/warranty-claims", new
            {
                serial_number_id = serialId,
                claim_date = "2026-04-15T10:30:00Z",
                resolution_notes = "Screen cracked on left corner"
            }));
        var claimId = TestJson.GetString(createResponse, "id");

        var inRepairResponse = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/warranty-claims/{claimId}", new
            {
                status = "InRepair",
                supplier_name = "Samsung Service Center",
                handover_date = "2026-04-18T09:00:00Z",
                pickup_person_name = "Ruwan Perera"
            }));

        Assert.Equal("InRepair", TestJson.GetString(inRepairResponse, "status"));
        Assert.Equal("Samsung Service Center", TestJson.GetString(inRepairResponse, "supplier_name"));
        Assert.Equal("Ruwan Perera", TestJson.GetString(inRepairResponse, "pickup_person_name"));
        Assert.StartsWith("2026-04-18T09:00:00", TestJson.GetString(inRepairResponse, "handover_date"));

        var receivedBackResponse = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/warranty-claims/{claimId}", new
            {
                status = "InRepair",
                received_back_date = "2026-04-25T16:30:00Z",
                received_back_person_name = "Nimali Silva"
            }));

        Assert.Equal("InRepair", TestJson.GetString(receivedBackResponse, "status"));
        Assert.StartsWith("2026-04-25T16:30:00", TestJson.GetString(receivedBackResponse, "received_back_date"));
        Assert.Equal("Nimali Silva", TestJson.GetString(receivedBackResponse, "received_back_person_name"));

        var resolvedResponse = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/warranty-claims/{claimId}", new
            {
                status = "Resolved"
            }));

        Assert.Equal("Resolved", TestJson.GetString(resolvedResponse, "status"));
        Assert.Equal("Samsung Service Center", TestJson.GetString(resolvedResponse, "supplier_name"));
        Assert.Equal("Ruwan Perera", TestJson.GetString(resolvedResponse, "pickup_person_name"));
        Assert.StartsWith("2026-04-18T09:00:00", TestJson.GetString(resolvedResponse, "handover_date"));
        Assert.StartsWith("2026-04-25T16:30:00", TestJson.GetString(resolvedResponse, "received_back_date"));
        Assert.Equal("Nimali Silva", TestJson.GetString(resolvedResponse, "received_back_person_name"));
        Assert.Equal("Screen cracked on left corner", TestJson.GetString(resolvedResponse, "resolution_notes"));

        var claimResponse = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/warranty-claims/{claimId}"));
        Assert.Equal("Samsung Service Center", TestJson.GetString(claimResponse, "supplier_name"));
        Assert.StartsWith("2026-04-18T09:00:00", TestJson.GetString(claimResponse, "handover_date"));
        Assert.Equal("Ruwan Perera", TestJson.GetString(claimResponse, "pickup_person_name"));
        Assert.StartsWith("2026-04-25T16:30:00", TestJson.GetString(claimResponse, "received_back_date"));
        Assert.Equal("Nimali Silva", TestJson.GetString(claimResponse, "received_back_person_name"));

        var claimsResponse = await TestJson.ReadObjectAsync(await client.GetAsync("/api/warranty-claims"));
        var item = claimsResponse["items"]?.AsArray()
            .OfType<JsonObject>()
            .FirstOrDefault(entry =>
                string.Equals(TestJson.GetString(entry, "id"), claimId, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Expected claim to be present in listing.");

        Assert.Equal("Samsung Service Center", TestJson.GetString(item, "supplier_name"));
        Assert.StartsWith("2026-04-18T09:00:00", TestJson.GetString(item, "handover_date"));
        Assert.Equal("Ruwan Perera", TestJson.GetString(item, "pickup_person_name"));
        Assert.StartsWith("2026-04-25T16:30:00", TestJson.GetString(item, "received_back_date"));
        Assert.Equal("Nimali Silva", TestJson.GetString(item, "received_back_person_name"));
    }

    [Fact]
    public async Task WarrantyClaimStatusTransitions_ShouldRemainUnchanged()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        var serialId = await CreateClaimableSerialIdAsync();
        var createResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/warranty-claims", new
            {
                serial_number_id = serialId,
                claim_date = "2026-04-20T08:00:00Z"
            }));
        var claimId = TestJson.GetString(createResponse, "id");

        var resolveResponse = await client.PutAsJsonAsync($"/api/warranty-claims/{claimId}", new
        {
            status = "Resolved"
        });
        resolveResponse.EnsureSuccessStatusCode();

        var invalidTransition = await client.PutAsJsonAsync($"/api/warranty-claims/{claimId}", new
        {
            status = "Open"
        });

        Assert.Equal(HttpStatusCode.BadRequest, invalidTransition.StatusCode);
        var payload = await invalidTransition.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Expected error payload.");
        Assert.Equal("Invalid warranty claim status transition.", TestJson.GetString(payload, "message"));
    }

    [Fact]
    public async Task WarrantyClaimTimestamps_ShouldDefaultToServerTimeWhenOmitted()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        var serialId = await CreateClaimableSerialIdAsync();

        var createStartedAt = DateTimeOffset.UtcNow;
        var createResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/warranty-claims", new
            {
                serial_number_id = serialId,
                resolution_notes = "Speaker issue"
            }));
        var createFinishedAt = DateTimeOffset.UtcNow;

        var claimId = TestJson.GetString(createResponse, "id");
        var claimDate = DateTimeOffset.Parse(TestJson.GetString(createResponse, "claim_date"));
        Assert.InRange(claimDate, createStartedAt.AddSeconds(-1), createFinishedAt.AddSeconds(1));

        var handoverStartedAt = DateTimeOffset.UtcNow;
        var handoverResponse = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/warranty-claims/{claimId}", new
            {
                status = "InRepair",
                supplier_name = "Samsung Service Center",
                pickup_person_name = "Ruwan Perera"
            }));
        var handoverFinishedAt = DateTimeOffset.UtcNow;

        var handoverDate = DateTimeOffset.Parse(TestJson.GetString(handoverResponse, "handover_date"));
        Assert.InRange(handoverDate, handoverStartedAt.AddSeconds(-1), handoverFinishedAt.AddSeconds(1));

        var receivedBackStartedAt = DateTimeOffset.UtcNow;
        var receivedBackResponse = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/warranty-claims/{claimId}", new
            {
                status = "InRepair",
                received_back_person_name = "Nimali Silva"
            }));
        var receivedBackFinishedAt = DateTimeOffset.UtcNow;

        var receivedBackDate = DateTimeOffset.Parse(
            TestJson.GetString(receivedBackResponse, "received_back_date"));
        Assert.InRange(
            receivedBackDate,
            receivedBackStartedAt.AddSeconds(-1),
            receivedBackFinishedAt.AddSeconds(1));
        Assert.Equal("Nimali Silva", TestJson.GetString(receivedBackResponse, "received_back_person_name"));

        var resolvedResponse = await TestJson.ReadObjectAsync(
            await client.PutAsJsonAsync($"/api/warranty-claims/{claimId}", new
            {
                status = "Resolved",
                resolution_notes = "Speaker replaced"
            }));

        Assert.Equal("Resolved", TestJson.GetString(resolvedResponse, "status"));
        Assert.StartsWith(
            receivedBackDate.ToString("O")[..19],
            TestJson.GetString(resolvedResponse, "received_back_date"));
        Assert.Equal("Speaker replaced", TestJson.GetString(resolvedResponse, "resolution_notes"));
    }

    [Fact]
    public async Task OpenWarrantyClaim_ShouldSupportDirectReplacementWithAvailableSerial()
    {
        await TestAuth.SignInAsOwnerAsync(client);

        var fixture = await CreateDirectReplacementFixtureAsync();
        var createResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/warranty-claims", new
            {
                serial_number_id = fixture.OriginalSerialId,
                resolution_notes = "Customer reported display issue"
            }));
        var claimId = Guid.Parse(TestJson.GetString(createResponse, "id"));

        var replaceResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync($"/api/warranty-claims/{claimId}/replace", new
            {
                replacement_serial_number_id = fixture.ReplacementSerialId,
                replacement_date = "2026-04-22T11:15:00Z",
                resolution_notes = "Replaced directly from shop stock"
            }));

        Assert.Equal("Resolved", TestJson.GetString(replaceResponse, "status"));
        Assert.Equal(fixture.ReplacementSerialId.ToString(), TestJson.GetString(replaceResponse, "replacement_serial_number_id"));
        Assert.StartsWith("2026-04-22T11:15:00", TestJson.GetString(replaceResponse, "replacement_date"));
        Assert.Equal("Replaced directly from shop stock", TestJson.GetString(replaceResponse, "resolution_notes"));

        using (var scope = factory.Services.CreateScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

            var claim = await dbContext.WarrantyClaims
                .AsNoTracking()
                .FirstAsync(x => x.Id == claimId);
            var originalSerial = await dbContext.SerialNumbers
                .AsNoTracking()
                .FirstAsync(x => x.Id == fixture.OriginalSerialId);
            var replacementSerial = await dbContext.SerialNumbers
                .AsNoTracking()
                .FirstAsync(x => x.Id == fixture.ReplacementSerialId);
            var inventory = await dbContext.Inventory
                .AsNoTracking()
                .FirstAsync(x => x.ProductId == fixture.ProductId);
            var movement = await dbContext.StockMovements
                .AsNoTracking()
                .FirstAsync(x =>
                    x.ReferenceId == claimId &&
                    x.SerialNumber == replacementSerial.SerialValue &&
                    x.Reason == "warranty replacement");

            Assert.Equal(WarrantyClaimStatus.Resolved, claim.Status);
            Assert.Equal(fixture.ReplacementSerialId, claim.ReplacementSerialNumberId);
            Assert.Equal(DateTimeOffset.Parse("2026-04-22T11:15:00Z"), claim.ReplacementDate);
            Assert.Equal("Replaced directly from shop stock", claim.ResolutionNotes);

            Assert.Equal(SerialNumberStatus.Defective, originalSerial.Status);
            Assert.Equal(SerialNumberStatus.Sold, replacementSerial.Status);
            Assert.Equal(fixture.SaleId, replacementSerial.SaleId);
            Assert.Equal(fixture.SaleItemId, replacementSerial.SaleItemId);
            Assert.Equal(originalSerial.WarrantyExpiryDate, replacementSerial.WarrantyExpiryDate);

            Assert.Equal(0m, inventory.QuantityOnHand);
            Assert.Equal(StockMovementType.Adjustment, movement.MovementType);
            Assert.Equal(StockMovementRef.Adjustment, movement.ReferenceType);
            Assert.Equal(-1m, movement.QuantityChange);
        }

        var claimResponse = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/warranty-claims/{claimId}"));
        Assert.Equal(fixture.ReplacementSerialId.ToString(), TestJson.GetString(claimResponse, "replacement_serial_number_id"));
        Assert.StartsWith("SHOP-REP-", TestJson.GetString(claimResponse, "replacement_serial_value"));
        Assert.StartsWith("2026-04-22T11:15:00", TestJson.GetString(claimResponse, "replacement_date"));

        var claimsResponse = await TestJson.ReadObjectAsync(await client.GetAsync("/api/warranty-claims"));
        var item = claimsResponse["items"]?.AsArray()
            .OfType<JsonObject>()
            .FirstOrDefault(entry =>
                string.Equals(TestJson.GetString(entry, "id"), claimId.ToString(), StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException("Expected replacement claim to be present in listing.");

        Assert.Equal(fixture.ReplacementSerialId.ToString(), TestJson.GetString(item, "replacement_serial_number_id"));
        Assert.StartsWith("SHOP-REP-", TestJson.GetString(item, "replacement_serial_value"));
        Assert.StartsWith("2026-04-22T11:15:00", TestJson.GetString(item, "replacement_date"));
    }

    private async Task<Guid> CreateClaimableSerialIdAsync()
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var storeId = await dbContext.Shops
            .AsNoTracking()
            .Select(x => x.Id)
            .FirstAsync();
        var now = DateTimeOffset.UtcNow;
        var runId = Guid.NewGuid().ToString("N")[..8];

        var product = new Product
        {
            StoreId = storeId,
            Name = $"Warranty Serial Product {runId}",
            Sku = $"WARRANTY-{runId}",
            UnitPrice = 1000m,
            CostPrice = 700m,
            IsActive = true,
            IsSerialTracked = true,
            WarrantyMonths = 12,
            IsBatchTracked = false,
            ExpiryAlertDays = 30,
            CreatedAtUtc = now
        };

        var serial = new SerialNumber
        {
            StoreId = storeId,
            Product = product,
            SerialValue = $"SN-WARRANTY-{runId}",
            Status = SerialNumberStatus.Sold,
            WarrantyExpiryDate = now.AddMonths(12),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Products.Add(product);
        dbContext.SerialNumbers.Add(serial);
        await dbContext.SaveChangesAsync();
        return serial.Id;
    }

    private async Task<DirectReplacementFixture> CreateDirectReplacementFixtureAsync()
    {
        using var scope = factory.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var storeId = await dbContext.Shops
            .AsNoTracking()
            .Select(x => x.Id)
            .FirstAsync();
        var now = DateTimeOffset.UtcNow;
        var runId = Guid.NewGuid().ToString("N")[..8];

        var product = new Product
        {
            StoreId = storeId,
            Name = $"Warranty Replacement Product {runId}",
            Sku = $"WARRANTY-REP-{runId}",
            UnitPrice = 1250m,
            CostPrice = 900m,
            IsActive = true,
            IsSerialTracked = true,
            WarrantyMonths = 12,
            IsBatchTracked = false,
            ExpiryAlertDays = 30,
            CreatedAtUtc = now
        };

        var inventory = new InventoryRecord
        {
            StoreId = storeId,
            Product = product,
            InitialStockQuantity = 1m,
            QuantityOnHand = 1m,
            ReorderLevel = 0m,
            SafetyStock = 0m,
            TargetStockLevel = 0m,
            AllowNegativeStock = false,
            UpdatedAtUtc = now
        };

        var sale = new Sale
        {
            StoreId = storeId,
            SaleNumber = $"SALE-WARRANTY-{runId}",
            Status = SaleStatus.Completed,
            Subtotal = 1250m,
            DiscountTotal = 0m,
            TaxTotal = 0m,
            GrandTotal = 1250m,
            CreatedAtUtc = now,
            CompletedAtUtc = now
        };

        var saleItem = new SaleItem
        {
            Sale = sale,
            Product = product,
            ProductNameSnapshot = product.Name,
            UnitPrice = product.UnitPrice,
            Quantity = 1m,
            DiscountAmount = 0m,
            TaxAmount = 0m,
            LineTotal = product.UnitPrice
        };

        var originalSerial = new SerialNumber
        {
            StoreId = storeId,
            Product = product,
            Sale = sale,
            SaleItem = saleItem,
            SerialValue = $"SHOP-CLM-{runId}",
            Status = SerialNumberStatus.Sold,
            WarrantyExpiryDate = now.AddMonths(12),
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        var replacementSerial = new SerialNumber
        {
            StoreId = storeId,
            Product = product,
            SerialValue = $"SHOP-REP-{runId}",
            Status = SerialNumberStatus.Available,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Products.Add(product);
        dbContext.Inventory.Add(inventory);
        dbContext.Sales.Add(sale);
        dbContext.SaleItems.Add(saleItem);
        dbContext.SerialNumbers.AddRange(originalSerial, replacementSerial);
        await dbContext.SaveChangesAsync();

        return new DirectReplacementFixture(
            product.Id,
            originalSerial.Id,
            replacementSerial.Id,
            sale.Id,
            saleItem.Id);
    }
}
