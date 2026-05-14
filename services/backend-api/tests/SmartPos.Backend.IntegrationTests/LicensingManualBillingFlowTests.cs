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
    public async Task ManualPayment_VerifyThenGenerateLicense_ShouldRequireBillingRole_AndActivateSubscription()
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
        Assert.Matches("^[A-Z]{2}[0-9]{4}$", invoiceNumber);

        var paymentResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = invoiceId,
                method = "bank_deposit",
                amount = 8000m,
                bank_reference = "DEP-REF-001",
                deposit_slip_url = "https://proofs.smartpos.test/dep-ref-001.png",
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
        Assert.Null(verifyAsBilling["activation_entitlement"]);
        Assert.Null(verifyAsBilling["access_delivery"]);

        var generatedLicense = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/license-code/generate",
                new
                {
                    reason_code = "manual_payment_license_code_generated",
                    actor_note = "manual key generation after payment verification",
                    reason = "manual key generation after payment verification",
                    actor = "billing_admin"
                }));

        var activationEntitlementKey = generatedLicense["activation_entitlement"]?["activation_entitlement_key"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Missing generated activation entitlement key.");
        Assert.True((generatedLicense["revoked_entitlements_count"]?.GetValue<int>() ?? 0) >= 0);

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
    public async Task ManualPayment_GenerateLicense_ShouldFail_WhenPaymentIsNotVerified()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var shopCode = $"manual-billing-generate-unverified-{Guid.NewGuid():N}";
        var invoiceResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 3500m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(3),
                notes = "generate should require verified payment",
                actor = "support_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "generate should require verified payment"
            }));
        var invoiceId = TestJson.GetString(invoiceResponse, "invoice_id");

        var paymentResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = invoiceId,
                method = "bank_deposit",
                amount = 3500m,
                bank_reference = "UNVERIFIED-GEN-001",
                actor = "support_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "record payment before verify"
            }));
        var paymentId = TestJson.GetString(paymentResponse, "payment_id");

        await TestAuth.SignInAsBillingAdminAsync(client);

        var generateResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/license-code/generate",
            new
            {
                reason_code = "manual_payment_license_code_generated",
                actor_note = "attempt without verification",
                reason = "attempt without verification",
                actor = "billing_admin"
            });

        Assert.Equal(HttpStatusCode.Conflict, generateResponse.StatusCode);
        var payload = await ReadJsonAsync(generateResponse);
        Assert.Equal("INVALID_PAYMENT_STATUS", payload["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task ManualPayment_GenerateLicense_ShouldRevokePriorActiveEntitlements()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var shopCode = $"manual-billing-generate-revoke-{Guid.NewGuid():N}";
        var invoiceResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 4200m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(3),
                notes = "revoke old entitlement on regeneration",
                actor = "support_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "revoke old entitlement on regeneration"
            }));
        var invoiceId = TestJson.GetString(invoiceResponse, "invoice_id");

        var paymentResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = invoiceId,
                method = "bank_deposit",
                amount = 4200m,
                bank_reference = "REVOKE-GEN-001",
                actor = "support_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "payment ready for verification"
            }));
        var paymentId = TestJson.GetString(paymentResponse, "payment_id");

        await TestAuth.SignInAsBillingAdminAsync(client);
        await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/verify",
                new
                {
                    reason_code = "manual_payment_verified",
                    actor_note = "verified before generation",
                    reason = "verified before generation",
                    extend_days = 30,
                    actor = "billing_admin"
                }));

        var firstGeneration = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/license-code/generate",
                new
                {
                    reason_code = "manual_payment_license_code_generated",
                    actor_note = "first generation",
                    reason = "first generation",
                    actor = "billing_admin"
                }));
        var firstKey = firstGeneration["activation_entitlement"]?["activation_entitlement_key"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Missing first activation key.");

        var secondGeneration = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync(
                $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/license-code/generate",
                new
                {
                    reason_code = "manual_payment_license_code_generated",
                    actor_note = "regenerate after correction",
                    reason = "regenerate after correction",
                    actor = "billing_admin"
                }));
        var secondKey = secondGeneration["activation_entitlement"]?["activation_entitlement_key"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Missing second activation key.");

        Assert.NotEqual(firstKey, secondKey);
        Assert.True((secondGeneration["revoked_entitlements_count"]?.GetValue<int>() ?? 0) >= 1);
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
        Assert.Matches("^[A-Z]{2}[0-9]{4}$", invoiceNumber);
        var paymentResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_number = invoiceNumber,
                method = "cash",
                amount = 5000m,
                bank_reference = "CASH-REF-001",
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
                deposit_slip_url = "https://proofs.smartpos.test/hv-dep-001.pdf",
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
                bank_reference = "UNIQUE-REF-001",
                deposit_slip_url = "https://proofs.smartpos.test/unique-ref-001.png",
                received_at = receivedAt,
                actor = "support_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "bank deposit recorded with unique reference"
            }));

        var verifiedCandidate = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = TestJson.GetString(invoiceB, "invoice_id"),
                method = "bank_deposit",
                amount = 2000m,
                bank_reference = "DUP-REF-001",
                deposit_slip_url = "https://proofs.smartpos.test/dup-ref-001-a.png",
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
                deposit_slip_url = "https://proofs.smartpos.test/dup-ref-001-b.png",
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
        Assert.Contains("duplicate_bank_reference", mismatchReasons);
        Assert.Contains("expected_bank_total_mismatch", mismatchReasons);

        var alertCodes = reconciliation["alerts"]?.AsArray()
            .Select(node => node?["code"]?.GetValue<string>())
            .OfType<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase)
            ?? new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        Assert.Contains("BANK_REFERENCE_DUPLICATE", alertCodes);
        Assert.Contains("BANK_TOTAL_MISMATCH", alertCodes);
    }

    [Fact]
    public async Task ManualPayment_Record_ShouldEnforceMethodEvidenceRules()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var shopCode = $"manual-billing-evidence-shop-{Guid.NewGuid():N}";
        var invoiceResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 5000m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(5),
                notes = "evidence matrix",
                actor = "support_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "evidence matrix"
            }));
        var invoiceId = TestJson.GetString(invoiceResponse, "invoice_id");

        var cashWithoutReference = await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
        {
            invoice_id = invoiceId,
            method = "cash",
            amount = 1000m,
            actor = "support_admin",
            reason_code = "manual_payment_pending_verification",
            actor_note = "missing cash reference"
        });
        Assert.Equal(HttpStatusCode.BadRequest, cashWithoutReference.StatusCode);

        var bankWithReferenceOnly = await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
        {
            invoice_id = invoiceId,
            method = "bank_deposit",
            amount = 1000m,
            bank_reference = "BANK-REF-ONLY",
            actor = "support_admin",
            reason_code = "manual_payment_pending_verification",
            actor_note = "reference-only proof"
        });
        Assert.Equal(HttpStatusCode.OK, bankWithReferenceOnly.StatusCode);

        var bankWithReferenceAndNote = await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
        {
            invoice_id = invoiceId,
            method = "bank_deposit",
            amount = 1000m,
            bank_reference = "BANK-REF-OK",
            actor = "support_admin",
            reason_code = "manual_payment_pending_verification",
            actor_note = "reference-only proof accepted"
        });
        Assert.Equal(HttpStatusCode.OK, bankWithReferenceAndNote.StatusCode);
    }

    [Fact]
    public async Task ManualPayment_Verify_ShouldAllowLegacyRecordWithoutSlip()
    {
        await TestAuth.SignInAsSupportAdminAsync(client);

        var shopCode = $"manual-billing-legacy-evidence-shop-{Guid.NewGuid():N}";
        var invoiceResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/invoices", new
            {
                shop_code = shopCode,
                amount_due = 4000m,
                currency = "LKR",
                due_at = DateTimeOffset.UtcNow.AddDays(5),
                notes = "legacy evidence verify guard",
                actor = "support_admin",
                reason_code = "manual_billing_invoice_created",
                actor_note = "legacy evidence verify guard"
            }));
        var invoiceId = TestJson.GetString(invoiceResponse, "invoice_id");

        var paymentResponse = await TestJson.ReadObjectAsync(
            await client.PostAsJsonAsync("/api/admin/licensing/billing/payments/record", new
            {
                invoice_id = invoiceId,
                method = "bank_deposit",
                amount = 4000m,
                bank_reference = "LEGACY-REF-001",
                actor = "support_admin",
                reason_code = "manual_payment_pending_verification",
                actor_note = "recorded with reference-only proof"
            }));
        var paymentId = TestJson.GetString(paymentResponse, "payment_id");

        await using (var scope = appFactory.Services.CreateAsyncScope())
        {
            var dbContext = scope.ServiceProvider.GetRequiredService<SmartPosDbContext>();
            var payment = await dbContext.ManualBillingPayments
                .SingleAsync(x => x.Id == Guid.Parse(paymentId));
            payment.DepositSlipUrl = null;
            payment.UpdatedAtUtc = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync();
        }

        await TestAuth.SignInAsBillingAdminAsync(client);
        var verifyResponse = await client.PostAsJsonAsync(
            $"/api/admin/licensing/billing/payments/{Uri.EscapeDataString(paymentId)}/verify",
            new
            {
                reason_code = "manual_payment_verified",
                actor_note = "verify legacy reference-only payment",
                reason = "verify legacy reference-only payment",
                extend_days = 30,
                actor = "billing_admin"
            });

        Assert.Equal(HttpStatusCode.OK, verifyResponse.StatusCode);
    }

    private static async Task<JsonObject> ReadJsonAsync(HttpResponseMessage response)
    {
        var payload = await response.Content.ReadFromJsonAsync<JsonObject>();
        return payload ?? throw new InvalidOperationException("Response body was empty.");
    }
}
