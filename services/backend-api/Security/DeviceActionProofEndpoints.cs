using Microsoft.AspNetCore.Authorization;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.Security;

public static class DeviceActionProofEndpoints
{
    public static IEndpointRouteBuilder MapDeviceActionProofEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/security")
            .WithTags("Security")
            .RequireAuthorization();

        group.MapPost("/challenge", [Authorize] async (
            DeviceActionChallengeRequest request,
            HttpContext httpContext,
            DeviceActionProofService deviceActionProofService,
            LicenseService licenseService,
            CancellationToken cancellationToken) =>
        {
            var deviceCode = string.IsNullOrWhiteSpace(request.DeviceCode)
                ? licenseService.ResolveDeviceCode(null, httpContext)
                : request.DeviceCode;

            if (string.IsNullOrWhiteSpace(deviceCode))
            {
                return ToErrorResult(new LicenseException(
                    LicenseErrorCodes.InvalidDeviceProof,
                    "device_code is required for security challenge."));
            }

            try
            {
                ValidateIdempotencyKey(httpContext);
                var response = await deviceActionProofService.CreateChallengeAsync(deviceCode, cancellationToken);
                return Results.Ok(response);
            }
            catch (LicenseException ex)
            {
                return ToErrorResult(ex);
            }
        })
        .WithName("CreateDeviceActionChallenge")
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
