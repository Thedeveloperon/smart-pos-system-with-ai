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
}
