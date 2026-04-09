using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Recovery;

public static class RecoveryEndpoints
{
    public static IEndpointRouteBuilder MapRecoveryEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/admin/recovery")
            .WithTags("Recovery Operations")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapGet("/status", async (
            RecoveryOpsService recoveryOpsService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var response = await recoveryOpsService.GetStatusAsync(cancellationToken);
                return Results.Ok(response);
            }
            catch (RecoveryException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("GetRecoveryStatus")
        .WithOpenApi();

        group.MapPost("/preflight/run", async (
            RecoveryRunPreflightRequest request,
            HttpContext httpContext,
            RecoveryOpsService recoveryOpsService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await recoveryOpsService.RunPreflightAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (RecoveryException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("RunRecoveryPreflight")
        .WithOpenApi();

        group.MapPost("/backup/run", async (
            RecoveryRunBackupRequest request,
            HttpContext httpContext,
            RecoveryOpsService recoveryOpsService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await recoveryOpsService.RunBackupAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (RecoveryException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("RunRecoveryBackup")
        .WithOpenApi();

        group.MapPost("/restore-smoke/run", async (
            RecoveryRunRestoreSmokeRequest request,
            HttpContext httpContext,
            RecoveryOpsService recoveryOpsService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await recoveryOpsService.RunRestoreSmokeAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (RecoveryException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("RunRecoveryRestoreSmoke")
        .WithOpenApi();

        return app;
    }

    private static IResult ToErrorResult(RecoveryException exception)
    {
        return Results.Json(new RecoveryErrorPayload
        {
            Error = new RecoveryErrorItem
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
            throw new RecoveryException(
                "IDEMPOTENCY_KEY_REQUIRED",
                "Header 'Idempotency-Key' is required for mutation requests.",
                StatusCodes.Status400BadRequest);
        }

        if (headerValue.Length > 128)
        {
            throw new RecoveryException(
                "IDEMPOTENCY_KEY_INVALID",
                "Header 'Idempotency-Key' must be 128 characters or less.",
                StatusCodes.Status400BadRequest);
        }
    }
}
