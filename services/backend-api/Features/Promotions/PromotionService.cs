using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Promotions;

public sealed class PromotionService(
    SmartPosDbContext dbContext,
    IHttpContextAccessor httpContextAccessor)
{
    public async Task<List<PromotionResponse>> ListPromotionsAsync(CancellationToken cancellationToken)
    {
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var query = dbContext.Promotions.AsNoTracking().AsQueryable();
        if (storeId.HasValue)
        {
            query = query.Where(x => x.StoreId == storeId.Value);
        }

        var items = await query
            .OrderByDescending(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        return items.Select(MapResponse).ToList();
    }

    public async Task<PromotionResponse?> GetPromotionAsync(Guid id, CancellationToken cancellationToken)
    {
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var query = dbContext.Promotions.AsNoTracking().Where(x => x.Id == id);
        if (storeId.HasValue)
        {
            query = query.Where(x => x.StoreId == storeId.Value);
        }

        var entity = await query.FirstOrDefaultAsync(cancellationToken);
        return entity is null ? null : MapResponse(entity);
    }

    public async Task<PromotionResponse> CreatePromotionAsync(UpsertPromotionRequest request, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var (scope, valueType, value) = await NormalizeRequestAsync(request, storeId, null, cancellationToken);

        var entity = new Promotion
        {
            StoreId = storeId,
            Name = request.Name.Trim(),
            Description = NormalizeOptional(request.Description),
            Scope = scope,
            CategoryId = scope == PromotionScope.Category ? request.CategoryId : null,
            ProductId = scope == PromotionScope.Product ? request.ProductId : null,
            ValueType = valueType,
            Value = value,
            StartsAtUtc = request.StartsAtUtc,
            EndsAtUtc = request.EndsAtUtc,
            IsActive = request.IsActive,
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        dbContext.Promotions.Add(entity);
        await dbContext.SaveChangesAsync(cancellationToken);
        return MapResponse(entity);
    }

    public async Task<PromotionResponse> UpdatePromotionAsync(Guid id, UpsertPromotionRequest request, CancellationToken cancellationToken)
    {
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var entity = await dbContext.Promotions.FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Promotion not found.");

        if (storeId.HasValue && entity.StoreId != storeId.Value)
        {
            throw new KeyNotFoundException("Promotion not found.");
        }

        var (scope, valueType, value) = await NormalizeRequestAsync(request, storeId, id, cancellationToken);

        entity.Name = request.Name.Trim();
        entity.Description = NormalizeOptional(request.Description);
        entity.Scope = scope;
        entity.CategoryId = scope == PromotionScope.Category ? request.CategoryId : null;
        entity.ProductId = scope == PromotionScope.Product ? request.ProductId : null;
        entity.ValueType = valueType;
        entity.Value = value;
        entity.StartsAtUtc = request.StartsAtUtc;
        entity.EndsAtUtc = request.EndsAtUtc;
        entity.IsActive = request.IsActive;
        entity.UpdatedAtUtc = DateTimeOffset.UtcNow;

        await dbContext.SaveChangesAsync(cancellationToken);
        return MapResponse(entity);
    }

    public async Task DeactivatePromotionAsync(Guid id, CancellationToken cancellationToken)
    {
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var entity = await dbContext.Promotions.FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new KeyNotFoundException("Promotion not found.");

        if (storeId.HasValue && entity.StoreId != storeId.Value)
        {
            throw new KeyNotFoundException("Promotion not found.");
        }

        entity.IsActive = false;
        entity.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<Dictionary<Guid, ActivePromotionDiscount>> GetActivePromotionDiscountsAsync(
        IReadOnlyCollection<(Guid ProductId, Guid? CategoryId)> products,
        DateTimeOffset now,
        CancellationToken cancellationToken)
    {
        if (products.Count == 0)
        {
            return [];
        }

        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var productIds = products.Select(x => x.ProductId).Distinct().ToArray();
        var categoryIds = products
            .Where(x => x.CategoryId.HasValue)
            .Select(x => x.CategoryId!.Value)
            .Distinct()
            .ToArray();

        var query = dbContext.Promotions
            .AsNoTracking()
            .Where(x =>
                x.IsActive &&
                x.StartsAtUtc <= now &&
                x.EndsAtUtc >= now &&
                (x.Scope == PromotionScope.All ||
                 (x.Scope == PromotionScope.Category && x.CategoryId.HasValue && categoryIds.Contains(x.CategoryId.Value)) ||
                 (x.Scope == PromotionScope.Product && x.ProductId.HasValue && productIds.Contains(x.ProductId.Value))));

        if (storeId.HasValue)
        {
            query = query.Where(x => x.StoreId == storeId.Value);
        }

        var promotions = await query.ToListAsync(cancellationToken);
        var productCategoryLookup = products
            .GroupBy(x => x.ProductId)
            .ToDictionary(x => x.Key, x => x.Select(y => y.CategoryId).FirstOrDefault());

        var result = new Dictionary<Guid, ActivePromotionDiscount>();
        foreach (var productId in productIds)
        {
            var categoryId = productCategoryLookup[productId];
            var best = promotions
                .Where(x =>
                    (x.Scope == PromotionScope.Product && x.ProductId == productId) ||
                    (x.Scope == PromotionScope.Category && categoryId.HasValue && x.CategoryId == categoryId.Value) ||
                    x.Scope == PromotionScope.All)
                .OrderBy(x => GetScopePriority(x.Scope))
                .ThenByDescending(x => x.Value)
                .FirstOrDefault();

            if (best is not null)
            {
                result[productId] = new ActivePromotionDiscount(best.ValueType, best.Value);
            }
        }

        return result;
    }

    private async Task<(PromotionScope Scope, PromotionValueType ValueType, decimal Value)> NormalizeRequestAsync(
        UpsertPromotionRequest request,
        Guid? storeId,
        Guid? existingId,
        CancellationToken cancellationToken)
    {
        var name = request.Name?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException("Promotion name is required.");
        }

        if (request.EndsAtUtc <= request.StartsAtUtc)
        {
            throw new InvalidOperationException("Promotion end date must be after start date.");
        }

        var scope = ParseScope(request.Scope);
        var valueType = ParseValueType(request.ValueType);
        var value = decimal.Round(request.Value, 2, MidpointRounding.AwayFromZero);

        if (value <= 0m)
        {
            throw new InvalidOperationException("Promotion value must be greater than zero.");
        }

        if (valueType == PromotionValueType.Percent && value > 100m)
        {
            throw new InvalidOperationException("Promotion percent value must be between 0 and 100.");
        }

        if (scope == PromotionScope.Category && !request.CategoryId.HasValue)
        {
            throw new InvalidOperationException("Category scope promotions require category_id.");
        }

        if (scope == PromotionScope.Product && !request.ProductId.HasValue)
        {
            throw new InvalidOperationException("Product scope promotions require product_id.");
        }

        if (scope == PromotionScope.Category && request.CategoryId.HasValue)
        {
            var categoryQuery = dbContext.Categories.AsNoTracking().Where(x => x.Id == request.CategoryId.Value);
            if (storeId.HasValue)
            {
                categoryQuery = categoryQuery.Where(x => x.StoreId == storeId.Value);
            }

            var exists = await categoryQuery.AnyAsync(cancellationToken);
            if (!exists)
            {
                throw new InvalidOperationException("Category not found.");
            }
        }

        if (scope == PromotionScope.Product && request.ProductId.HasValue)
        {
            var productQuery = dbContext.Products.AsNoTracking().Where(x => x.Id == request.ProductId.Value);
            if (storeId.HasValue)
            {
                productQuery = productQuery.Where(x => x.StoreId == storeId.Value);
            }

            var exists = await productQuery.AnyAsync(cancellationToken);
            if (!exists)
            {
                throw new InvalidOperationException("Product not found.");
            }
        }

        _ = existingId;
        return (scope, valueType, value);
    }

    private static string? NormalizeOptional(string? value)
    {
        var normalized = value?.Trim();
        return string.IsNullOrWhiteSpace(normalized) ? null : normalized;
    }

    private static int GetScopePriority(PromotionScope scope) => scope switch
    {
        PromotionScope.Product => 1,
        PromotionScope.Category => 2,
        _ => 3
    };

    private static PromotionScope ParseScope(string value) => value.Trim().ToLowerInvariant() switch
    {
        "all" => PromotionScope.All,
        "category" => PromotionScope.Category,
        "product" => PromotionScope.Product,
        _ => throw new InvalidOperationException("scope must be one of: all, category, product.")
    };

    private static PromotionValueType ParseValueType(string value) => value.Trim().ToLowerInvariant() switch
    {
        "percent" => PromotionValueType.Percent,
        "fixed" => PromotionValueType.Fixed,
        _ => throw new InvalidOperationException("value_type must be one of: percent, fixed.")
    };

    private static PromotionResponse MapResponse(Promotion entity)
    {
        return new PromotionResponse
        {
            Id = entity.Id,
            Name = entity.Name,
            Description = entity.Description,
            Scope = entity.Scope.ToString().ToLowerInvariant(),
            CategoryId = entity.CategoryId,
            ProductId = entity.ProductId,
            ValueType = entity.ValueType.ToString().ToLowerInvariant(),
            Value = entity.Value,
            StartsAtUtc = entity.StartsAtUtc,
            EndsAtUtc = entity.EndsAtUtc,
            IsActive = entity.IsActive,
            CreatedAtUtc = entity.CreatedAtUtc,
            UpdatedAtUtc = entity.UpdatedAtUtc
        };
    }

    private async Task<Guid?> GetCurrentStoreIdAsync(CancellationToken cancellationToken)
    {
        var user = httpContextAccessor.HttpContext?.User;
        if (user is null)
        {
            return null;
        }

        var userIdValue = user.FindFirstValue(ClaimTypes.NameIdentifier) ?? user.FindFirstValue("sub");
        if (!Guid.TryParse(userIdValue, out var userId))
        {
            return null;
        }

        return await dbContext.Users
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => x.StoreId)
            .SingleOrDefaultAsync(cancellationToken);
    }
}
