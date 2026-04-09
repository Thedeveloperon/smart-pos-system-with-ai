using System.Security.Claims;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Reminders;

public static class ReminderEndpoints
{
    public static IEndpointRouteBuilder MapReminderEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/reminders")
            .WithTags("Reminders")
            .RequireAuthorization();

        group.MapGet("", async (
            bool? include_acknowledged,
            int? take,
            ClaimsPrincipal user,
            ReminderService reminderService,
            CancellationToken cancellationToken) =>
        {
            var userId = ResolveUserId(user);
            if (!userId.HasValue)
            {
                return Results.Unauthorized();
            }

            var result = await reminderService.GetRemindersAsync(
                userId.Value,
                include_acknowledged ?? false,
                take ?? 20,
                cancellationToken);
            return Results.Ok(result);
        })
        .WithName("GetReminders")
        .WithOpenApi();

        group.MapPost("/rules", async (
            ReminderRuleUpsertRequest request,
            ClaimsPrincipal user,
            ReminderService reminderService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var userId = ResolveUserId(user);
                if (!userId.HasValue)
                {
                    return Results.Unauthorized();
                }

                var result = await reminderService.UpsertRuleAsync(userId.Value, request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("UpsertReminderRule")
        .WithOpenApi();

        group.MapPost("/{id:guid}/ack", async (
            Guid id,
            ClaimsPrincipal user,
            ReminderService reminderService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var userId = ResolveUserId(user);
                if (!userId.HasValue)
                {
                    return Results.Unauthorized();
                }

                var result = await reminderService.AcknowledgeAsync(userId.Value, id, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("AcknowledgeReminder")
        .WithOpenApi();

        group.MapPost("/run-now", async (
            ClaimsPrincipal user,
            ReminderService reminderService,
            CancellationToken cancellationToken) =>
        {
            var userId = ResolveUserId(user);
            if (!userId.HasValue)
            {
                return Results.Unauthorized();
            }

            var result = await reminderService.RunNowAsync(userId.Value, cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("RunRemindersNow")
        .WithOpenApi();

        return app;
    }

    private static Guid? ResolveUserId(ClaimsPrincipal user)
    {
        var value = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        return Guid.TryParse(value, out var userId) ? userId : null;
    }
}
