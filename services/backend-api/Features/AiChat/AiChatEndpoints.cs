using System.Security.Claims;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Ai;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.AiChat;

public static class AiChatEndpoints
{
    public static IEndpointRouteBuilder MapAiChatEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/ai/chat")
            .WithTags("AI")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapPost("/sessions", async (
            AiChatCreateSessionRequest request,
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiChatService chatService,
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

                var result = await chatService.CreateSessionAsync(userId.Value, request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("CreateAiChatSession")
        .WithOpenApi();

        group.MapPost("/sessions/{id:guid}/messages", async (
            Guid id,
            AiChatMessageCreateRequest request,
            HttpContext httpContext,
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiChatService chatService,
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

                var result = await chatService.PostMessageAsync(
                    userId.Value,
                    id,
                    request,
                    ResolveOptionalHeaderIdempotencyKey(httpContext),
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("PostAiChatMessage")
        .WithOpenApi();

        group.MapGet("/sessions/{id:guid}", async (
            Guid id,
            int? take,
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiChatService chatService,
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

                var result = await chatService.GetSessionAsync(
                    userId.Value,
                    id,
                    take.GetValueOrDefault(50),
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("GetAiChatSession")
        .WithOpenApi();

        group.MapGet("/history", async (
            int? take,
            ClaimsPrincipal user,
            IOptions<AiInsightOptions> aiInsightOptions,
            AiChatService chatService,
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

            var result = await chatService.GetHistoryAsync(userId.Value, take.GetValueOrDefault(20), cancellationToken);
            return Results.Ok(result);
        })
        .WithName("GetAiChatHistory")
        .WithOpenApi();

        return app;
    }

    private static Guid? ResolveUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(value, out var userId) ? userId : null;
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
