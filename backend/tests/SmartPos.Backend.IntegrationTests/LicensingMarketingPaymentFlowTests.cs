using System.Net;
using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc.Testing;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingMarketingPaymentFlowTests(CustomWebApplicationFactory factory)
    : IClassFixture<CustomWebApplicationFactory>
{
    private readonly HttpClient client = factory.CreateClient();

    [Fact]
    public async Task MarketingPaymentFlow_ProPlan_ShouldCreateInvoiceAndApplyMappedPlanOnVerification()
    {
        var createResponse = await PostJsonAsync("/api/license/public/payment-request", new
        {
            shop_name = "Nelu Groceries",
            contact_name = "Nelu",
            contact_email = "nelu@example.com",
            contact_phone = "+94770000000",
            plan_code = "pro",
            payment_method = "bank_deposit",
            source = "website_pricing"
        });

        Assert.True(createResponse["requires_payment"]?.GetValue<bool>() ?? false);
        Assert.Equal("pro", TestJson.GetString(createResponse, "marketing_plan_code"));
        Assert.Equal("growth", TestJson.GetString(createResponse, "internal_plan_code"));

        var invoiceNode = createResponse["invoice"]?.AsObject()
            ?? throw new InvalidOperationException("Missing invoice payload.");
        var invoiceId = invoiceNode["invoice_id"]?.GetValue<Guid>()
            ?? throw new InvalidOperationException("Missing invoice_id.");
        var invoiceNumber = invoiceNode["invoice_number"]?.GetValue<string>();
        Assert.False(string.IsNullOrWhiteSpace(invoiceNumber));
        Assert.Equal("open", invoiceNode["status"]?.GetValue<string>());

        var submitResponse = await PostJsonAsync("/api/license/public/payment-submit", new
        {
            invoice_id = invoiceId,
            payment_method = "bank_deposit",
            amount = 19m,
            currency = "USD",
            bank_reference = "DEP-REF-MKT-001",
            contact_name = "Nelu",
            contact_email = "nelu@example.com"
        });

        Assert.Equal("pending_verification", TestJson.GetString(submitResponse, "payment_status"));
        Assert.Equal("pending_verification", TestJson.GetString(submitResponse, "invoice_status"));

        var paymentId = submitResponse["payment_id"]?.GetValue<Guid>()
            ?? throw new InvalidOperationException("Missing payment_id.");

        await TestAuth.SignInAsBillingAdminAsync(client);

        var verifyResponse = await PostJsonAsync(
            $"/api/admin/licensing/billing/payments/{paymentId}/verify",
            new
            {
                reason_code = "manual_payment_verified",
                actor_note = "marketing payment verified",
                reason = "marketing payment verified",
                extend_days = 30,
                actor = "billing_admin"
            });

        Assert.Equal("verified", verifyResponse["payment"]?["status"]?.GetValue<string>());
        Assert.Equal("paid", verifyResponse["invoice"]?["status"]?.GetValue<string>());
        Assert.Equal("growth", TestJson.GetString(verifyResponse, "plan"));
    }

    [Fact]
    public async Task MarketingPaymentFlow_StarterPlan_ShouldSkipPaymentAndInvoiceCreation()
    {
        var createResponse = await PostJsonAsync("/api/license/public/payment-request", new
        {
            shop_name = "Starter Shop",
            contact_name = "Owner",
            contact_phone = "+94771111111",
            plan_code = "starter",
            payment_method = "cash",
            source = "website_pricing"
        });

        Assert.False(createResponse["requires_payment"]?.GetValue<bool>() ?? true);
        Assert.Equal("starter", TestJson.GetString(createResponse, "marketing_plan_code"));
        Assert.Equal("trial", TestJson.GetString(createResponse, "internal_plan_code"));
        Assert.Null(createResponse["invoice"]);
        Assert.Equal("open_pos_and_activate_trial", TestJson.GetString(createResponse, "next_step"));
    }

    [Fact]
    public async Task MarketingPaymentFlow_ShouldRejectDuplicateSubmissionForSameInvoice()
    {
        var createResponse = await PostJsonAsync("/api/license/public/payment-request", new
        {
            shop_name = "Duplicate Submit Shop",
            contact_name = "Owner",
            contact_email = "owner+dup@example.com",
            plan_code = "pro",
            payment_method = "bank_deposit",
            source = "website_pricing"
        });

        var invoiceId = createResponse["invoice"]?["invoice_id"]?.GetValue<Guid>()
            ?? throw new InvalidOperationException("Missing invoice_id.");

        await PostJsonAsync("/api/license/public/payment-submit", new
        {
            invoice_id = invoiceId,
            payment_method = "bank_deposit",
            amount = 19m,
            currency = "USD",
            bank_reference = "DEP-REF-DUP-001",
            contact_name = "Owner",
            contact_email = "owner+dup@example.com"
        });

        var duplicateResponse = await PostJsonRawAsync("/api/license/public/payment-submit", new
        {
            invoice_id = invoiceId,
            payment_method = "bank_deposit",
            amount = 19m,
            currency = "USD",
            bank_reference = "DEP-REF-DUP-001",
            contact_name = "Owner",
            contact_email = "owner+dup@example.com"
        });

        Assert.Equal(HttpStatusCode.Conflict, duplicateResponse.StatusCode);
        var error = await duplicateResponse.Content.ReadFromJsonAsync<JsonObject>()
            ?? throw new InvalidOperationException("Missing duplicate submission error payload.");
        Assert.Equal("INVALID_PAYMENT_STATUS", error["error"]?["code"]?.GetValue<string>());
    }

    [Fact]
    public async Task MarketingPaymentProofUpload_ShouldAcceptPngAndReturnHostedUrl()
    {
        var pngBytes = new byte[]
        {
            0x89, 0x50, 0x4E, 0x47,
            0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D,
            0x49, 0x48, 0x44, 0x52
        };

        using var form = new MultipartFormDataContent();
        using var fileContent = new ByteArrayContent(pngBytes);
        fileContent.Headers.ContentType = new MediaTypeHeaderValue("image/png");
        form.Add(fileContent, "file", "payment-proof.png");

        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/license/public/payment-proof-upload")
        {
            Content = form
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));

        var response = await client.SendAsync(request);
        var payload = await TestJson.ReadObjectAsync(response);

        Assert.Equal("image/png", TestJson.GetString(payload, "content_type"));
        Assert.Equal("skipped", TestJson.GetString(payload, "scan_status"));
        Assert.Contains("/payment-proofs/", TestJson.GetString(payload, "proof_url"), StringComparison.Ordinal);
    }

    [Fact]
    public async Task MarketingPaymentFlow_ShouldTrackInstallerDownloadWithInvoiceLink()
    {
        var createResponse = await PostJsonAsync("/api/license/public/payment-request", new
        {
            shop_name = "Tracker Shop",
            contact_name = "Tracker Owner",
            contact_email = "tracker@example.com",
            plan_code = "pro",
            payment_method = "bank_deposit",
            source = "website_pricing"
        });

        var invoiceId = createResponse["invoice"]?["invoice_id"]?.GetValue<Guid>()
            ?? throw new InvalidOperationException("Missing invoice_id.");
        var invoiceNumber = createResponse["invoice"]?["invoice_number"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Missing invoice_number.");

        var submitResponse = await PostJsonAsync("/api/license/public/payment-submit", new
        {
            invoice_id = invoiceId,
            payment_method = "bank_deposit",
            amount = 19m,
            currency = "USD",
            bank_reference = "DEP-REF-TRACK-001",
            contact_name = "Tracker Owner",
            contact_email = "tracker@example.com"
        });

        var paymentId = submitResponse["payment_id"]?.GetValue<Guid>()
            ?? throw new InvalidOperationException("Missing payment_id.");

        await TestAuth.SignInAsBillingAdminAsync(client);

        var verifyResponse = await PostJsonAsync(
            $"/api/admin/licensing/billing/payments/{paymentId}/verify",
            new
            {
                reason_code = "manual_payment_verified",
                actor_note = "marketing payment verified",
                reason = "marketing payment verified",
                extend_days = 30,
                actor = "billing_admin"
            });

        var activationEntitlementKey = verifyResponse["activation_entitlement"]?["activation_entitlement_key"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Missing activation entitlement key.");

        var downloadTrackResponse = await PostJsonAsync("/api/license/public/download-track", new
        {
            activation_entitlement_key = activationEntitlementKey,
            source = "license_access_success",
            channel = "installer_download_button"
        });

        Assert.Equal(invoiceNumber, TestJson.GetString(downloadTrackResponse, "invoice_number"));
        Assert.Equal(paymentId, downloadTrackResponse["payment_id"]?.GetValue<Guid>());
        Assert.Equal(invoiceId, downloadTrackResponse["invoice_id"]?.GetValue<Guid>());

        var successResponse = await TestJson.ReadObjectAsync(
            await client.GetAsync($"/api/license/access/success?activation_entitlement_key={Uri.EscapeDataString(activationEntitlementKey)}"));
        Assert.True(successResponse["installer_download_protected"]?.GetValue<bool>() ?? false);
        Assert.Equal(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            successResponse["installer_checksum_sha256"]?.GetValue<string>());

        var installerDownloadUrl = successResponse["installer_download_url"]?.GetValue<string>()
            ?? throw new InvalidOperationException("Missing installer_download_url.");
        Assert.Contains("/api/license/public/installer-download?token=", installerDownloadUrl, StringComparison.Ordinal);

        using var noRedirectClient = factory.CreateClient(new WebApplicationFactoryClientOptions
        {
            AllowAutoRedirect = false
        });
        var installerRedirectResponse = await noRedirectClient.GetAsync(installerDownloadUrl);
        Assert.Equal(HttpStatusCode.Redirect, installerRedirectResponse.StatusCode);
        Assert.Equal(
            "https://downloads.smartpos.test/SmartPOS-Setup.exe",
            installerRedirectResponse.Headers.Location?.ToString());
    }

    private async Task<JsonObject> PostJsonAsync(string path, object payload)
    {
        using var response = await PostJsonRawAsync(path, payload);
        return await TestJson.ReadObjectAsync(response);
    }

    private async Task<HttpResponseMessage> PostJsonRawAsync(string path, object payload)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, path)
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.TryAddWithoutValidation("Idempotency-Key", Guid.NewGuid().ToString("N"));
        return await client.SendAsync(request);
    }
}
