using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Licensing;

public static class LicenseEndpoints
{
    public static IEndpointRouteBuilder MapLicensingEndpoints(this IEndpointRouteBuilder app)
    {
        var provision = app.MapGroup("/api/provision")
            .WithTags("Provisioning");

        provision.MapPost("/challenge", async (
            ProvisionChallengeRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : request.DeviceCode;

            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateActivationChallengeAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("CreateProvisionChallenge")
        .WithOpenApi();

        provision.MapPost("/activate", async (
            ProvisionActivateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : request.DeviceCode;

            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ActivateAsync(request, cancellationToken);
                SyncLicenseTokenCookie(httpContext, licenseService, response);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                if (ex.Code is LicenseErrorCodes.InvalidToken or LicenseErrorCodes.DeviceMismatch or LicenseErrorCodes.DeviceKeyMismatch)
                {
                    licenseService.WriteLicenseTokenCookie(httpContext, null);
                }

                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("ActivateProvision")
        .WithOpenApi();

        provision.MapPost("/deactivate", [Authorize(Roles = $"{SmartPosRoles.Owner},{SmartPosRoles.Manager}")] async (
            ProvisionDeactivateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : request.DeviceCode;

            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.DeactivateAsync(request, cancellationToken);
                SyncLicenseTokenCookie(httpContext, licenseService, response);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("DeactivateProvision")
        .WithOpenApi();

        var license = app.MapGroup("/api/license")
            .WithTags("Licensing");

        license.MapGet("/status", async (
            string? device_code,
            HttpContext httpContext,
            LicenseService licenseService,
            ILicensingAlertMonitor alertMonitor,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var deviceCode = licenseService.ResolveDeviceCode(device_code, httpContext);
                var token = string.IsNullOrWhiteSpace(device_code)
                    ? licenseService.ResolveLicenseToken(httpContext)
                    : licenseService.ResolveLicenseToken(httpContext, includeCookie: false);
                var response = await licenseService.GetStatusAsync(deviceCode, token, cancellationToken);
                SyncLicenseTokenCookie(httpContext, licenseService, response);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                alertMonitor.RecordLicenseValidationFailure(ex.Code);
                if (ex.Code is LicenseErrorCodes.InvalidToken or LicenseErrorCodes.DeviceMismatch or LicenseErrorCodes.DeviceKeyMismatch or LicenseErrorCodes.TokenReplayDetected)
                {
                    licenseService.WriteLicenseTokenCookie(httpContext, null);
                }

                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("GetLicenseStatus")
        .WithOpenApi();

        license.MapPost("/heartbeat", async (
            LicenseHeartbeatRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            LicensingMetrics licensingMetrics,
            ILicensingAlertMonitor alertMonitor,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : request.DeviceCode;

            if (string.IsNullOrWhiteSpace(request.LicenseToken))
            {
                request.LicenseToken = licenseService.ResolveLicenseToken(httpContext);
            }

            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.HeartbeatAsync(request, cancellationToken);
                SyncLicenseTokenCookie(httpContext, licenseService, response);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                licensingMetrics.RecordHeartbeatFailure(ex.Code);
                alertMonitor.RecordLicenseValidationFailure(ex.Code);
                if (ex.Code is LicenseErrorCodes.InvalidToken or LicenseErrorCodes.DeviceMismatch or LicenseErrorCodes.DeviceKeyMismatch or LicenseErrorCodes.TokenReplayDetected)
                {
                    licenseService.WriteLicenseTokenCookie(httpContext, null);
                }

                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("LicenseHeartbeat")
        .WithOpenApi();

        license.MapGet("/activation-entitlement", [Authorize(Roles = $"{SmartPosRoles.Owner},{SmartPosRoles.Manager}")] async (
            string? shop_code,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetLatestActivationEntitlementAsync(shop_code, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("GetLatestActivationEntitlement")
        .WithOpenApi();

        license.MapGet("/access/success", async (
            string activation_entitlement_key,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetLicenseAccessSuccessAsync(
                    activation_entitlement_key,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("GetLicenseAccessSuccess")
        .WithOpenApi();

        license.MapGet("/account/licenses", [Authorize(Policy = SmartPosPolicies.ManagerOrOwner)] async (
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetCustomerLicensePortalAsync(cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("GetCustomerLicensePortal")
        .WithOpenApi();

        license.MapPost("/account/licenses/devices/{device_code}/deactivate", [Authorize(Policy = SmartPosPolicies.ManagerOrOwner)] async (
            string device_code,
            CustomerSelfServiceDeviceDeactivationRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.DeactivateDeviceViaSelfServiceAsync(device_code, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("DeactivateCustomerLicenseDevice")
        .WithOpenApi();

        license.MapPut("/subscription/billing-provider", [Authorize(Roles = $"{SmartPosRoles.Owner},{SmartPosRoles.Manager}")] async (
            BillingProviderIdsUpsertRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.UpsertBillingProviderIdsAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("UpsertBillingProviderIds")
        .WithOpenApi();

        license.MapPut("/subscription/reconcile", [Authorize(Roles = $"{SmartPosRoles.Owner},{SmartPosRoles.Manager}")] async (
            SubscriptionReconciliationRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ReconcileSubscriptionStateAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("ReconcileSubscriptionState")
        .WithOpenApi();

        license.MapPost("/webhooks/billing", async (
            HttpContext httpContext,
            LicenseService licenseService,
            ILicensingAlertMonitor alertMonitor,
            CancellationToken cancellationToken) =>
        {
            BillingWebhookEventRequest? request = null;
            try
            {
                string rawBody;
                using (var reader = new StreamReader(httpContext.Request.Body, Encoding.UTF8))
                {
                    rawBody = await reader.ReadToEndAsync();
                }

                if (string.IsNullOrWhiteSpace(rawBody))
                {
                    throw new LicenseException(
                        LicenseErrorCodes.InvalidWebhook,
                        "Webhook payload is empty.",
                        StatusCodes.Status400BadRequest);
                }

                licenseService.VerifyBillingWebhookSignature(rawBody, httpContext.Request.Headers);

                request = JsonSerializer.Deserialize<BillingWebhookEventRequest>(
                    rawBody,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                    ?? throw new LicenseException(
                        LicenseErrorCodes.InvalidWebhook,
                        "Webhook payload is invalid JSON.",
                        StatusCodes.Status400BadRequest);

                var response = await licenseService.HandleBillingWebhookAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                alertMonitor.RecordWebhookFailure(request?.EventType, ex.Code);
                if (ex.Code is LicenseErrorCodes.InvalidWebhook or LicenseErrorCodes.InvalidWebhookSignature)
                {
                    alertMonitor.RecordSecurityAnomaly("billing_webhook_malformed_payload");
                }
                return ToErrorResult(ex);
            }
            catch (Exception ex)
            {
                alertMonitor.RecordWebhookFailure(request?.EventType, ex.GetType().Name);
                alertMonitor.RecordSecurityAnomaly("billing_webhook_malformed_payload");
                return Results.BadRequest(new LicenseErrorPayload
                {
                    Error = new LicenseErrorItem
                    {
                        Code = LicenseErrorCodes.InvalidWebhook,
                        Message = ex.Message
                    }
                });
            }
        })
        .AllowAnonymous()
        .WithName("HandleBillingWebhook")
        .WithOpenApi();

        license.MapPost("/webhooks/stripe", async (
            HttpContext httpContext,
            LicenseService licenseService,
            ILicensingAlertMonitor alertMonitor,
            CancellationToken cancellationToken) =>
        {
            BillingWebhookEventRequest? mappedRequest = null;
            try
            {
                string rawBody;
                using (var reader = new StreamReader(httpContext.Request.Body, Encoding.UTF8))
                {
                    rawBody = await reader.ReadToEndAsync();
                }

                if (string.IsNullOrWhiteSpace(rawBody))
                {
                    throw new LicenseException(
                        LicenseErrorCodes.InvalidWebhook,
                        "Webhook payload is empty.",
                        StatusCodes.Status400BadRequest);
                }

                licenseService.VerifyBillingWebhookSignature(rawBody, httpContext.Request.Headers);
                mappedRequest = licenseService.MapStripeWebhookEvent(rawBody);

                var response = await licenseService.HandleBillingWebhookAsync(mappedRequest, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                alertMonitor.RecordWebhookFailure(mappedRequest?.EventType, ex.Code);
                if (ex.Code is LicenseErrorCodes.InvalidWebhook or LicenseErrorCodes.InvalidWebhookSignature)
                {
                    alertMonitor.RecordSecurityAnomaly("billing_webhook_malformed_payload");
                }
                return ToErrorResult(ex);
            }
            catch (Exception ex)
            {
                alertMonitor.RecordWebhookFailure(mappedRequest?.EventType, ex.GetType().Name);
                alertMonitor.RecordSecurityAnomaly("billing_webhook_malformed_payload");
                return Results.BadRequest(new LicenseErrorPayload
                {
                    Error = new LicenseErrorItem
                    {
                        Code = LicenseErrorCodes.InvalidWebhook,
                        Message = ex.Message
                    }
                });
            }
        })
        .AllowAnonymous()
        .WithName("HandleStripeBillingWebhook")
        .WithOpenApi();

        var publicBilling = app.MapGroup("/api/license/public")
            .WithTags("Licensing Public");

        publicBilling.MapPost("/payment-request", async (
            MarketingPaymentRequestCreateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateMarketingPaymentRequestAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("CreateMarketingPaymentRequest")
        .WithOpenApi();

        publicBilling.MapPost("/stripe/checkout-session", async (
            MarketingPaymentRequestCreateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateMarketingStripeCheckoutSessionAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("CreateMarketingStripeCheckoutSession")
        .WithOpenApi();

        publicBilling.MapGet("/stripe/checkout-session-status", async (
            string session_id,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetMarketingStripeCheckoutSessionStatusAsync(session_id, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("GetMarketingStripeCheckoutSessionStatus")
        .WithOpenApi();

        publicBilling.MapPost("/payment-proof-upload", async (
            IFormFile? file,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.UploadMarketingPaymentProofAsync(file, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .DisableAntiforgery()
        .WithName("UploadMarketingPaymentProof")
        .WithOpenApi();

        publicBilling.MapPost("/payment-submit", async (
            MarketingPaymentSubmissionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.SubmitMarketingPaymentAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("SubmitMarketingPayment")
        .WithOpenApi();

        publicBilling.MapGet("/ai-credit-order-status", async (
            Guid? order_id,
            string? invoice_number,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetMarketingAiCreditOrderStatusAsync(
                    order_id,
                    invoice_number,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("GetMarketingAiCreditOrderStatus")
        .WithOpenApi();

        publicBilling.MapPost("/download-track", async (
            MarketingLicenseDownloadTrackRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.TrackMarketingLicenseDownloadAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("TrackMarketingLicenseDownload")
        .WithOpenApi();

        publicBilling.MapGet("/installer-download", async (
            string token,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var redirectUrl = await licenseService.ResolveProtectedInstallerDownloadRedirectAsync(token, cancellationToken);
                return Results.Redirect(redirectUrl, permanent: false);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("ResolveProtectedInstallerDownload")
        .WithOpenApi();

        var admin = app.MapGroup("/api/admin/licensing")
            .WithTags("Licensing Admin")
            .RequireAuthorization(SmartPosPolicies.SuperAdmin);

        admin.MapGet("/shops", async (
            string? search,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            var response = await licenseService.GetAdminShopsSnapshotAsync(search, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("AdminGetLicensingShops")
        .WithOpenApi();

        admin.MapGet("/audit-logs", async (
            string? search,
            string? action,
            string? actor,
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            var response = await licenseService.GetAdminAuditLogsAsync(
                search,
                action,
                actor,
                take ?? 50,
                cancellationToken);
            return Results.Ok(response);
        })
        .WithName("AdminSearchLicenseAuditLogs")
        .WithOpenApi();

        admin.MapGet("/audit-logs/export", async (
            string? search,
            string? action,
            string? actor,
            string? format,
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            var normalizedFormat = string.IsNullOrWhiteSpace(format)
                ? "csv"
                : format.Trim().ToLowerInvariant();
            if (normalizedFormat is not ("csv" or "json"))
            {
                return ToErrorResult(new LicenseException(
                    LicenseErrorCodes.InvalidAdminRequest,
                    "format must be either 'csv' or 'json'.",
                    StatusCodes.Status400BadRequest));
            }

            var normalizedTake = Math.Clamp(take ?? 200, 1, 500);
            if (normalizedFormat == "json")
            {
                var json = await licenseService.ExportAdminAuditLogsJsonAsync(
                    search,
                    action,
                    actor,
                    normalizedTake,
                    cancellationToken);
                return Results.File(
                    Encoding.UTF8.GetBytes(json),
                    "application/json; charset=utf-8",
                    $"license-audit-logs-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.json");
            }

            var csv = await licenseService.ExportAdminAuditLogsCsvAsync(
                search,
                action,
                actor,
                normalizedTake,
                cancellationToken);
            return Results.File(
                Encoding.UTF8.GetBytes(csv),
                "text/csv; charset=utf-8",
                $"license-audit-logs-{DateTimeOffset.UtcNow:yyyyMMddHHmmss}.csv");
        })
        .WithName("AdminExportLicenseAuditLogs")
        .WithOpenApi();

        admin.MapGet("/billing/invoices", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            string? search,
            string? status,
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetAdminManualInvoicesAsync(
                    search,
                    status,
                    take ?? 50,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrBilling)
        .WithName("AdminGetManualBillingInvoices")
        .WithOpenApi();

        admin.MapPost("/billing/invoices", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            AdminManualBillingInvoiceCreateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateManualInvoiceAsAdminAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrBilling)
        .WithName("AdminCreateManualBillingInvoice")
        .WithOpenApi();

        admin.MapGet("/billing/payments", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            string? search,
            string? status,
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetAdminManualPaymentsAsync(
                    search,
                    status,
                    take ?? 50,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrBilling)
        .WithName("AdminGetManualBillingPayments")
        .WithOpenApi();

        admin.MapPost("/billing/payments/record", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            AdminManualBillingPaymentRecordRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.RecordManualPaymentAsAdminAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrBilling)
        .WithName("AdminRecordManualBillingPayment")
        .WithOpenApi();

        admin.MapPost("/billing/payments/{payment_id:guid}/verify", [Authorize(Policy = SmartPosPolicies.BillingOrSecurity)] async (
            Guid payment_id,
            AdminManualBillingPaymentVerifyRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.VerifyManualPaymentAsAdminAsync(payment_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingOrSecurity)
        .WithName("AdminVerifyManualBillingPayment")
        .WithOpenApi();

        admin.MapPost("/billing/payments/{payment_id:guid}/reject", [Authorize(Policy = SmartPosPolicies.BillingOrSecurity)] async (
            Guid payment_id,
            AdminManualBillingPaymentRejectRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.RejectManualPaymentAsAdminAsync(payment_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingOrSecurity)
        .WithName("AdminRejectManualBillingPayment")
        .WithOpenApi();

        admin.MapGet("/billing/reconciliation/daily", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            string? date,
            string? currency,
            decimal? expected_total,
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetDailyManualBankReconciliationAsync(
                    date,
                    currency,
                    expected_total,
                    take ?? 50,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrBilling)
        .WithName("AdminGetDailyManualBillingReconciliation")
        .WithOpenApi();

        admin.MapPost("/billing/reconciliation/run", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            AdminBillingStateReconciliationRunRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.RunBillingStateReconciliationAsAdminAsync(
                    request,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrBilling)
        .WithName("AdminRunBillingStateReconciliation")
        .WithOpenApi();

        admin.MapPost("/devices/{device_code}/revoke", [Authorize(Policy = SmartPosPolicies.SuperAdmin)] async (
            string device_code,
            AdminDeviceActionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.RevokeDeviceAsAdminAsync(device_code, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminRevokeDevice")
        .WithOpenApi();

        admin.MapPost("/devices/{device_code}/deactivate", [Authorize(Policy = SmartPosPolicies.SuperAdmin)] async (
            string device_code,
            AdminDeviceActionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.DeactivateDeviceAsAdminAsync(device_code, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminDeactivateDevice")
        .WithOpenApi();

        admin.MapPost("/devices/{device_code}/reactivate", [Authorize(Policy = SmartPosPolicies.SuperAdmin)] async (
            string device_code,
            AdminDeviceActionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ReactivateDeviceAsAdminAsync(device_code, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminReactivateDevice")
        .WithOpenApi();

        admin.MapPost("/devices/{device_code}/activate", [Authorize(Policy = SmartPosPolicies.SuperAdmin)] async (
            string device_code,
            AdminDeviceActionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ActivateDeviceAsAdminAsync(device_code, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminActivateDevice")
        .WithOpenApi();

        admin.MapPost("/devices/{device_code}/transfer-seat", [Authorize(Policy = SmartPosPolicies.SuperAdmin)] async (
            string device_code,
            AdminDeviceSeatTransferRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.TransferDeviceSeatAsAdminAsync(device_code, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminTransferDeviceSeat")
        .WithOpenApi();

        admin.MapPost("/devices/mass-revoke", [Authorize(Policy = SmartPosPolicies.SuperAdmin)] async (
            AdminMassDeviceRevokeRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.MassRevokeDevicesAsAdminAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminMassRevokeDevices")
        .WithOpenApi();

        admin.MapPost("/devices/{device_code}/emergency/envelope", [Authorize(Policy = SmartPosPolicies.SupportOrSecurity)] async (
            string device_code,
            AdminEmergencyCommandEnvelopeRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateEmergencyCommandEnvelopeAsAdminAsync(
                    device_code,
                    request,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminCreateEmergencyCommandEnvelope")
        .WithOpenApi();

        admin.MapPost("/devices/{device_code}/emergency/execute", [Authorize(Policy = SmartPosPolicies.SupportOrSecurity)] async (
            string device_code,
            AdminEmergencyCommandExecuteRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ExecuteEmergencyCommandAsAdminAsync(
                    device_code,
                    request,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminExecuteEmergencyCommand")
        .WithOpenApi();

        admin.MapPost("/devices/{device_code}/extend-grace", [Authorize(Policy = SmartPosPolicies.SuperAdmin)] async (
            string device_code,
            AdminDeviceGraceExtensionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ExtendGraceAsAdminAsync(device_code, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminExtendDeviceGrace")
        .WithOpenApi();

        admin.MapPost("/resync", [Authorize(Policy = SmartPosPolicies.SuperAdmin)] async (
            AdminLicenseResyncRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ForceLicenseResyncAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminForceLicenseResync")
        .WithOpenApi();

        return app;
    }

    private static IResult ToErrorResult(LicenseException exception)
    {
        return Results.Json(new LicenseErrorPayload
        {
            Error = new LicenseErrorItem
            {
                Code = exception.Code,
                Message = exception.Message
            }
        }, statusCode: exception.StatusCode);
    }

    private static void SyncLicenseTokenCookie(
        HttpContext httpContext,
        LicenseService licenseService,
        LicenseStatusResponse response)
    {
        licenseService.WriteLicenseTokenCookie(httpContext, response.LicenseToken, response.ValidUntil);
    }

    private static void ValidateIdempotencyKey(HttpContext httpContext)
    {
        var headerValue = httpContext.Request.Headers["Idempotency-Key"].FirstOrDefault()?.Trim();
        if (string.IsNullOrWhiteSpace(headerValue))
        {
            throw new LicenseException(
                "IDEMPOTENCY_KEY_REQUIRED",
                "Header 'Idempotency-Key' is required for mutation requests.",
                StatusCodes.Status400BadRequest);
        }

        if (headerValue.Length > 128)
        {
            throw new LicenseException(
                "IDEMPOTENCY_KEY_INVALID",
                "Header 'Idempotency-Key' must be 128 characters or less.",
                StatusCodes.Status400BadRequest);
        }
    }
}
