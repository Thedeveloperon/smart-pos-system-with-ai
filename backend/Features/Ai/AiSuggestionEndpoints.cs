using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Ai;

public static class AiSuggestionEndpoints
{
    public static IEndpointRouteBuilder MapAiSuggestionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/ai")
            .WithTags("AI")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapPost("/product-suggestions", async (
            ProductSuggestionRequest request,
            AiSuggestionService aiSuggestionService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await aiSuggestionService.GenerateProductSuggestionAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetProductSuggestion")
        .WithOpenApi();

        group.MapPost("/product-from-image", async (
            ProductFromImageRequest request,
            AiSuggestionService aiSuggestionService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await aiSuggestionService.GenerateProductFromImageAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetProductFromImage")
        .WithOpenApi();

        group.MapGet("/wallet", async (
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiCreditBillingService creditBillingService,
            CancellationToken cancellationToken) =>
        {
            var userId = ResolveUserId(user);
            if (!userId.HasValue)
            {
                return Results.Unauthorized();
            }

            if (!IsAiInsightsEnabledForUser(aiInsightOptions.Value, user))
            {
                return Results.Forbid();
            }

            var wallet = await creditBillingService.GetWalletAsync(userId.Value, cancellationToken);
            return Results.Ok(wallet);
        })
        .WithName("GetAiWallet")
        .WithOpenApi();

        group.MapPost("/insights", async (
            AiInsightRequestPayload request,
            HttpContext httpContext,
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiInsightService aiInsightService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var userId = ResolveUserId(user);
                if (!userId.HasValue)
                {
                    return Results.Unauthorized();
                }

                if (!IsAiInsightsEnabledForUser(aiInsightOptions.Value, user))
                {
                    return Results.Forbid();
                }

                var idempotencyKey = ResolveIdempotencyKey(request, httpContext);
                var result = await aiInsightService.GenerateInsightAsync(
                    userId.Value,
                    request.Prompt,
                    idempotencyKey,
                    request.UsageType,
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GenerateAiInsight")
        .WithOpenApi();

        group.MapGet("/credit-packs", (
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiCreditPaymentService paymentService) =>
        {
            if (!IsAiInsightsEnabledForUser(aiInsightOptions.Value, user))
            {
                return Results.Forbid();
            }

            var packs = paymentService.GetCreditPacks();
            return Results.Ok(packs);
        })
        .WithName("GetAiCreditPacks")
        .WithOpenApi();

        group.MapPost("/payments/checkout", async (
            AiCheckoutSessionRequest request,
            HttpContext httpContext,
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiCreditPaymentService paymentService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var userId = ResolveUserId(user);
                if (!userId.HasValue)
                {
                    return Results.Unauthorized();
                }

                if (!IsAiInsightsEnabledForUser(aiInsightOptions.Value, user))
                {
                    return Results.Forbid();
                }

                var idempotencyKey = ResolveCheckoutIdempotencyKey(request, httpContext);
                var result = await paymentService.CreateCheckoutSessionAsync(
                    userId.Value,
                    request.PackCode,
                    idempotencyKey,
                    request.PaymentMethod,
                    request.BankReference,
                    request.DepositSlipUrl,
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("CreateAiCheckoutSession")
        .WithOpenApi();

        group.MapGet("/payments", async (
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiCreditPaymentService paymentService,
            int? take,
            CancellationToken cancellationToken) =>
        {
            var userId = ResolveUserId(user);
            if (!userId.HasValue)
            {
                return Results.Unauthorized();
            }

            if (!IsAiInsightsEnabledForUser(aiInsightOptions.Value, user))
            {
                return Results.Forbid();
            }

            var result = await paymentService.GetPaymentHistoryAsync(
                userId.Value,
                take.GetValueOrDefault(20),
                cancellationToken);
            return Results.Ok(result);
        })
        .WithName("GetAiPaymentHistory")
        .WithOpenApi();

        group.MapGet("/payments/pending-manual", async (
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiCreditPaymentService paymentService,
            int? take,
            CancellationToken cancellationToken) =>
        {
            if (!IsAiInsightsEnabledForUser(aiInsightOptions.Value, user))
            {
                return Results.Forbid();
            }

            if (!CanManualWalletTopUp(user))
            {
                return Results.Forbid();
            }

            var result = await paymentService.GetPendingManualPaymentsAsync(
                take.GetValueOrDefault(40),
                cancellationToken);
            return Results.Ok(result);
        })
        .WithName("GetPendingAiManualPayments")
        .WithOpenApi();

        group.MapPost("/payments/verify", async (
            AiManualPaymentVerifyRequest request,
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiCreditPaymentService paymentService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                if (!IsAiInsightsEnabledForUser(aiInsightOptions.Value, user))
                {
                    return Results.Forbid();
                }

                if (!CanManualWalletTopUp(user))
                {
                    return Results.Forbid();
                }

                var result = await paymentService.VerifyManualPaymentAsync(
                    request.PaymentId,
                    request.ExternalReference,
                    cancellationToken);

                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("VerifyAiManualPayment")
        .WithOpenApi();

        group.MapPost("/insights/estimate", async (
            AiInsightEstimateRequestPayload request,
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiInsightService aiInsightService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var userId = ResolveUserId(user);
                if (!userId.HasValue)
                {
                    return Results.Unauthorized();
                }

                if (!IsAiInsightsEnabledForUser(aiInsightOptions.Value, user))
                {
                    return Results.Forbid();
                }

                var result = await aiInsightService.EstimateInsightAsync(
                    userId.Value,
                    request.Prompt,
                    request.UsageType,
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("EstimateAiInsight")
        .WithOpenApi();

        group.MapGet("/insights/history", async (
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiInsightService aiInsightService,
            int? take,
            CancellationToken cancellationToken) =>
        {
            var userId = ResolveUserId(user);
            if (!userId.HasValue)
            {
                return Results.Unauthorized();
            }

            if (!IsAiInsightsEnabledForUser(aiInsightOptions.Value, user))
            {
                return Results.Forbid();
            }

            var result = await aiInsightService.GetHistoryAsync(
                userId.Value,
                take.GetValueOrDefault(20),
                cancellationToken);
            return Results.Ok(result);
        })
        .WithName("GetAiInsightHistory")
        .WithOpenApi();

        group.MapPost("/wallet/top-up", async (
            AiWalletTopUpRequest request,
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiCreditBillingService creditBillingService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                if (!aiInsightOptions.Value.EnableManualWalletTopUp)
                {
                    return Results.NotFound();
                }

                if (!CanManualWalletTopUp(user))
                {
                    return Results.Forbid();
                }

                var actorUserId = ResolveUserId(user);
                if (!actorUserId.HasValue)
                {
                    return Results.Unauthorized();
                }

                var targetUserId = request.UserId ?? actorUserId.Value;
                if (targetUserId != actorUserId.Value && !CanTopUpForAnotherUser(user))
                {
                    return Results.Forbid();
                }

                var wallet = await creditBillingService.AddCreditsAsync(
                    targetUserId,
                    request.Credits,
                    request.PurchaseReference,
                    request.Description,
                    cancellationToken);

                return Results.Ok(new AiWalletTopUpResponse
                {
                    AvailableCredits = wallet.AvailableCredits,
                    AppliedCredits = decimal.Round(request.Credits, 2, MidpointRounding.AwayFromZero),
                    PurchaseReference = request.PurchaseReference.Trim(),
                    UpdatedAt = wallet.UpdatedAt
                });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("TopUpAiWallet")
        .WithOpenApi();

        group.MapPost("/wallet/adjust", async (
            AiWalletAdjustmentRequest request,
            ClaimsPrincipal user,
            AiCreditBillingService creditBillingService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                if (!CanAdjustWallet(user))
                {
                    return Results.Forbid();
                }

                var actorUserId = ResolveUserId(user);
                if (!actorUserId.HasValue)
                {
                    return Results.Unauthorized();
                }

                var targetUserId = request.UserId ?? actorUserId.Value;
                var adjusted = await creditBillingService.AdjustCreditsAsync(
                    targetUserId,
                    request.DeltaCredits,
                    request.Reference,
                    request.Reason,
                    cancellationToken);

                return Results.Ok(new AiWalletAdjustmentResponse
                {
                    AvailableCredits = adjusted.AvailableCredits,
                    AppliedDelta = adjusted.AppliedDelta,
                    Reference = adjusted.Reference,
                    UpdatedAt = adjusted.UpdatedAt
                });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("AdjustAiWallet")
        .WithOpenApi();

        app.MapPost("/api/ai/webhooks/payments", async (
            HttpContext httpContext,
            AiCreditPaymentService paymentService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                string rawBody;
                using (var reader = new StreamReader(httpContext.Request.Body, Encoding.UTF8))
                {
                    rawBody = await reader.ReadToEndAsync(cancellationToken);
                }

                if (string.IsNullOrWhiteSpace(rawBody))
                {
                    throw new InvalidOperationException("Webhook payload is empty.");
                }

                paymentService.VerifyWebhookSignature(rawBody, httpContext.Request.Headers);
                var request = JsonSerializer.Deserialize<AiPaymentWebhookRequest>(
                    rawBody,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                    ?? throw new InvalidOperationException("Webhook payload is invalid JSON.");

                var response = await paymentService.HandlePaymentWebhookAsync(request, cancellationToken);
                return Results.Ok(response);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
            catch (JsonException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .AllowAnonymous()
        .WithTags("AI")
        .WithName("HandleAiPaymentWebhook")
        .WithOpenApi();

        return app;
    }

    private static Guid? ResolveUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(value, out var userId) ? userId : null;
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

    private static bool CanTopUpForAnotherUser(ClaimsPrincipal user)
    {
        return CanManualWalletTopUp(user);
    }

    private static bool CanManualWalletTopUp(ClaimsPrincipal user)
    {
        var role = user.FindFirstValue(ClaimTypes.Role)?.Trim().ToLowerInvariant();
        if (role is SmartPosRoles.SuperAdmin or SmartPosRoles.BillingAdmin)
        {
            return true;
        }

        var scope = user.FindFirstValue("super_admin_scope")?.Trim().ToLowerInvariant();
        return scope == SmartPosRoles.SuperAdmin ||
               scope == SmartPosRoles.BillingAdmin;
    }

    private static bool CanAdjustWallet(ClaimsPrincipal user)
    {
        var role = user.FindFirstValue(ClaimTypes.Role)?.Trim().ToLowerInvariant();
        if (role is SmartPosRoles.SuperAdmin or SmartPosRoles.BillingAdmin or SmartPosRoles.SecurityAdmin)
        {
            return true;
        }

        var scope = user.FindFirstValue("super_admin_scope")?.Trim().ToLowerInvariant();
        return scope == SmartPosRoles.SuperAdmin ||
               scope == SmartPosRoles.BillingAdmin ||
               scope == SmartPosRoles.SecurityAdmin;
    }

    private static bool IsAiInsightsEnabledForUser(AiInsightOptions options, ClaimsPrincipal user)
    {
        if (!options.CanaryOnlyEnabled)
        {
            return true;
        }

        var allowList = options.CanaryAllowedUsers
            .Select(x => (x ?? string.Empty).Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.ToLowerInvariant())
            .ToHashSet(StringComparer.Ordinal);

        if (allowList.Count == 0)
        {
            return false;
        }

        var userName = user.FindFirstValue(ClaimTypes.Name);
        if (!string.IsNullOrWhiteSpace(userName) &&
            allowList.Contains(userName.Trim().ToLowerInvariant()))
        {
            return true;
        }

        var userId = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return !string.IsNullOrWhiteSpace(userId) &&
               allowList.Contains(userId.Trim().ToLowerInvariant());
    }
}
