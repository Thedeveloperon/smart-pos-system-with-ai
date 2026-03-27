namespace SmartPos.Backend.Features.Sync;

public static class SyncEndpoints
{
    public static IEndpointRouteBuilder MapSyncEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/sync")
            .WithTags("Sync")
            .RequireAuthorization();

        group.MapPost("/events", async (
            SyncEventsRequest request,
            SyncEventsProcessor processor,
            CancellationToken cancellationToken) =>
        {
            if (request.Events.Count == 0)
            {
                return Results.BadRequest(new { message = "events list cannot be empty" });
            }

            var response = await processor.ProcessAsync(request, cancellationToken);
            return Results.Ok(response);
        })
        .WithName("SyncOfflineEvents")
        .WithOpenApi();

        return app;
    }
}
