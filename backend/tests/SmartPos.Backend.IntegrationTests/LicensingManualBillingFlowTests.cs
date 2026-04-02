using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingManualBillingFlowTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly CustomWebApplicationFactory appFactory = factory;
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task ManualPayment_Verify_ShouldRequireBillingRole_AndActivateSubscription()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var shopCode = $"manual-billing-shop-{Guid.NewGuid():N}";
        var invoiceResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 8000m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(5),
                notes = "monthly subscription",
                actor = "support_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "monthly subscription"
            }));

        var invoiceId = TestJson.GetString(invoiceResponse, "invoice_id");
        var invoiceNumber = TestJson.GetString(invoiceResponse, "invoice_number");
        Assert.False(string.IsNullOrWhiteSpace(invoiceId));
        Assert.False(string.IsNullOrWhiteSpace(invoiceNumber));

        var paymentResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = invoiceId,
                method = "bank_deposit",
                amount = 8000m,
                bank_reference = "DEP-REF-001",
                actor = "support_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "customer bank deposit submitted"
            }));
        var paymentId = TestJson.GetString(paymentResponse, "payment_id");
        Assert.False(string.IsNullOrWhiteSpace(paymentId));
        Assert.Equal("pending_verification", TestJson.GetString(paymentResponse, "status"));

        var verifyAsSupport = await client.PostAsJsonAsync(
            $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/verify",
            new
            {
                reason_code = "manual_payment_verified",
                actor_note = "support attempt",
                reason = "support attempt",
                extend_days = 30,
                actor = "support_admin"
            });
        Assert.Equal(HttpStatusCode.Forbidden, verifyAsSupport.StatusCode);

        await TestAuth.SignInAsBillingAdminAsync(client);

        var verifyAsBilling = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/verify",
                new
                {
                    reason_code = "manual_payment_verified",
                    actor_note = "bank deposit verified",
                    reason = "bank deposit verified",
                    extend_days = 30,
                    actor = "billing_admin"
                }));

        Assert.Equal("verified", verifyAsBilling["payment"]?["status"]?.GetValue<string>());
        Assert.Equal("paid", verifyAsBilling["invoice"]?["status"]?.GetValue<string>());
        Assert.Equal("active", TestJson.GetString(verifyAsBilling, "subscription_status"));
        var activationEntitlementKey = verifyAsBilling["activation_entitlement"]?["activation_entitlement_key"]?.GetValue<string>();
        Assert.False(string.IsNullOrWhiteSpace(activationEntitlementKey));
        var accessSuccessUrl = verifyAsBilling["access_delivery"]?["success_page_url"]?.GetValue<string>();
        Assert.False(string.IsNullOrWhiteSpace(accessSuccessUrl));
        var accessEmailStatus = verifyAsBilling["access_delivery"]?["email_delivery"]?["status"]?.GetValue<string>();
        Assert.False(string.IsNullOrWhiteSpace(accessEmailStatus));

        var successPage = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/license/access/success?activation_entitlement_key={Uri.EscapeDataString(activationEntitlementKey)}"));
        Assert.Equal("active", TestJson.GetString(successPage, "entitlement_state"));
        Assert.True(successPage["can_activate"]?.GetValue<bool>() ?? false);
        Assert.Equal(
            activationEntitlementKey,
            successPage["activation_entitlement"]?["activation_entitlement_key"]?.GetValue<string>());

        var entitlementActivationDeviceCode = $"manual-billing-activation-{Guid.NewGuid():N}";
        var activationFromEntitlement = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/provision/activate", new
            {
                device_code = entitlementActivationDeviceCode,
                device_name = "Manual Billing Entitlement Device",
                actor = "integration-tests",
                reason = "entitlement activation",
                activation_entitlement_key = activationEntitlementKey
            }));
        Assert.Equal("active", TestJson.GetString(activationFromEntitlement, "state"));

        await using var scope = appFactory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var invoice = await dbContext.ManualBillingInvoices
            .SingleAsync(x => x.InvoiceNumber == invoiceNumber);
        var payment = await dbContext.ManualBillingPayments
            .SingleAsync(x => x.Id == Guid.Parse(paymentId));
        var subscription = await dbContext.Subscriptions
            .SingleAsync(x => x.ShopId == invoice.ShopId);
        var entitlementActivationDevice = await dbContext.ProvisionedDevices
            .SingleAsync(x => x.DeviceCode == entitlementActivationDeviceCode);
        var latestEntitlement = (await dbContext.CustomerActivationEntitlements
                .Where(x => x.ShopId == invoice.ShopId)
                .ToListAsync())
            .OrderByDescending(x => x.IssuedAtUtc)
            .FirstOrDefault();

        Assert.Equal(ManualBillingInvoiceStatus.Paid, invoice.Status);
        Assert.Equal(ManualBillingPaymentStatus.Verified, payment.Status);
        Assert.Equal(SubscriptionStatus.Active, subscription.Status);
        Assert.Equal(invoice.ShopId, entitlementActivationDevice.ShopId);
        Assert.NotNull(latestEntitlement);
        Assert.True(latestEntitlement!.ActivationsUsed >= 1);
    }

    [Fact]
    public async Task ManualPayment_Reject_ShouldMarkPaymentRejected_AndReturnInvoiceToOpen()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var shopCode = $"manual-billing-reject-shop-{Guid.NewGuid():N}";
        var invoiceResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 5000m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(3),
                notes = "pending cash collection",
                actor = "support_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "pending cash collection"
            }));

        var invoiceNumber = TestJson.GetString(invoiceResponse, "invoice_number");
        var paymentResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_number = invoiceNumber,
                method = "cash",
                amount = 5000m,
                actor = "support_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "cash payment received"
            }));
        var paymentId = TestJson.GetString(paymentResponse, "payment_id");
        Assert.False(string.IsNullOrWhiteSpace(paymentId));

        await TestAuth.SignInAsSecurityAdminAsync(client);

        var rejectResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/reject",
                new
                {
                    reason_code = "manual_payment_rejected",
                    actor_note = "deposit proof mismatch",
                    reason = "deposit proof mismatch",
                    actor = "security_admin"
                }));
        Assert.Equal("rejected", TestJson.GetString(rejectResponse, "status"));

        await using var scope = appFactory.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();

        var invoice = await dbContext.ManualBillingInvoices
            .SingleAsync(x => x.InvoiceNumber == invoiceNumber);
        var payment = await dbContext.ManualBillingPayments
            .SingleAsync(x => x.Id == Guid.Parse(paymentId));

        Assert.Equal(ManualBillingInvoiceStatus.Open, invoice.Status);
        Assert.Equal(ManualBillingPaymentStatus.Rejected, payment.Status);
    }

    [Fact]
    public async Task ManualPayment_HighValue_ShouldRequireSecondApprover()
    {
        await TestAuth.SignInAsBillingAdminAsync(client);

        var shopCode = $"manual-billing-highvalue-shop-{Guid.NewGuid():N}";
        var invoiceResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 60000m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(10),
                notes = "high value bank transfer",
                actor = "billing_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "high value bank transfer"
            }));
        var invoiceId = TestJson.GetString(invoiceResponse, "invoice_id");

        var paymentResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = invoiceId,
                method = "bank_transfer",
                amount = 60000m,
                bank_reference = "HV-DEP-001",
                actor = "billing_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "high value transfer recorded"
            }));
        var paymentId = TestJson.GetString(paymentResponse, "payment_id");

        var verifySameActor = await client.PostAsJsonAsync(
            $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/verify",
            new
            {
                reason_code = "manual_payment_verified",
                actor_note = "self verification attempt",
                reason = "self verification attempt",
                extend_days = 30,
                actor = "billing_admin"
            });
        Assert.Equal(HttpStatusCode.Conflict, verifySameActor.StatusCode);
        var conflictPayload = await ReadJsonAsync(verifySameActor);
        Assert.Equal("SECOND_APPROVAL_REQUIRED", conflictPayload["error"]?["code"]?.GetValue<string>());

        await TestAuth.SignInAsSecurityAdminAsync(client);

        var verifySecondApprover = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/verify",
                new
                {
                    reason_code = "manual_payment_verified",
                    actor_note = "second approver validated transfer",
                    reason = "second approver validated transfer",
                    extend_days = 30,
                    actor = "security_admin"
                }));
        Assert.Equal("verified", verifySecondApprover["payment"]?["status"]?.GetValue<string>());
    }

    [Fact]
    public async Task ManualBilling_DailyReconciliation_ShouldReturnMismatchAlerts()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);
        var receivedAt = DateTimeOffset.UtcNow;
        var reconciliationDate = receivedAt.ToString("yyyy-MM-dd");
        var shopCode = $"manual-billing-recon-shop-{Guid.NewGuid():N}";

        var invoiceA = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 1000m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(3),
                notes = "bank deposit without ref",
                actor = "support_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "bank deposit without ref"
            }));
        var invoiceB = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 2000m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(3),
                notes = "bank deposit duplicate ref",
                actor = "support_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "bank deposit duplicate ref"
            }));
        var invoiceC = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 500m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(3),
                notes = "bank transfer duplicate ref",
                actor = "support_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "bank transfer duplicate ref"
            }));

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = TestJson.GetString(invoiceA, "invoice_id"),
                method = "bank_deposit",
                amount = 1000m,
                received_at = receivedAt,
                actor = "support_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "bank deposit recorded without reference"
            }));

        var verifiedCandidate = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = TestJson.GetString(invoiceB, "invoice_id"),
                method = "bank_deposit",
                amount = 2000m,
                bank_reference = "DUP-REF-001",
                received_at = receivedAt,
                actor = "support_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "bank deposit candidate for verification"
            }));
        var verifiedCandidatePaymentId = TestJson.GetString(verifiedCandidate, "payment_id");

        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = TestJson.GetString(invoiceC, "invoice_id"),
                method = "bank_transfer",
                amount = 500m,
                bank_reference = "DUP-REF-001",
                received_at = receivedAt,
                actor = "support_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "bank transfer duplicate reference"
            }));

        await TestAuth.SignInAsBillingAdminAsync(client);
        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(verifiedCandidatePaymentId)}/verify",
                new
                {
                    reason_code = "manual_payment_verified",
                    actor_note = "bank amount validated",
                    reason = "bank amount validated",
                    extend_days = 30,
                    actor = "billing_admin"
                }));

        await TestAuth.SignInAsSupportAdminAsync(client);
        var reconciliation = await TestJson.ReadObjectAsync(
            await client.GetAsync(
                $"/api/admin/licensing/billing/reconciliation/daily?date={Uri.EscapeDataString(reconciliationDate)}&currency=LKR&expected_total=2500"));

        Assert.True(reconciliation["has_mismatch"]?.GetValue<bool>() ?? false);
        var mismatchReasons = reconciliation["mismatch_reasons"]?.AsArray()
            .Select(node => node?.GetValue<string>())
            .OfType<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase)
            ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        Assert.Contains("missing_bank_reference", mismatchReasons);
        Assert.Contains("duplicate_bank_reference", mismatchReasons);
        Assert.Contains("expected_bank_total_mismatch", mismatchReasons);

        var alertCodes = reconciliation["alerts"]?.AsArray()
            .Select(node => node?["code"]?.GetValue<string>())
            .OfType<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase)
            ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        Assert.Contains("BANK_REFERENCE_MISSING", alertCodes);
        Assert.Contains("BANK_REFERENCE_DUPLICATE", alertCodes);
        Assert.Contains("BANK_TOTAL_MISMATCH", alertCodes);
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }
}
