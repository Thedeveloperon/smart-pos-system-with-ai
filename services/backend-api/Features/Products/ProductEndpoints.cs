using Microsoft.Extensions.Options;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.Products;

public static class ProductEndpoints
{
    public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder app)
    {
        var productGroup = app.MapGroup("/api/products").WithTags("Products");
        var categoryGroup = app.MapGroup("/api/categories").WithTags("Categories");
        var brandGroup = app.MapGroup("/api/brands").WithTags("Brands");
        var supplierGroup = app.MapGroup("/api/suppliers").WithTags("Suppliers");

        productGroup.MapGet("/search", async (
            string? q,
            int? take,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            var result = await productService.SearchProductsAsync(q, take ?? 30, cancellationToken);
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

        productGroup.MapPost("/barcodes/generate", async (
            GenerateBarcodeRequest request,
            HttpContext httpContext,
            IOptions<ProductBarcodeFeatureOptions> barcodeFeatureOptions,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            if (!IsBarcodeFeatureEnabled(barcodeFeatureOptions))
            {
                return Results.NotFound(new { message = "Barcode feature is disabled." });
            }

            try
            {
                var idempotencyKey = ResolveIdempotencyKey(httpContext);
                var result = await productService.GenerateBarcodeAsync(request, idempotencyKey, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GenerateProductBarcode")
        .WithOpenApi();

        productGroup.MapPost("/barcodes/validate", async (
            ValidateBarcodeRequest request,
            IOptions<ProductBarcodeFeatureOptions> barcodeFeatureOptions,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            if (!IsBarcodeFeatureEnabled(barcodeFeatureOptions))
            {
                return Results.NotFound(new { message = "Barcode feature is disabled." });
            }

            var result = await productService.ValidateBarcodeAsync(request, cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("ValidateProductBarcode")
        .WithOpenApi();

        productGroup.MapPost("/{productId:guid}/barcode/generate", async (
            Guid productId,
            GenerateProductBarcodeRequest request,
            HttpContext httpContext,
            IOptions<ProductBarcodeFeatureOptions> barcodeFeatureOptions,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            if (!IsBarcodeFeatureEnabled(barcodeFeatureOptions))
            {
                return Results.NotFound(new { message = "Barcode feature is disabled." });
            }

            try
            {
                var idempotencyKey = ResolveIdempotencyKey(httpContext);
                var result = await productService.GenerateAndAssignBarcodeAsync(
                    productId,
                    request,
                    idempotencyKey,
                    cancellationToken);
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
        .WithName("GenerateAndAssignProductBarcode")
        .WithOpenApi();

        productGroup.MapPost("/barcodes/bulk-generate-missing", async (
            BulkGenerateMissingProductBarcodesRequest request,
            HttpContext httpContext,
            IOptions<ProductBarcodeFeatureOptions> barcodeFeatureOptions,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            if (!IsBarcodeFeatureEnabled(barcodeFeatureOptions))
            {
                return Results.NotFound(new { message = "Barcode feature is disabled." });
            }

            try
            {
                var idempotencyKey = ResolveIdempotencyKey(httpContext);
                var result = await productService.BulkGenerateMissingBarcodesAsync(
                    request,
                    idempotencyKey,
                    cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("BulkGenerateMissingProductBarcodes")
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

        productGroup.MapGet("/{productId:guid}/suppliers", async (
            Guid productId,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.GetProductSuppliersAsync(productId, cancellationToken);
                return Results.Ok(result);
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("GetProductSuppliers")
        .WithOpenApi();

        productGroup.MapPut("/{productId:guid}/suppliers", async (
            Guid productId,
            UpsertProductSupplierRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.UpsertProductSupplierAsync(productId, request, cancellationToken);
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
        .WithName("UpsertProductSupplier")
        .WithOpenApi();

        productGroup.MapPut("/{productId:guid}/preferred-supplier", async (
            Guid productId,
            SetPreferredProductSupplierRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.SetPreferredSupplierAsync(productId, request, cancellationToken);
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
        .WithName("SetPreferredProductSupplier")
        .WithOpenApi();

        productGroup.MapDelete("/{productId:guid}", async (
            Guid productId,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                await productService.DeleteProductAsync(productId, cancellationToken);
                return Results.NoContent();
            }
            catch (KeyNotFoundException exception)
            {
                return Results.NotFound(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("DeleteProduct")
        .WithOpenApi();

        productGroup.MapDelete("/{productId:guid}/hard-delete", async (
            Guid productId,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                await productService.HardDeleteInactiveProductAsync(productId, cancellationToken);
                return Results.NoContent();
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
        .WithName("HardDeleteInactiveProduct")
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

        brandGroup.MapGet("", async (
            bool? include_inactive,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            var result = await productService.GetBrandsAsync(include_inactive ?? false, cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("ListBrands")
        .WithOpenApi();

        brandGroup.MapPost("", async (
            UpsertBrandRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.CreateBrandAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CreateBrand")
        .WithOpenApi();

        brandGroup.MapPut("/{brandId:guid}", async (
            Guid brandId,
            UpsertBrandRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.UpdateBrandAsync(brandId, request, cancellationToken);
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
        .WithName("UpdateBrand")
        .WithOpenApi();

        supplierGroup.MapGet("", async (
            bool? include_inactive,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            var result = await productService.GetSuppliersAsync(include_inactive ?? false, cancellationToken);
            return Results.Ok(result);
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("ListSuppliers")
        .WithOpenApi();

        supplierGroup.MapPost("", async (
            UpsertSupplierRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.CreateSupplierAsync(request, cancellationToken);
                return Results.Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return Results.BadRequest(new { message = exception.Message });
            }
        })
        .RequireAuthorization(SmartPosPolicies.ManagerOrOwner)
        .WithName("CreateSupplier")
        .WithOpenApi();

        supplierGroup.MapPut("/{supplierId:guid}", async (
            Guid supplierId,
            UpsertSupplierRequest request,
            ProductService productService,
            CancellationToken cancellationToken) =>
        {
            try
            {
                var result = await productService.UpdateSupplierAsync(supplierId, request, cancellationToken);
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
        .WithName("UpdateSupplier")
        .WithOpenApi();

        return app;
    }

    private static bool IsBarcodeFeatureEnabled(IOptions<ProductBarcodeFeatureOptions> options)
    {
        return options.Value.Enabled;
    }

    private static string? ResolveIdempotencyKey(HttpContext httpContext)
    {
        if (!httpContext.Request.Headers.TryGetValue("Idempotency-Key", out var values))
        {
            return null;
        }

        var normalized = values.FirstOrDefault()?.Trim();
        if (string.IsNullOrWhiteSpace(normalized))
        {
            return null;
        }

        if (normalized.Length > 128)
        {
            throw new InvalidOperationException("Header 'Idempotency-Key' must be 128 characters or less.");
        }

        return normalized;
    }
}
