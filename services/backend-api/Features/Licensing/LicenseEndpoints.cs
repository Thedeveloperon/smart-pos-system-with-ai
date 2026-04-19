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
            LicenseCloudRelayService cloudRelayService,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.TerminalId) &&
                                 string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : licenseService.ResolveDeviceCode(request.TerminalId ?? request.DeviceCode, httpContext);
            request.TerminalId = request.DeviceCode;

            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = cloudRelayService.IsEnabled
                    ? await cloudRelayService.CreateActivationChallengeAsync(request, httpContext, cancellationToken)
                    : await licenseService.CreateActivationChallengeAsync(request, cancellationToken);
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
            LicenseCloudRelayService cloudRelayService,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.TerminalId) &&
                                 string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : licenseService.ResolveDeviceCode(request.TerminalId ?? request.DeviceCode, httpContext);
            request.TerminalId = request.DeviceCode;

            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = cloudRelayService.IsEnabled
                    ? await cloudRelayService.ActivateAsync(request, httpContext, cancellationToken)
                    : await licenseService.ActivateAsync(request, cancellationToken);
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
            request.DeviceCode = string.IsNullOrWhiteSpace(request.TerminalId) &&
                                 string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : licenseService.ResolveDeviceCode(request.TerminalId ?? request.DeviceCode, httpContext);
            request.TerminalId = request.DeviceCode;

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
            string? terminal_id,
            string? device_code,
            HttpContext httpContext,
            LicenseService licenseService,
            LicenseCloudRelayService cloudRelayService,
            ILicensingAlertMonitor alertMonitor,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var resolvedTerminalId = terminal_id ?? device_code;
                var deviceCode = licenseService.ResolveDeviceCode(resolvedTerminalId, httpContext);
                var token = string.IsNullOrWhiteSpace(resolvedTerminalId)
                    ? licenseService.ResolveLicenseToken(httpContext)
                    : licenseService.ResolveLicenseToken(httpContext, includeCookie: false);
                var response = cloudRelayService.IsEnabled
                    ? await cloudRelayService.GetStatusAsync(deviceCode, token, httpContext, cancellationToken)
                    : await licenseService.GetStatusAsync(deviceCode, token, cancellationToken);
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
            LicenseCloudRelayService cloudRelayService,
            LicensingMetrics licensingMetrics,
            ILicensingAlertMonitor alertMonitor,
            CancellationToken cancellationToken) =>
        {
            request.DeviceCode = string.IsNullOrWhiteSpace(request.TerminalId) &&
                                 string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : licenseService.ResolveDeviceCode(request.TerminalId ?? request.DeviceCode, httpContext);
            request.TerminalId = request.DeviceCode;

            if (string.IsNullOrWhiteSpace(request.LicenseToken))
            {
                request.LicenseToken = licenseService.ResolveLicenseToken(httpContext);
            }

            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = cloudRelayService.IsEnabled
                    ? await cloudRelayService.HeartbeatAsync(request, httpContext, cancellationToken)
                    : await licenseService.HeartbeatAsync(request, cancellationToken);
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

        license.MapGet("/account/ai-credit-invoices", [Authorize(Roles = SmartPosRoles.Owner)] async (
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetOwnerAiCreditInvoicesAsync(
                    take ?? 40,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization()
        .WithName("GetOwnerAiCreditInvoices")
        .WithOpenApi();

        license.MapPost("/account/ai-credit-invoices", [Authorize(Roles = SmartPosRoles.Owner)] async (
            OwnerAiCreditInvoiceCreateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateOwnerAiCreditInvoiceAsync(request, 0m, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization()
        .WithName("CreateOwnerAiCreditInvoice")
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

        publicBilling.MapPost("/payment-proof-upload", (HttpContext httpContext) =>
        {
            ValidateIdempotencyKey(httpContext);
            return Results.Json(
                new
                {
                    error = new
                    {
                        code = "PAYMENT_PROOF_UPLOAD_DISABLED",
                        message = "Payment slip uploads are disabled. Submit manual payments with reference number only."
                    }
                },
                statusCode: StatusCodes.Status410Gone);
        })
        .AllowAnonymous()
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

        var cloudRegistration = app.MapGroup("/api/cloud")
            .WithTags("Cloud Registration");

        cloudRegistration.MapPost("/register", async (
            CloudRegisterRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateCloudRegistrationAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("CreateCloudRegistration")
        .WithOpenApi();

        cloudRegistration.MapGet("/register/{request_id:guid}", async (
            Guid request_id,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetCloudRegistrationStatusAsync(request_id, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("GetCloudRegistrationStatus")
        .WithOpenApi();

        var accountProducts = app.MapGroup("/api/account/products")
            .WithTags("Cloud Account Products")
            .RequireAuthorization();

        accountProducts.MapGet("", [Authorize(Roles = SmartPosRoles.Owner)] (
            string? search,
            int? take,
            LicenseService licenseService) =>
        {
            var response = licenseService.GetCloudProducts(search, includeInactive: false, take ?? 100);
            return Results.Ok(response);
        })
        .RequireAuthorization()
        .WithName("GetOwnerCloudProducts")
        .WithOpenApi();

        var accountPurchases = app.MapGroup("/api/account/purchases")
            .WithTags("Cloud Account Purchases")
            .RequireAuthorization();

        accountPurchases.MapGet("", [Authorize(Roles = SmartPosRoles.Owner)] async (
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetOwnerPurchasesAsync(take ?? 50, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization()
        .WithName("GetOwnerCloudPurchases")
        .WithOpenApi();

        accountPurchases.MapPost("", [Authorize(Roles = SmartPosRoles.Owner)] async (
            CloudPurchaseCreateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateOwnerPurchaseAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization()
        .WithName("CreateOwnerCloudPurchase")
        .WithOpenApi();

        accountPurchases.MapGet("/{purchase_id:guid}", [Authorize(Roles = SmartPosRoles.Owner)] async (
            Guid purchase_id,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetOwnerPurchaseByIdAsync(purchase_id, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization()
        .WithName("GetOwnerCloudPurchaseById")
        .WithOpenApi();

        var cloudAdmin = app.MapGroup("/api/admin/cloud")
            .WithTags("Cloud Commerce Admin")
            .RequireAuthorization(SmartPosPolicies.SuperAdmin);

        cloudAdmin.MapGet("/products", async (
            string? search,
            bool? include_inactive,
            int? take,
            LicenseService licenseService) =>
        {
            var response = licenseService.GetCloudProducts(search, include_inactive ?? false, take ?? 200);
            return Results.Ok(response);
        })
        .WithName("AdminCloudGetProducts")
        .WithOpenApi();

        cloudAdmin.MapPost("/products", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            CloudProductUpsertRequest request,
            HttpContext httpContext,
            LicenseService licenseService) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = licenseService.CreateCloudProduct(request);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminCloudCreateProduct")
        .WithOpenApi();

        cloudAdmin.MapPut("/products/{product_code}", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            string product_code,
            CloudProductUpsertRequest request,
            HttpContext httpContext,
            LicenseService licenseService) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = licenseService.UpdateCloudProduct(product_code, request);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminCloudUpdateProduct")
        .WithOpenApi();

        cloudAdmin.MapPost("/products/{product_code}/deactivate", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            string product_code,
            CloudProductDeactivateRequest request,
            HttpContext httpContext,
            LicenseService licenseService) =>
        {
            _ = request;
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = licenseService.DeactivateCloudProduct(product_code);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminCloudDeactivateProduct")
        .WithOpenApi();

        cloudAdmin.MapGet("/purchases", [Authorize(Policy = SmartPosPolicies.BillingApprover)] async (
            string? status,
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetAdminCloudPurchasesAsync(status, take ?? 120, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingApprover)
        .WithName("AdminCloudGetPurchases")
        .WithOpenApi();

        cloudAdmin.MapPost("/purchases/{purchase_id:guid}/approve", [Authorize(Policy = SmartPosPolicies.BillingApprover)] async (
            Guid purchase_id,
            CloudPurchaseActionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ApproveCloudPurchaseAsync(purchase_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingApprover)
        .WithName("AdminCloudApprovePurchase")
        .WithOpenApi();

        cloudAdmin.MapPost("/purchases/{purchase_id:guid}/reject", [Authorize(Policy = SmartPosPolicies.BillingApprover)] async (
            Guid purchase_id,
            CloudPurchaseActionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.RejectCloudPurchaseAsync(purchase_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingApprover)
        .WithName("AdminCloudRejectPurchase")
        .WithOpenApi();

        cloudAdmin.MapPost("/purchases/{purchase_id:guid}/assign", [Authorize(Policy = SmartPosPolicies.BillingApprover)] async (
            Guid purchase_id,
            CloudPurchaseActionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.AssignCloudPurchaseAsync(purchase_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingApprover)
        .WithName("AdminCloudAssignPurchase")
        .WithOpenApi();

        cloudAdmin.MapPost("/assignments/{assignment_id:guid}/revoke", [Authorize(Policy = SmartPosPolicies.BillingApprover)] async (
            Guid assignment_id,
            CloudAssignmentRevokeRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.RevokeCloudAssignmentAsync(assignment_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingApprover)
        .WithName("AdminCloudRevokeAssignment")
        .WithOpenApi();

        var admin = app.MapGroup("/api/admin/licensing")
            .WithTags("Licensing Admin")
            .RequireAuthorization(SmartPosPolicies.SuperAdmin);

        admin.MapGet("/shops", async (
            string? search,
            bool? include_inactive,
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            var response = await licenseService.GetAdminShopsSnapshotAsync(
                search,
                include_inactive ?? false,
                take ?? 100,
                cancellationToken);
            return Results.Ok(response);
        })
        .WithName("AdminGetLicensingShops")
        .WithOpenApi();

        admin.MapPost("/shops", [Authorize(Policy = SmartPosPolicies.SupportOrSecurity)] async (
            AdminShopCreateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateAdminShopAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrSecurity)
        .WithName("AdminCreateShop")
        .WithOpenApi();

        admin.MapPut("/shops/{shop_id:guid}", [Authorize(Policy = SmartPosPolicies.SupportOrSecurity)] async (
            Guid shop_id,
            AdminShopUpdateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.UpdateAdminShopAsync(shop_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrSecurity)
        .WithName("AdminUpdateShop")
        .WithOpenApi();

        admin.MapDelete("/shops/{shop_id:guid}", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            Guid shop_id,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var request = await httpContext.Request.ReadFromJsonAsync<AdminShopDeactivateRequest>(cancellationToken)
                    ?? new AdminShopDeactivateRequest();
                var response = await licenseService.DeactivateAdminShopAsync(shop_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrBilling)
        .WithName("AdminDeactivateShop")
        .WithOpenApi();

        admin.MapPost("/shops/{shop_id:guid}/reactivate", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            Guid shop_id,
            AdminShopReactivateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ReactivateAdminShopAsync(shop_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrBilling)
        .WithName("AdminReactivateShop")
        .WithOpenApi();

        admin.MapDelete("/shops/{shop_id:guid}/hard-delete", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            Guid shop_id,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var request = await httpContext.Request.ReadFromJsonAsync<AdminShopDeleteRequest>(cancellationToken)
                    ?? new AdminShopDeleteRequest();
                var response = await licenseService.DeleteAdminShopAsync(shop_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrBilling)
        .WithName("AdminDeleteShop")
        .WithOpenApi();

        admin.MapGet("/users", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            string? shop_code,
            string? search,
            string? role_code,
            bool? include_inactive,
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetAdminShopUsersAsync(
                    shop_code,
                    search,
                    role_code,
                    include_inactive ?? false,
                    take ?? 50,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminGetShopUsers")
        .WithOpenApi();

        admin.MapPost("/users", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            AdminShopUserCreateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CreateAdminShopUserAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminCreateShopUser")
        .WithOpenApi();

        admin.MapPut("/users/{user_id:guid}", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            Guid user_id,
            AdminShopUserUpdateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.UpdateAdminShopUserAsync(user_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminUpdateShopUser")
        .WithOpenApi();

        admin.MapDelete("/users/{user_id:guid}", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            Guid user_id,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var request = await httpContext.Request.ReadFromJsonAsync<AdminShopUserDeactivateRequest>(cancellationToken)
                    ?? new AdminShopUserDeactivateRequest();
                var response = await licenseService.DeactivateAdminShopUserAsync(user_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminDeactivateShopUser")
        .WithOpenApi();

        admin.MapPost("/users/{user_id:guid}/reactivate", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            Guid user_id,
            AdminShopUserReactivateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ReactivateAdminShopUserAsync(user_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminReactivateShopUser")
        .WithOpenApi();

        admin.MapDelete("/users/{user_id:guid}/hard-delete", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            Guid user_id,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var request = await httpContext.Request.ReadFromJsonAsync<AdminShopUserDeleteRequest>(cancellationToken)
                    ?? new AdminShopUserDeleteRequest();
                var response = await licenseService.DeleteAdminShopUserAsync(user_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminDeleteShopUser")
        .WithOpenApi();

        admin.MapPost("/users/{user_id:guid}/reset-password", [Authorize(Policy = SmartPosPolicies.SuperAdminOperator)] async (
            Guid user_id,
            AdminShopUserPasswordResetRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ResetAdminShopUserPasswordAsync(user_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SuperAdminOperator)
        .WithName("AdminResetShopUserPassword")
        .WithOpenApi();

        admin.MapGet("/shops/{shop_code}/branch-allocations", async (
            string shop_code,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetBranchSeatAllocationsAsAdminAsync(shop_code, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminGetShopBranchSeatAllocations")
        .WithOpenApi();

        admin.MapPut("/shops/{shop_code}/branch-allocations/{branch_code}", async (
            string shop_code,
            string branch_code,
            AdminBranchSeatAllocationUpsertRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.UpsertBranchSeatAllocationAsAdminAsync(
                    shop_code,
                    branch_code,
                    request,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminUpsertShopBranchSeatAllocation")
        .WithOpenApi();

        admin.MapPost("/migration/ai-wallets/dry-run", async (
            AiWalletMigrationDryRunRequest request,
            LicensingMigrationDryRunService migrationDryRunService,
            CancellationToken cancellationToken) =>
        {
            var response = await migrationDryRunService.RunAiWalletDryRunAsync(request, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("AdminRunAiWalletMigrationDryRun")
        .WithOpenApi();

        admin.MapPost("/migration/owner-mapping/remediate", async (
            AiOwnerMappingRemediationRequest request,
            HttpContext httpContext,
            LicensingMigrationDryRunService migrationDryRunService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await migrationDryRunService.RemediateOwnerMappingAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("AdminRemediateOwnerMapping")
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

        admin.MapGet("/ai-credit-invoices", [Authorize(Policy = SmartPosPolicies.BillingApprover)] async (
            int? take,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await licenseService.GetAdminPendingAiCreditInvoicesAsync(
                    take ?? 80,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingApprover)
        .WithName("AdminGetPendingAiCreditInvoices")
        .WithOpenApi();

        admin.MapPost("/ai-credit-invoices/{invoice_id:guid}/approve", [Authorize(Policy = SmartPosPolicies.BillingApprover)] async (
            Guid invoice_id,
            AdminAiCreditInvoiceApproveRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ApproveOwnerAiCreditInvoiceAsync(
                    invoice_id,
                    request,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingApprover)
        .WithName("AdminApproveOwnerAiCreditInvoice")
        .WithOpenApi();

        admin.MapPost("/ai-credit-invoices/{invoice_id:guid}/reject", [Authorize(Policy = SmartPosPolicies.BillingApprover)] async (
            Guid invoice_id,
            AdminAiCreditInvoiceRejectRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.RejectOwnerAiCreditInvoiceAsync(
                    invoice_id,
                    request,
                    cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingApprover)
        .WithName("AdminRejectOwnerAiCreditInvoice")
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

        admin.MapPost("/offline/activation-entitlements/batch-generate", [Authorize(Policy = SmartPosPolicies.SupportOrSecurity)] async (
            AdminOfflineActivationEntitlementBatchGenerateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.GenerateOfflineActivationEntitlementsBatchAsAdminAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.SupportOrSecurity)
        .WithName("AdminGenerateOfflineActivationEntitlementBatch")
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

        admin.MapPost("/billing/payments/{payment_id:guid}/license-code/generate", [Authorize(Policy = SmartPosPolicies.BillingOrSecurity)] async (
            Guid payment_id,
            AdminManualBillingPaymentLicenseCodeGenerateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.GenerateManualPaymentLicenseCodeAsAdminAsync(payment_id, request, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .RequireAuthorization(SmartPosPolicies.BillingOrSecurity)
        .WithName("AdminGenerateManualBillingPaymentLicenseCode")
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

        admin.MapPost("/shops/{shop_code}/ai-wallet/correct", [Authorize(Policy = SmartPosPolicies.SupportOrBilling)] async (
            string shop_code,
            AdminAiWalletCorrectionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.CorrectAiWalletBalanceAsAdminAsync(
                    shop_code,
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
        .WithName("AdminCorrectAiWalletBalance")
        .WithOpenApi();

        admin.MapPost("/devices/{device_code}/fraud-lock", [Authorize(Policy = SmartPosPolicies.SupportOrSecurity)] async (
            string device_code,
            AdminDeviceFraudLockRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await licenseService.ApplyFraudLockToDeviceAsAdminAsync(
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
        .RequireAuthorization(SmartPosPolicies.SupportOrSecurity)
        .WithName("AdminApplyDeviceFraudLock")
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
