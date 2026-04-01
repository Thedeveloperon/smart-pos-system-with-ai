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
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
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
                var token = licenseService.ResolveLicenseToken(httpContext);
                var response = await licenseService.GetStatusAsync(deviceCode, token, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                alertMonitor.RecordLicenseValidationFailure(ex.Code);
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
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                licensingMetrics.RecordHeartbeatFailure(ex.Code);
                alertMonitor.RecordLicenseValidationFailure(ex.Code);
                return ToErrorResult(ex);
            }
        })
        .AllowAnonymous()
        .WithName("LicenseHeartbeat")
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
                return ToErrorResult(ex);
            }
            catch (Exception ex)
            {
                alertMonitor.RecordWebhookFailure(request?.EventType, ex.GetType().Name);
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
