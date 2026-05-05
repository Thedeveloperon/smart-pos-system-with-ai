using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Import;

public static class ImportEndpoints
{
    private const int MaxRows = 2000;

    public static IEndpointRouteBuilder MapImportEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/import")
            .WithTags("Import")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapPost("/brands", async (
            BulkImportBrandsRequest request,
            ImportService importService,
            CancellationToken cancellationToken) =>
        {
            var validation = ValidateRowCount(request.Rows.Count);
            if (validation is not null)
            {
                return validation;
            }

            try
            {
                var result = await importService.BulkImportBrandsAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("BulkImportBrands")
        .WithOpenApi();

        group.MapPost("/categories", async (
            BulkImportCategoriesRequest request,
            ImportService importService,
            CancellationToken cancellationToken) =>
        {
            var validation = ValidateRowCount(request.Rows.Count);
            if (validation is not null)
            {
                return validation;
            }

            try
            {
                var result = await importService.BulkImportCategoriesAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("BulkImportCategories")
        .WithOpenApi();

        group.MapPost("/products", async (
            BulkImportProductsRequest request,
            ImportService importService,
            CancellationToken cancellationToken) =>
        {
            var validation = ValidateRowCount(request.Rows.Count);
            if (validation is not null)
            {
                return validation;
            }

            try
            {
                var result = await importService.BulkImportProductsAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("BulkImportProducts")
        .WithOpenApi();

        group.MapPost("/customers", async (
            BulkImportCustomersRequest request,
            ImportService importService,
            CancellationToken cancellationToken) =>
        {
            var validation = ValidateRowCount(request.Rows.Count);
            if (validation is not null)
            {
                return validation;
            }

            try
            {
                var result = await importService.BulkImportCustomersAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .WithName("BulkImportCustomers")
        .WithOpenApi();

        return app;
    }

    private static IResult? ValidateRowCount(int count)
    {
        if (count > MaxRows)
        {
            return Results.BadRequest(new { message = $"A maximum of {MaxRows} rows is allowed per import." });
        }

        return null;
    }
}
