using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Features.AiChat;
using SmartPos.Backend.Features.Licensing;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Ai;

public static class CloudAiRelayEndpoints
{
    public static IEndpointRouteBuilder MapCloudAiRelayEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/cloud/v1/ai")
            .WithTags("Cloud v1 AI");

        group.MapGet("/wallet", async (
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiCreditBillingService creditBillingService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var wallet = await creditBillingService.GetWalletAsync(context.ActorUserId, cancellationToken);
                return Results.Ok(wallet);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayGetWallet")
        .WithOpenApi();

        group.MapGet("/credit-packs", (
            AiCreditPaymentService paymentService) =>
        {
            var packs = paymentService.GetCreditPacks();
            return Results.Ok(packs);
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayGetCreditPacks")
        .WithOpenApi();

        group.MapPost("/insights", async (
            AiInsightRequestPayload request,
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiInsightService aiInsightService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var result = await aiInsightService.GenerateInsightAsync(
                    context.ActorUserId,
                    request.Prompt,
                    ResolveIdempotencyKey(request, httpContext),
                    request.UsageType,
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayGenerateInsight")
        .WithOpenApi();

        group.MapPost("/insights/estimate", async (
            AiInsightEstimateRequestPayload request,
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiInsightService aiInsightService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var result = await aiInsightService.EstimateInsightAsync(
                    context.ActorUserId,
                    request.Prompt,
                    request.UsageType,
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayEstimateInsight")
        .WithOpenApi();

        group.MapGet("/insights/history", async (
            int? take,
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiInsightService aiInsightService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var result = await aiInsightService.GetHistoryAsync(
                    context.ActorUserId,
                    take.GetValueOrDefault(20),
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayGetInsightHistory")
        .WithOpenApi();

        group.MapPost("/chat/sessions", async (
            AiChatCreateSessionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiChatService chatService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var result = await chatService.CreateSessionAsync(
                    context.ActorUserId,
                    request,
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayCreateChatSession")
        .WithOpenApi();

        group.MapPost("/chat/sessions/{id:guid}/messages", async (
            Guid id,
            AiChatMessageCreateRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiChatService chatService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var result = await chatService.PostMessageAsync(
                    context.ActorUserId,
                    id,
                    request,
                    ResolveOptionalHeaderIdempotencyKey(httpContext),
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayPostChatMessage")
        .WithOpenApi();

        group.MapGet("/chat/sessions/{id:guid}", async (
            Guid id,
            int? take,
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiChatService chatService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var result = await chatService.GetSessionAsync(
                    context.ActorUserId,
                    id,
                    take.GetValueOrDefault(50),
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayGetChatSession")
        .WithOpenApi();

        group.MapGet("/chat/history", async (
            int? take,
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiChatService chatService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var result = await chatService.GetHistoryAsync(
                    context.ActorUserId,
                    take.GetValueOrDefault(20),
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayGetChatHistory")
        .WithOpenApi();

        group.MapPost("/payments/checkout", async (
            AiCheckoutSessionRequest request,
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiCreditPaymentService paymentService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var result = await paymentService.CreateCheckoutSessionAsync(
                    context.ActorUserId,
                    request.PackCode,
                    ResolveCheckoutIdempotencyKey(request, httpContext),
                    request.PaymentMethod,
                    request.BankReference,
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayCreateCheckoutSession")
        .WithOpenApi();

        group.MapGet("/payments", async (
            int? take,
            HttpContext httpContext,
            LicenseService licenseService,
            SmartPosDbContext dbContext,
            AiCreditPaymentService paymentService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var context = await ResolveRelayContextAsync(httpContext, licenseService, dbContext, cancellationToken);
                var result = await paymentService.GetPaymentHistoryAsync(
                    context.ActorUserId,
                    take.GetValueOrDefault(20),
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (LicenseException exception)
            {
                return ToErrorResult(exception);
            }
            catch (InvalidOperationException exception)
            {
                return ToValidationErrorResult(exception);
            }
        })
        .AllowAnonymous()
        .WithName("CloudAiRelayGetPaymentHistory")
        .WithOpenApi();

        return app;
    }

    private static async Task<CloudAiRelayRequestContext> ResolveRelayContextAsync(
        HttpContext httpContext,
        LicenseService licenseService,
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
        var licenseToken = licenseService.ResolveLicenseToken(httpContext, includeCookie: false);
        var authenticatedUserId = ResolveAuthenticatedUserId(httpContext.User);
        if (authenticatedUserId.HasValue)
        {
            var authenticatedContext = await ResolveAuthenticatedRelayContextAsync(
                dbContext,
                authenticatedUserId.Value,
                cancellationToken);
            if (authenticatedContext is not null)
            {
                if (string.IsNullOrWhiteSpace(licenseToken))
                {
                    return authenticatedContext.Value;
                }

                var authenticatedLicenseContext = await ValidateRelayLicenseTokenAsync(
                    licenseService,
                    licenseToken,
                    cancellationToken);
                if (authenticatedLicenseContext.ShopId != authenticatedContext.Value.ShopId)
                {
                    throw new LicenseException(
                        AiRelayErrorCodes.CloudRelayContextResolutionFailed,
                        "Linked cloud account does not match the provisioned shop for this device. Re-link the cloud account and try again.",
                        StatusCodes.Status403Forbidden);
                }

                return authenticatedContext.Value with { DeviceCode = authenticatedLicenseContext.DeviceCode };
            }
        }

        if (HasCloudAuthCredential(httpContext.Request))
        {
            throw new LicenseException(
                AiRelayErrorCodes.CloudRelayContextResolutionFailed,
                "Linked cloud account session is invalid or expired. Re-link the cloud account and try again.",
                StatusCodes.Status401Unauthorized);
        }

        if (string.IsNullOrWhiteSpace(licenseToken))
        {
            throw new LicenseException(
                AiRelayErrorCodes.CloudRelayContextResolutionFailed,
                "Cloud AI relay requires either authenticated cloud credentials or X-License-Token.",
                StatusCodes.Status401Unauthorized);
        }

        var tokenContext = await ValidateRelayLicenseTokenAsync(
            licenseService,
            licenseToken,
            cancellationToken);

        var actorUserId = await ResolveRelayActorUserIdAsync(dbContext, tokenContext.ShopId, cancellationToken);
        return new CloudAiRelayRequestContext(tokenContext.ShopId, tokenContext.DeviceCode, actorUserId);
    }

    private static async Task<LicenseService.ValidatedLicenseTokenContext> ValidateRelayLicenseTokenAsync(
        LicenseService licenseService,
        string licenseToken,
        CancellationToken cancellationToken)
    {
        var tokenContext = await licenseService.ValidateLicenseTokenAsync(licenseToken, cancellationToken);
        var status = await licenseService.GetStatusAsync(tokenContext.DeviceCode, licenseToken, cancellationToken);
        var state = (status.State ?? string.Empty).Trim().ToLowerInvariant();

        if (state == LicenseState.Unprovisioned.ToString().ToLowerInvariant())
        {
            throw new LicenseException(
                LicenseErrorCodes.Unprovisioned,
                "Device is not provisioned.",
                StatusCodes.Status403Forbidden);
        }

        if (state == LicenseState.Revoked.ToString().ToLowerInvariant())
        {
            throw new LicenseException(
                LicenseErrorCodes.Revoked,
                "License is revoked.",
                StatusCodes.Status403Forbidden);
        }

        if (state == LicenseState.Suspended.ToString().ToLowerInvariant())
        {
            throw new LicenseException(
                LicenseErrorCodes.LicenseExpired,
                "License is suspended for AI operations.",
                StatusCodes.Status403Forbidden);
        }

        return tokenContext;
    }

    private static async Task<CloudAiRelayRequestContext?> ResolveAuthenticatedRelayContextAsync(
        SmartPosDbContext dbContext,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var user = await dbContext.Users
            .AsNoTracking()
            .Include(x => x.UserRoles)
            .ThenInclude(x => x.Role)
            .FirstOrDefaultAsync(x => x.Id == userId && x.IsActive, cancellationToken);
        if (user is null)
        {
            throw new LicenseException(
                AiRelayErrorCodes.CloudRelayContextResolutionFailed,
                "Authenticated cloud user is not available for AI relay.",
                StatusCodes.Status401Unauthorized);
        }

        if (!user.StoreId.HasValue || user.StoreId == Guid.Empty)
        {
            throw new LicenseException(
                AiRelayErrorCodes.CloudRelayContextResolutionFailed,
                "Authenticated cloud user is not mapped to a shop.",
                StatusCodes.Status403Forbidden);
        }

        if (!CanUseCloudAiRelay(user))
        {
            throw new LicenseException(
                AiRelayErrorCodes.CloudRelayContextResolutionFailed,
                "Authenticated cloud user role is not allowed for AI relay.",
                StatusCodes.Status403Forbidden);
        }

        return new CloudAiRelayRequestContext(
            user.StoreId.Value,
            DeviceCode: string.Empty,
            ActorUserId: user.Id);
    }

    private static async Task<Guid> ResolveRelayActorUserIdAsync(
        SmartPosDbContext dbContext,
        Guid shopId,
        CancellationToken cancellationToken)
    {
        var users = await dbContext.Users
            .AsNoTracking()
            .Include(x => x.UserRoles)
            .ThenInclude(x => x.Role)
            .Where(x => x.StoreId == shopId && x.IsActive)
            .ToListAsync(cancellationToken);

        if (users.Count == 0)
        {
            throw new InvalidOperationException(
                "No active user is mapped to this shop in cloud AI relay.");
        }

        var prioritizedUser = users
            .Select(user => new
            {
                UserId = user.Id,
                user.CreatedAtUtc,
                Priority = ResolveRolePriority(user)
            })
            .OrderBy(candidate => candidate.Priority)
            .ThenBy(candidate => candidate.CreatedAtUtc)
            .ThenBy(candidate => candidate.UserId)
            .First();

        return prioritizedUser.UserId;
    }

    private static int ResolveRolePriority(AppUser user)
    {
        var roleCodes = user.UserRoles
            .Select(x => x.Role.Code)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().ToLowerInvariant())
            .ToHashSet(StringComparer.Ordinal);

        if (roleCodes.Contains(SmartPosRoles.Owner))
        {
            return 0;
        }

        if (roleCodes.Contains(SmartPosRoles.Manager))
        {
            return 1;
        }

        if (roleCodes.Contains(SmartPosRoles.Cashier))
        {
            return 2;
        }

        return 50;
    }

    private static Guid? ResolveAuthenticatedUserId(ClaimsPrincipal principal)
    {
        if (principal?.Identity?.IsAuthenticated != true)
        {
            return null;
        }

        var userId = principal.FindFirstValue(ClaimTypes.NameIdentifier) ??
                     principal.FindFirstValue("sub");
        return Guid.TryParse(userId, out var parsed) ? parsed : null;
    }

    private static bool HasCloudAuthCredential(HttpRequest request)
    {
        if (request.Headers.Authorization.Count > 0)
        {
            return true;
        }

        return request.Cookies.ContainsKey("smartpos_auth");
    }

    private static bool CanUseCloudAiRelay(AppUser user)
    {
        var roleCodes = user.UserRoles
            .Select(x => x.Role.Code)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim().ToLowerInvariant())
            .ToHashSet(StringComparer.Ordinal);

        return roleCodes.Contains(SmartPosRoles.Owner) ||
               roleCodes.Contains(SmartPosRoles.Manager) ||
               roleCodes.Contains(SmartPosRoles.SuperAdmin) ||
               roleCodes.Contains(SmartPosRoles.BillingAdmin) ||
               roleCodes.Contains(SmartPosRoles.Support);
    }

    private static string ResolveIdempotencyKey(AiInsightRequestPayload request, HttpContext httpContext)
    {
        var bodyKey = request.IdempotencyKey?.Trim();
        if (!string.IsNullOrWhiteSpace(bodyKey))
        {
            return bodyKey;
        }

        if (httpContext.Request.Headers.TryGetValue("Idempotency-Key", out var headerValue))
        {
            var headerKey = headerValue.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(headerKey))
            {
                return headerKey;
            }
        }

        throw new InvalidOperationException("Idempotency key is required.");
    }

    private static string ResolveCheckoutIdempotencyKey(AiCheckoutSessionRequest request, HttpContext httpContext)
    {
        var bodyKey = request.IdempotencyKey?.Trim();
        if (!string.IsNullOrWhiteSpace(bodyKey))
        {
            return bodyKey;
        }

        if (httpContext.Request.Headers.TryGetValue("Idempotency-Key", out var headerValue))
        {
            var headerKey = headerValue.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(headerKey))
            {
                return headerKey;
            }
        }

        throw new InvalidOperationException("Idempotency key is required.");
    }

    private static string? ResolveOptionalHeaderIdempotencyKey(HttpContext httpContext)
    {
        if (httpContext.Request.Headers.TryGetValue("Idempotency-Key", out var headerValue))
        {
            var headerKey = headerValue.ToString().Trim();
            if (!string.IsNullOrWhiteSpace(headerKey))
            {
                return headerKey;
            }
        }

        return null;
    }

    private static IResult ToErrorResult(LicenseException exception)
    {
        return Results.Json(new AiRelayErrorPayload
        {
            Error = new AiRelayErrorItem
            {
                Code = exception.Code,
                Message = exception.Message
            }
        }, statusCode: exception.StatusCode);
    }

    private static IResult ToValidationErrorResult(InvalidOperationException exception)
    {
        return Results.Json(new AiRelayErrorPayload
        {
            Error = new AiRelayErrorItem
            {
                Code = AiRelayErrorCodes.ValidationError,
                Message = exception.Message
            }
        }, statusCode: StatusCodes.Status400BadRequest);
    }

    private readonly record struct CloudAiRelayRequestContext(
        Guid ShopId,
        string DeviceCode,
        Guid ActorUserId);
}
