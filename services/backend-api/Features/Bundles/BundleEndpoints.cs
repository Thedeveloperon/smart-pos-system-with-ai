using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Bundles;

public static class BundleEndpoints
{
    public static IEndpointRouteBuilder MapBundleEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/bundles")
            .WithTags("Bundles")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapPost("", async (
            CreateBundleRequest request,
            BundleService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.CreateBundleAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("CreateBundle")
        .WithOpenApi();

        group.MapPut("/{bundleId:guid}", async (
            Guid bundleId,
            UpdateBundleRequest request,
            BundleService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.UpdateBundleAsync(bundleId, request, cancellationToken);
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
        .WithName("UpdateBundle")
        .WithOpenApi();

        group.MapGet("", async (
            string? q,
            int? take,
            bool? include_inactive,
            BundleService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.GetBundleCatalogAsync(
                q,
                take ?? 80,
                include_inactive ?? false,
                cancellationToken);
            return Results.Ok(result);
        })
        .WithName("GetBundleCatalog")
        .WithOpenApi();

        group.MapGet("/search", async (
            string? q,
            int? take,
            BundleService service,
            CancellationToken cancellationToken) =>
        {
            var result = await service.SearchBundlesAsync(q, take ?? 30, cancellationToken);
            return Results.Ok(result);
        })
        .WithName("SearchBundles")
        .WithOpenApi();

        group.MapPost("/{bundleId:guid}/receive", async (
            Guid bundleId,
            BundleStockQuantityRequest request,
            BundleService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.ReceiveBundlesAsync(bundleId, request, cancellationToken);
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
        .WithName("ReceiveBundles")
        .WithOpenApi();

        group.MapPost("/{bundleId:guid}/assemble", async (
            Guid bundleId,
            BundleStockQuantityRequest request,
            BundleService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.AssembleBundlesAsync(bundleId, request, cancellationToken);
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
        .WithName("AssembleBundles")
        .WithOpenApi();

        group.MapPost("/{bundleId:guid}/break", async (
            Guid bundleId,
            BundleStockQuantityRequest request,
            BundleService service,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await service.BreakBundlesAsync(bundleId, request, cancellationToken);
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
        .WithName("BreakBundles")
        .WithOpenApi();

        return app;
    }
}
