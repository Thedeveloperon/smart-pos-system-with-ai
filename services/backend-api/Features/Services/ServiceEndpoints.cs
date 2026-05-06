using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Services;

public static class ServiceEndpoints
{
    public static IEndpointRouteBuilder MapServiceEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/services")
            .WithTags("Services");

        group.MapGet("", async (
            ServiceService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.GetAllAsync(cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("ListServices")
        .WithOpenApi();

        group.MapPost("", async (
            CreateServiceRequest request,
            ServiceService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.CreateAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CreateService")
        .WithOpenApi();

        group.MapPut("/{serviceId:guid}", async (
            Guid serviceId,
            UpdateServiceRequest request,
            ServiceService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.UpdateAsync(serviceId, request, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("UpdateService")
        .WithOpenApi();

        group.MapDelete("/{serviceId:guid}", async (
            Guid serviceId,
            ServiceService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                await service.DeleteAsync(serviceId, cancellationToken);
                return Results.NoContent();
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("DeleteService")
        .WithOpenApi();

        return app;
    }
}
