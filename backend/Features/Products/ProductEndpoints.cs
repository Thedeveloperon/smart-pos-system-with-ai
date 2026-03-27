using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Products;

public static class ProductEndpoints
{
    public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder app)
    {
        var productGroup = app.MapGroup("/api/products").WithTags("Products");
        var categoryGroup = app.MapGroup("/api/categories").WithTags("Categories");

        productGroup.MapGet("/search", async (
            string? q,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            var result = await productService.SearchProductsAsync(q, cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization()
        .WithName("SearchProducts")
        .WithOpenApi();

        productGroup.MapGet("/catalog", async (
            string? q,
            int? take,
            bool? include_inactive,
            decimal? low_stock_threshold,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            var result = await productService.GetCatalogAsync(
                q,
                take ?? 80,
                include_inactive ?? false,
                low_stock_threshold,
                cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GetProductCatalog")
        .WithOpenApi();

        productGroup.MapPost("", async (
            CreateProductRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.CreateProductAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CreateProduct")
        .WithOpenApi();

        productGroup.MapPut("/{productId:guid}", async (
            Guid productId,
            UpdateProductRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.UpdateProductAsync(productId, request, cancellationToken);
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
        .WithName("UpdateProduct")
        .WithOpenApi();

        productGroup.MapPost("/{productId:guid}/stock-adjustments", async (
            Guid productId,
            StockAdjustmentRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.AdjustStockAsync(productId, request, cancellationToken);
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
        .WithName("AdjustProductStock")
        .WithOpenApi();

        categoryGroup.MapGet("", async (
            bool? include_inactive,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            var result = await productService.GetCategoriesAsync(
                include_inactive ?? false,
                cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("ListCategories")
        .WithOpenApi();

        categoryGroup.MapPost("", async (
            UpsertCategoryRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.CreateCategoryAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CreateCategory")
        .WithOpenApi();

        categoryGroup.MapPut("/{categoryId:guid}", async (
            Guid categoryId,
            UpsertCategoryRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.UpdateCategoryAsync(categoryId, request, cancellationToken);
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
        .WithName("UpdateCategory")
        .WithOpenApi();

        return app;
    }
}
