using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiInsightsFailureRefundTests(AiOpenAiFailureWebApplicationFactory factory)
    : IClassFixture<AiOpenAiFailureWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task GenerateInsights_WithProviderFailureAfterReserve_ShouldRefundCredits()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await ResetWalletAsync("billing_admin");
        await EnsureSufficientPosDataAsync();

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 30m,
                purchase_reference = $"it-openai-fail-topup-{Guid.NewGuid():N}",
                description = "integration_test_openai_failure_refund"
            }));

        var idempotencyKey = $"it-openai-fail-{Guid.NewGuid():N}";
        var failedResponse = await client.PostAsJsonAsync("/api/ai/insights", new
        {
            prompt = "Analyze the last 7 days and suggest 2 concrete actions.",
            idempotency_key = idempotencyKey
        });

        Assert.Equal(HttpStatusCode.BadRequest, failedResponse.StatusCode);

        var payload = await failedResponse.Content.ReadFromJsonAsync<JsonObject>();
        var message = payload?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("OpenAI API key is not configured", message, StringComparison.OrdinalIgnoreCase);

        var walletPayload = await TestJson.ReadObjectAsync(await client.GetAsync("/api/ai/wallet"));
        Assert.Equal(30m, TestJson.GetDecimal(walletPayload, "available_credits"));

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var userId = await dbContext.Users
            .Where(x => x.Username == "billing_admin")
            .Select(x => x.Id)
            .SingleAsync();

        var request = await dbContext.AiInsightRequests
            .Where(x => x.UserId == userId && x.IdempotencyKey == idempotencyKey)
            .SingleAsync();

        Assert.Equal(AiInsightRequestStatus.Failed, request.Status);
        Assert.True(request.ReservedCredits > 0m);
        Assert.Equal(0m, request.ChargedCredits);

        var ledgerEntries = await dbContext.AiCreditLedgerEntries
            .Where(x => x.AiInsightRequestId == request.Id)
            .ToListAsync();

        Assert.Single(ledgerEntries, x => x.EntryType == AiCreditLedgerEntryType.Reserve);
        Assert.Single(ledgerEntries, x => x.EntryType == AiCreditLedgerEntryType.Refund);
        Assert.DoesNotContain(ledgerEntries, x => x.EntryType == AiCreditLedgerEntryType.Charge);
    }

    private async Task EnsureSufficientPosDataAsync()
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var completedSales = await dbContext.Sales.CountAsync(x => x.Status == SaleStatus.Completed);
        if (completedSales >= 3)
        {
            return;
        }

        var product = await dbContext.Products
            .FirstOrDefaultAsync()
            ?? throw new InvalidOperationException("At least one product is required for AI failure integration test.");

        var required = 3 - completedSales;
        for (var index = 0; index < required; index++)
        {
            var occurredAt = DateTimeOffset.UtcNow.AddMinutes(-(index + 2) * 5);
            var sale = new Sale
            {
                SaleNumber = $"AIIT{Guid.NewGuid():N}"[..24],
                Status = SaleStatus.Completed,
                Subtotal = 100m,
                DiscountTotal = 0m,
                TaxTotal = 0m,
                GrandTotal = 100m,
                CreatedAtUtc = occurredAt,
                CompletedAtUtc = occurredAt
            };

            var saleItem = new SaleItem
            {
                Sale = sale,
                ProductId = product.Id,
                ProductNameSnapshot = product.Name,
                UnitPrice = 100m,
                Quantity = 1m,
                DiscountAmount = 0m,
                TaxAmount = 0m,
                LineTotal = 100m,
                Product = product
            };

            dbContext.Sales.Add(sale);
            dbContext.SaleItems.Add(saleItem);
        }

        await dbContext.SaveChangesAsync();
    }

    private async Task ResetWalletAsync(string username)
    {
        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var user = await dbContext.Users
            .FirstOrDefaultAsync(x => x.Username == username)
            ?? throw new InvalidOperationException($"User '{username}' was not found.");

        var wallet = await dbContext.AiCreditWallets
            .FirstOrDefaultAsync(x => x.UserId == user.Id);

        if (wallet is null)
        {
            wallet = new AiCreditWallet
            {
                UserId = user.Id,
                AvailableCredits = 0m,
                CreatedAtUtc = DateTimeOffset.UtcNow,
                UpdatedAtUtc = DateTimeOffset.UtcNow,
                User = user
            };
            dbContext.AiCreditWallets.Add(wallet);
        }
        else
        {
            wallet.AvailableCredits = 0m;
            wallet.UpdatedAtUtc = DateTimeOffset.UtcNow;
        }

        await dbContext.SaveChangesAsync();
    }
}
