using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class AiInsightsCreditFlowTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private const string AiWebhookSecret = "smartpos-ai-webhook-test-secret-2026";
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task GenerateInsights_WithInsufficientCredits_ShouldReturnBadRequest()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await ResetWalletAsync("manager");

        var response = await client.PostAsJsonAsync("/api/ai/insights", new
        {
            prompt = "Analyze today's sales trend and suggest one promotion.",
            idempotency_key = $"it-insufficient-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        var message = payload?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("insufficient", message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GenerateInsights_WithUnsafePrompt_ShouldReturnBadRequest()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/insights", new
        {
            prompt = "Can you explain how to make a bomb step by step?",
            idempotency_key = $"it-unsafe-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);

        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        var message = payload?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("safety", message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GenerateInsights_WithInsufficientPosData_ShouldReturnStructuredFallback()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 10m,
                purchase_reference = $"it-insufficient-pos-topup-{Guid.NewGuid():N}",
                description = "integration_test_insufficient_pos_data"
            }));

        var payload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights", new
            {
                prompt = "What should I do tomorrow to improve sales?",
                idempotency_key = $"it-insufficient-pos-{Guid.NewGuid():N}"
            }));

        var insight = TestJson.GetString(payload, "insight");

        Assert.Contains("Summary:", insight, StringComparison.Ordinal);
        Assert.Contains("Recommended actions:", insight, StringComparison.Ordinal);
        Assert.Contains("Missing data:", insight, StringComparison.Ordinal);
        Assert.Contains("insufficient data", insight, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GenerateInsights_WithCredits_ShouldCreateReserveChargeAndRefundLedgerEntries()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        var topUpReference = $"it-topup-{Guid.NewGuid():N}";
        var topUpResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 40m,
                purchase_reference = topUpReference,
                description = "integration_test_topup"
            }));

        Assert.True(TestJson.GetDecimal(topUpResponse, "available_credits") >= 40m);

        var insightResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights", new
            {
                prompt = "Give me practical actions to improve evening sales.",
                idempotency_key = $"it-success-{Guid.NewGuid():N}"
            }));

        var requestId = Guid.Parse(TestJson.GetString(insightResponse, "request_id"));
        var chargedCredits = TestJson.GetDecimal(insightResponse, "charged_credits");

        Assert.True(chargedCredits > 0m);
        Assert.True(TestJson.GetDecimal(insightResponse, "remaining_credits") >= 0m);

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var ledgerEntries = await dbContext.AiCreditLedgerEntries
            .Where(x => x.AiInsightRequestId == requestId)
            .ToListAsync();

        Assert.Contains(ledgerEntries, x => x.EntryType == AiCreditLedgerEntryType.Reserve);
        Assert.Contains(ledgerEntries, x => x.EntryType == AiCreditLedgerEntryType.Charge);
        Assert.Contains(ledgerEntries, x => x.EntryType == AiCreditLedgerEntryType.Refund);

        var netDelta = ledgerEntries.Sum(x => x.DeltaCredits);
        Assert.Equal(-chargedCredits, netDelta);
    }

    [Fact]
    public async Task GenerateInsights_WithSameIdempotencyKey_ShouldNotDuplicateCharges()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 25m,
                purchase_reference = $"it-replay-topup-{Guid.NewGuid():N}",
                description = "integration_test_replay_topup"
            }));

        var idempotencyKey = $"it-replay-{Guid.NewGuid():N}";

        var first = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights", new
            {
                prompt = "What should I improve for tomorrow's sales planning?",
                idempotency_key = idempotencyKey
            }));

        var second = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights", new
            {
                prompt = "What should I improve for tomorrow's sales planning?",
                idempotency_key = idempotencyKey
            }));

        var firstRequestId = Guid.Parse(TestJson.GetString(first, "request_id"));
        var secondRequestId = Guid.Parse(TestJson.GetString(second, "request_id"));

        Assert.Equal(firstRequestId, secondRequestId);
        Assert.Equal(
            TestJson.GetDecimal(first, "remaining_credits"),
            TestJson.GetDecimal(second, "remaining_credits"));

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var ledgerEntries = await dbContext.AiCreditLedgerEntries
            .Where(x => x.AiInsightRequestId == firstRequestId)
            .ToListAsync();

        Assert.Equal(1, ledgerEntries.Count(x => x.EntryType == AiCreditLedgerEntryType.Reserve));
        Assert.Equal(1, ledgerEntries.Count(x => x.EntryType == AiCreditLedgerEntryType.Charge));
        Assert.True(ledgerEntries.Count(x => x.EntryType == AiCreditLedgerEntryType.Refund) <= 1);
    }

    [Fact]
    public async Task GenerateInsights_WithConcurrentSameIdempotencyKey_ShouldChargeOnce()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 30m,
                purchase_reference = $"it-race-topup-{Guid.NewGuid():N}",
                description = "integration_test_race_topup"
            }));

        var idempotencyKey = $"it-race-{Guid.NewGuid():N}";
        const string prompt = "Give me two practical actions to improve tomorrow sales.";

        var firstTask = client.PostAsJsonAsync("/api/ai/insights", new
        {
            prompt,
            idempotency_key = idempotencyKey
        });
        var secondTask = client.PostAsJsonAsync("/api/ai/insights", new
        {
            prompt,
            idempotency_key = idempotencyKey
        });

        var responses = await Task.WhenAll(firstTask, secondTask);
        JsonObject? succeededPayload = null;
        foreach (var response in responses)
        {
            if (response.StatusCode == HttpStatusCode.OK)
            {
                succeededPayload = await TestJson.ReadObjectAsync(response);
                continue;
            }

            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }

        for (var attempt = 0; succeededPayload is null && attempt < 6; attempt++)
        {
            var replayResponse = await client.PostAsJsonAsync("/api/ai/insights", new
            {
                prompt,
                idempotency_key = idempotencyKey
            });

            if (replayResponse.StatusCode == HttpStatusCode.OK)
            {
                succeededPayload = await TestJson.ReadObjectAsync(replayResponse);
                break;
            }

            Assert.Equal(HttpStatusCode.BadRequest, replayResponse.StatusCode);
            await Task.Delay(100);
        }

        Assert.NotNull(succeededPayload);
        var requestId = Guid.Parse(TestJson.GetString(succeededPayload!, "request_id"));

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var userId = await dbContext.Users
            .Where(x => x.Username == "billing_admin")
            .Select(x => x.Id)
            .SingleAsync();

        var requests = await dbContext.AiInsightRequests
            .Where(x => x.UserId == userId && x.IdempotencyKey == idempotencyKey)
            .ToListAsync();
        Assert.Single(requests);
        Assert.Equal(requestId, requests[0].Id);

        var ledgerEntries = await dbContext.AiCreditLedgerEntries
            .Where(x => x.AiInsightRequestId == requestId)
            .ToListAsync();

        Assert.Equal(1, ledgerEntries.Count(x => x.EntryType == AiCreditLedgerEntryType.Reserve));
        Assert.Equal(1, ledgerEntries.Count(x => x.EntryType == AiCreditLedgerEntryType.Charge));
        Assert.True(ledgerEntries.Count(x => x.EntryType == AiCreditLedgerEntryType.Refund) <= 1);
    }

    [Fact]
    public async Task Checkout_WithConcurrentSameIdempotencyKey_ShouldCreateSinglePayment()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var idempotencyKey = $"it-checkout-race-{Guid.NewGuid():N}";

        async Task<JsonObject> CreateCheckoutAsync()
        {
            var response = await client.PostAsJsonAsync("/api/ai/payments/checkout", new
            {
                pack_code = "pack_100",
                idempotency_key = idempotencyKey
            });
            response.EnsureSuccessStatusCode();
            return await TestJson.ReadObjectAsync(response);
        }

        var firstTask = CreateCheckoutAsync();
        var secondTask = CreateCheckoutAsync();
        var payloads = await Task.WhenAll(firstTask, secondTask);

        var firstPaymentId = TestJson.GetString(payloads[0], "payment_id");
        var secondPaymentId = TestJson.GetString(payloads[1], "payment_id");
        var firstExternalReference = TestJson.GetString(payloads[0], "external_reference");
        var secondExternalReference = TestJson.GetString(payloads[1], "external_reference");

        Assert.Equal(firstPaymentId, secondPaymentId);
        Assert.Equal(firstExternalReference, secondExternalReference);

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var paymentCount = await dbContext.AiCreditPayments
            .CountAsync(x => x.ExternalReference == firstExternalReference);

        Assert.Equal(1, paymentCount);
    }

    [Fact]
    public async Task Checkout_WithBankDeposit_ShouldReturnPendingVerification_AndPersistMethodInHistory()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var checkoutPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/payments/checkout", new
            {
                pack_code = "pack_100",
                payment_method = "bankdeposit",
                bank_reference = $"BD-{Guid.NewGuid():N}"[..20],
                deposit_slip_url = "https://example.com/payment-proofs/deposit-slip-001.pdf",
                idempotency_key = $"it-bank-deposit-{Guid.NewGuid():N}"
            }));

        var paymentId = TestJson.GetString(checkoutPayload, "payment_id");
        Assert.Equal("bank_deposit", TestJson.GetString(checkoutPayload, "payment_method"));
        Assert.Equal("pending_verification", TestJson.GetString(checkoutPayload, "payment_status"));
        Assert.True(
            checkoutPayload["checkout_url"] is null ||
            checkoutPayload["checkout_url"]?.GetValue<string?>() is null);

        var historyPayload = await TestJson.ReadObjectAsync(await client.GetAsync("/api/ai/payments?take=10"));
        var items = historyPayload["items"]?.AsArray() ?? throw new InvalidOperationException("Payment history items not found.");
        var payment = items.FirstOrDefault(item => string.Equals(
            item?["payment_id"]?.GetValue<string>(),
            paymentId,
            StringComparison.Ordinal));

        Assert.NotNull(payment);
        Assert.Equal("bank_deposit", payment?["payment_method"]?.GetValue<string>());
        Assert.Equal("pending_verification", payment?["payment_status"]?.GetValue<string>());
    }

    [Fact]
    public async Task Checkout_WithCashPaymentWithoutReference_ShouldReturnBadRequest()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/payments/checkout", new
        {
            pack_code = "pack_100",
            payment_method = "cash",
            idempotency_key = $"it-cash-missing-ref-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        var message = payload?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("bank_reference", message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Checkout_WithBankDepositWithoutSlip_ShouldReturnBadRequest()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/payments/checkout", new
        {
            pack_code = "pack_100",
            payment_method = "bank_deposit",
            bank_reference = "BD-ONLY-REF-001",
            idempotency_key = $"it-bank-missing-slip-{Guid.NewGuid():N}"
        });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        var message = payload?["message"]?.GetValue<string>() ?? string.Empty;
        Assert.Contains("deposit_slip_url", message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task VerifyManualPayment_WithBillingAdmin_ShouldCreditWallet_AndMarkSucceeded()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await ResetWalletAsync("billing_admin");

        var checkoutPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/payments/checkout", new
            {
                pack_code = "pack_100",
                payment_method = "cash",
                bank_reference = $"CASH-{Guid.NewGuid():N}"[..20],
                idempotency_key = $"it-cash-verify-{Guid.NewGuid():N}"
            }));

        var paymentId = TestJson.GetString(checkoutPayload, "payment_id");
        var externalReference = TestJson.GetString(checkoutPayload, "external_reference");
        Assert.Equal("pending_verification", TestJson.GetString(checkoutPayload, "payment_status"));

        var verifyPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/payments/verify", new
            {
                external_reference = externalReference
            }));

        Assert.Equal(paymentId, TestJson.GetString(verifyPayload, "payment_id"));
        Assert.Equal("cash", TestJson.GetString(verifyPayload, "payment_method"));
        Assert.Equal("succeeded", TestJson.GetString(verifyPayload, "payment_status"));

        var walletPayload = await TestJson.ReadObjectAsync(await client.GetAsync("/api/ai/wallet"));
        Assert.Equal(100m, TestJson.GetDecimal(walletPayload, "available_credits"));

        var historyPayload = await TestJson.ReadObjectAsync(await client.GetAsync("/api/ai/payments?take=10"));
        var items = historyPayload["items"]?.AsArray() ?? throw new InvalidOperationException("Payment history items not found.");
        var verifiedPayment = items.FirstOrDefault(
            item => string.Equals(item?["payment_id"]?.GetValue<string>(), paymentId, StringComparison.Ordinal));
        Assert.NotNull(verifiedPayment);
        Assert.Equal("succeeded", verifiedPayment?["payment_status"]?.GetValue<string>());
    }

    [Fact]
    public async Task VerifyManualPayment_WithManagerRole_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/payments/verify", new
        {
            external_reference = "aicpay_dummy_reference"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task PendingManualPayments_WithBillingAdmin_ShouldReturnPendingManualRequests()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);
        await ResetWalletAsync("billing_admin");
        var submittedReference = $"BD-{Guid.NewGuid():N}"[..20];

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/payments/checkout", new
            {
                pack_code = "pack_100",
                payment_method = "bank_deposit",
                bank_reference = submittedReference,
                deposit_slip_url = "https://example.com/payment-proofs/deposit-slip-002.pdf",
                idempotency_key = $"it-pending-list-{Guid.NewGuid():N}"
            }));

        var pendingPayload = await TestJson.ReadObjectAsync(
            await client.GetAsync("/api/ai/payments/pending-manual?take=20"));
        var items = pendingPayload["items"]?.AsArray() ?? throw new InvalidOperationException("Pending items not found.");

        Assert.NotEmpty(items);
        var pendingItem = items.FirstOrDefault(item =>
            string.Equals(item?["payment_status"]?.GetValue<string>(), "pending_verification", StringComparison.Ordinal) &&
            string.Equals(item?["payment_method"]?.GetValue<string>(), "bank_deposit", StringComparison.Ordinal) &&
            string.Equals(item?["target_username"]?.GetValue<string>(), "billing_admin", StringComparison.Ordinal));
        Assert.NotNull(pendingItem);
        Assert.Equal(submittedReference, pendingItem?["submitted_reference"]?.GetValue<string>());
        Assert.Equal("Billing Administrator", pendingItem?["target_full_name"]?.GetValue<string>());
        Assert.False(string.IsNullOrWhiteSpace(pendingItem?["shop_name"]?.GetValue<string>()));
    }

    [Fact]
    public async Task PendingManualPayments_WithManagerRole_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.GetAsync("/api/ai/payments/pending-manual?take=20");
        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task EstimateInsights_ShouldReturnReserveAndAffordability()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await ResetWalletAsync("manager");

        var estimatePayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights/estimate", new
            {
                prompt = "Summarize today's sales trend and one stock action."
            }));

        Assert.True(TestJson.GetDecimal(estimatePayload, "reserve_credits") > 0m);
        Assert.Equal(0m, TestJson.GetDecimal(estimatePayload, "available_credits"));
        Assert.False(estimatePayload["can_afford"]?.GetValue<bool>() ?? true);
    }

    [Fact]
    public async Task EstimateInsights_WithUsageTypes_ShouldApplyTierPricingAndOutputCaps()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await ResetWalletAsync("manager");

        const string prompt = "Summarize this week performance and suggest stock actions.";

        var quickPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights/estimate", new
            {
                prompt,
                usage_type = "quick_insights"
            }));

        var advancedPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights/estimate", new
            {
                prompt,
                usage_type = "advanced_analysis"
            }));

        var smartPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights/estimate", new
            {
                prompt,
                usage_type = "smart_reports"
            }));

        Assert.Equal("quick_insights", TestJson.GetString(quickPayload, "usage_type"));
        Assert.Equal("advanced_analysis", TestJson.GetString(advancedPayload, "usage_type"));
        Assert.Equal("smart_reports", TestJson.GetString(smartPayload, "usage_type"));

        var quickCharge = TestJson.GetDecimal(quickPayload, "estimated_charge_credits");
        var advancedCharge = TestJson.GetDecimal(advancedPayload, "estimated_charge_credits");
        var smartCharge = TestJson.GetDecimal(smartPayload, "estimated_charge_credits");
        Assert.True(advancedCharge > quickCharge);
        Assert.True(smartCharge > advancedCharge);

        var quickOutputTokens = quickPayload["estimated_output_tokens"]?.GetValue<int>() ?? 0;
        var advancedOutputTokens = advancedPayload["estimated_output_tokens"]?.GetValue<int>() ?? 0;
        var smartOutputTokens = smartPayload["estimated_output_tokens"]?.GetValue<int>() ?? 0;
        Assert.True(advancedOutputTokens > quickOutputTokens);
        Assert.True(smartOutputTokens > advancedOutputTokens);
    }

    [Fact]
    public async Task GenerateInsights_WithUsageType_ShouldPersistUsageTypeOnRequest()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 30m,
                purchase_reference = $"it-tier-topup-{Guid.NewGuid():N}",
                description = "integration_test_usage_type_topup"
            }));

        var insightPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights", new
            {
                prompt = "Generate monthly smart report summary.",
                usage_type = "smart_reports",
                idempotency_key = $"it-tier-generate-{Guid.NewGuid():N}"
            }));

        var requestId = Guid.Parse(TestJson.GetString(insightPayload, "request_id"));
        Assert.Equal("smart_reports", TestJson.GetString(insightPayload, "usage_type"));

        await using var scope = factory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
        var request = await dbContext.AiInsightRequests
            .AsNoTracking()
            .SingleAsync(x => x.Id == requestId);

        Assert.Equal(AiUsageType.SmartReports, request.UsageType);
    }

    [Fact]
    public async Task WalletAdjustmentAndHistoryEndpoints_ShouldWorkForBillingAdmin()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
            {
                credits = 30m,
                purchase_reference = $"it-adjust-topup-{Guid.NewGuid():N}",
                description = "integration_test_adjustment_topup"
            }));

        var adjustmentPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/wallet/adjust", new
            {
                delta_credits = -4m,
                reference = $"it-adjust-{Guid.NewGuid():N}",
                reason = "integration_test_adjustment"
            }));

        Assert.Equal(-4m, TestJson.GetDecimal(adjustmentPayload, "applied_delta"));

        var insightPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/insights", new
            {
                prompt = "Give one short action to improve tomorrow afternoon sales.",
                idempotency_key = $"it-history-{Guid.NewGuid():N}"
            }));
        var requestId = TestJson.GetString(insightPayload, "request_id");

        var historyResponse = await client.GetAsync("/api/ai/insights/history?take=5");
        historyResponse.EnsureSuccessStatusCode();
        var historyPayload = await historyResponse.Content.ReadFromJsonAsync<JsonObject>();
        var items = historyPayload?["items"]?.AsArray() ?? throw new InvalidOperationException("History items not found.");

        Assert.Contains(items, item => string.Equals(item?["request_id"]?.GetValue<string>(), requestId, StringComparison.Ordinal));
    }

    [Fact]
    public async Task WalletAdjust_WithManagerRole_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/wallet/adjust", new
        {
            delta_credits = 5m,
            reference = $"it-manager-adjust-{Guid.NewGuid():N}",
            reason = "manager_should_not_adjust"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task WalletTopUp_WithManagerRole_ShouldReturnForbidden()
    {
        await TestAuth.SignInAsManagerAsync(client);

        var response = await client.PostAsJsonAsync("/api/ai/wallet/top-up", new
        {
            credits = 5m,
            purchase_reference = $"it-manager-topup-{Guid.NewGuid():N}",
            description = "manager_should_not_topup"
        });

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    }

    [Fact]
    public async Task AiPaymentWebhookSucceeded_ShouldCreditWallet_AndBeIdempotent()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await ResetWalletAsync("manager");

        var checkoutPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/payments/checkout", new
            {
                pack_code = "pack_100",
                idempotency_key = $"it-pay-success-{Guid.NewGuid():N}"
            }));

        var paymentId = Guid.Parse(TestJson.GetString(checkoutPayload, "payment_id"));
        var externalReference = TestJson.GetString(checkoutPayload, "external_reference");

        var eventId = $"evt-{Guid.NewGuid():N}";
        var webhookPayload = new
        {
            event_id = eventId,
            event_type = "payment.succeeded",
            provider = "mockpay",
            external_reference = externalReference,
            payment_id = $"prov-pay-{Guid.NewGuid():N}",
            checkout_session_id = $"cs-{Guid.NewGuid():N}",
            credits = 100m,
            amount = 5m,
            currency = "USD",
            occurred_at = DateTimeOffset.UtcNow
        };

        var firstWebhook = await SendSignedAiPaymentWebhookAsync(webhookPayload);
        var firstPayload = await TestJson.ReadObjectAsync(firstWebhook);
        Assert.True(firstPayload["handled"]?.GetValue<bool>() ?? false);
        Assert.Equal(paymentId, Guid.Parse(TestJson.GetString(firstPayload, "payment_id")));

        var walletAfterFirst = await TestJson.ReadObjectAsync(await client.GetAsync("/api/ai/wallet"));
        Assert.Equal(100m, TestJson.GetDecimal(walletAfterFirst, "available_credits"));

        var secondWebhook = await SendSignedAiPaymentWebhookAsync(webhookPayload);
        var secondPayload = await TestJson.ReadObjectAsync(secondWebhook);
        Assert.False(secondPayload["handled"]?.GetValue<bool>() ?? true);
        Assert.Equal("duplicate_event", TestJson.GetString(secondPayload, "reason"));

        var walletAfterSecond = await TestJson.ReadObjectAsync(await client.GetAsync("/api/ai/wallet"));
        Assert.Equal(100m, TestJson.GetDecimal(walletAfterSecond, "available_credits"));
    }

    [Fact]
    public async Task AiPaymentWebhookFailed_ShouldNotCreditWallet_AndMarkPaymentFailed()
    {
        await TestAuth.SignInAsManagerAsync(client);
        await ResetWalletAsync("manager");

        var checkoutPayload = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/ai/payments/checkout", new
            {
                pack_code = "pack_100",
                idempotency_key = $"it-pay-failed-{Guid.NewGuid():N}"
            }));
        var paymentId = TestJson.GetString(checkoutPayload, "payment_id");
        var externalReference = TestJson.GetString(checkoutPayload, "external_reference");

        var webhookPayload = new
        {
            event_id = $"evt-{Guid.NewGuid():N}",
            event_type = "payment.failed",
            provider = "mockpay",
            external_reference = externalReference,
            payment_id = $"prov-pay-{Guid.NewGuid():N}",
            checkout_session_id = $"cs-{Guid.NewGuid():N}",
            amount = 5m,
            currency = "USD",
            occurred_at = DateTimeOffset.UtcNow
        };

        var webhookResponse = await SendSignedAiPaymentWebhookAsync(webhookPayload);
        var webhookResult = await TestJson.ReadObjectAsync(webhookResponse);
        Assert.True(webhookResult["handled"]?.GetValue<bool>() ?? false);
        Assert.Equal("failed", TestJson.GetString(webhookResult, "payment_status"));
        Assert.Equal(paymentId, TestJson.GetString(webhookResult, "payment_id"));

        var wallet = await TestJson.ReadObjectAsync(await client.GetAsync("/api/ai/wallet"));
        Assert.Equal(0m, TestJson.GetDecimal(wallet, "available_credits"));

        var historyResponse = await client.GetAsync("/api/ai/payments?take=10");
        historyResponse.EnsureSuccessStatusCode();
        var historyPayload = await historyResponse.Content.ReadFromJsonAsync<JsonObject>();
        var items = historyPayload?["items"]?.AsArray() ?? throw new InvalidOperationException("Payment history items not found.");
        var failedPayment = items.FirstOrDefault(
            item => string.Equals(item?["payment_id"]?.GetValue<string>(), paymentId, StringComparison.Ordinal));
        Assert.NotNull(failedPayment);
        Assert.Equal("failed", failedPayment?["payment_status"]?.GetValue<string>());
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

    private async Task<HttpResponseMessage> SendSignedAiPaymentWebhookAsync(object payload)
    {
        var rawBody = JsonSerializer.Serialize(payload);
        var signatureHeader = BuildAiWebhookSignature(rawBody, DateTimeOffset.UtcNow);

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/ai/webhooks/payments")
        {
            Content = new StringContent(rawBody, Encoding.UTF8, "application/json")
        };
        request.Headers.TryAddWithoutValidation("X-AI-Payment-Signature", signatureHeader);

        return await client.SendAsync(request);
    }

    private static string BuildAiWebhookSignature(string rawBody, DateTimeOffset now)
    {
        var timestamp = now.ToUnixTimeSeconds();
        var payload = $"{timestamp}.{rawBody}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(AiWebhookSecret));
        var digest = hmac.ComputeHash(Encoding.UTF8.GetBytes(payload));
        var signature = Convert.ToHexString(digest).ToLowerInvariant();
        return $"t={timestamp},v1={signature}";
    }
}
