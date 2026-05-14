using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.CashSessions;

public static class CashSessionEndpoints
{
    public static IEndpointRouteBuilder MapCashSessionEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/cash-sessions")
            .WithTags("Cash Sessions")
            .RequireAuthorization();

        group.MapGet("", async (
            DateOnly? from,
            DateOnly? to,
            CashSessionService cashSessionService,
            CancellationToken cancellationToken) =>
        {
            var result = await cashSessionService.GetHistoryAsync(from, to, cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GetCashSessionHistory")
        .WithOpenApi();

        group.MapGet("/current", async (
            CashSessionService cashSessionService,
            CancellationToken cancellationToken) =>
        {
            var session = await cashSessionService.GetCurrentAsync(cancellationToken);
            return Results.Ok(session);
        })
        .WithName("GetCurrentCashSession")
        .WithOpenApi();

        group.MapPost("/open", async (
            OpenCashSessionRequest request,
            CashSessionService cashSessionService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var session = await cashSessionService.OpenAsync(request, cancellationToken);
                return Results.Ok(session);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("OpenCashSession")
        .WithOpenApi();

        group.MapPut("/current/drawer", async (
            UpdateCashDrawerRequest request,
            CashSessionService cashSessionService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var session = await cashSessionService.UpdateDrawerAsync(request, cancellationToken);
                return Results.Ok(session);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("UpdateCashDrawer")
        .WithOpenApi();

        group.MapPost("/{sessionId:guid}/close", async (
            Guid sessionId,
            CloseCashSessionRequest request,
            CashSessionService cashSessionService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var session = await cashSessionService.CloseAsync(sessionId, request, cancellationToken);
                return Results.Ok(session);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("CloseCashSession")
        .WithOpenApi();

        return app;
    }
}
