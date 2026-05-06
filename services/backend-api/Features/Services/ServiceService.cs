using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Features.Services;

public sealed class ServiceService(
    SmartPosDbContext dbContext,
    IHttpContextAccessor httpContextAccessor)
{
    public async Task<ServiceListResponse> GetAllAsync(CancellationToken cancellationToken)
    {
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var query = dbContext.Services
            .AsNoTracking()
            .Include(x => x.Category)
            .Where(x => x.IsActive);

        if (storeId.HasValue)
        {
            query = query.Where(x => x.StoreId == storeId.Value);
        }

        var entities = await query
            .OrderBy(x => x.Name)
            .ToListAsync(cancellationToken);
        var items = entities
            .Select(x => ToResponse(x))
            .ToList();

        return new ServiceListResponse
        {
            Items = items
        };
    }

    public async Task<ServiceResponse> CreateAsync(
        CreateServiceRequest request,
        CancellationToken cancellationToken)
    {
        var storeId = await GetCurrentStoreIdAsync(cancellationToken);
        var name = NormalizeRequired(request.Name, "Service name is required.");
        var sku = NormalizeOptional(request.Sku);
        var description = NormalizeOptional(request.Description);

        if (request.Price <= 0m)
        {
            throw new InvalidOperationException("Service price must be greater than zero.");
        }

        if (request.DurationMinutes.HasValue && request.DurationMinutes.Value <= 0)
        {
            throw new InvalidOperationException("Duration minutes must be greater than zero when provided.");
        }

        await EnsureUniqueSkuAsync(storeId, sku, excludeServiceId: null, cancellationToken);

        var service = new Service
        {
            StoreId = storeId,
            CategoryId = request.CategoryId,
            Name = name,
            Sku = sku,
            Price = RoundMoney(request.Price),
            Description = description,
            DurationMinutes = request.DurationMinutes,
            IsActive = true,
            CreatedAtUtc = DateTimeOffset.UtcNow
        };

        dbContext.Services.Add(service);
        await dbContext.SaveChangesAsync(cancellationToken);

        var categoryName = service.CategoryId.HasValue
            ? await dbContext.Categories
                .AsNoTracking()
                .Where(x => x.Id == service.CategoryId.Value)
                .Select(x => x.Name)
                .FirstOrDefaultAsync(cancellationToken)
            : null;

        return ToResponse(service, categoryName);
    }

    public async Task<ServiceResponse> UpdateAsync(
        Guid serviceId,
        UpdateServiceRequest request,
        CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var service = await dbContext.Services
            .Include(x => x.Category)
            .FirstOrDefaultAsync(x => x.Id == serviceId, cancellationToken)
            ?? throw new KeyNotFoundException("Service not found.");

        if (currentStoreId.HasValue && service.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Service not found.");
        }

        if (request.Name is not null)
        {
            service.Name = NormalizeRequired(request.Name, "Service name is required.");
        }

        if (request.Sku is not null)
        {
            var sku = NormalizeOptional(request.Sku);
            await EnsureUniqueSkuAsync(currentStoreId, sku, service.Id, cancellationToken);
            service.Sku = sku;
        }

        if (request.Price.HasValue)
        {
            if (request.Price.Value <= 0m)
            {
                throw new InvalidOperationException("Service price must be greater than zero.");
            }

            service.Price = RoundMoney(request.Price.Value);
        }

        if (request.Description is not null)
        {
            service.Description = NormalizeOptional(request.Description);
        }

        if (request.CategoryId.HasValue)
        {
            service.CategoryId = request.CategoryId;
        }

        if (request.DurationMinutes.HasValue)
        {
            if (request.DurationMinutes.Value <= 0)
            {
                throw new InvalidOperationException("Duration minutes must be greater than zero when provided.");
            }

            service.DurationMinutes = request.DurationMinutes.Value;
        }

        service.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        return ToResponse(service, service.Category?.Name);
    }

    public async Task DeleteAsync(Guid serviceId, CancellationToken cancellationToken)
    {
        var currentStoreId = await GetCurrentStoreIdAsync(cancellationToken);
        var service = await dbContext.Services
            .FirstOrDefaultAsync(x => x.Id == serviceId, cancellationToken)
            ?? throw new KeyNotFoundException("Service not found.");

        if (currentStoreId.HasValue && service.StoreId != currentStoreId.Value)
        {
            throw new KeyNotFoundException("Service not found.");
        }

        service.IsActive = false;
        service.UpdatedAtUtc = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
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

    private async Task EnsureUniqueSkuAsync(
        Guid? storeId,
        string? sku,
        Guid? excludeServiceId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sku))
        {
            return;
        }

        var normalized = sku.Trim().ToLowerInvariant();
        var exists = await dbContext.Services
            .AsNoTracking()
            .AnyAsync(x =>
                (excludeServiceId == null || x.Id != excludeServiceId.Value) &&
                (!storeId.HasValue || x.StoreId == storeId.Value) &&
                x.Sku != null &&
                x.Sku.ToLower() == normalized,
                cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Service SKU already exists.");
        }
    }

    private static ServiceResponse ToResponse(Service service, string? categoryName = null)
    {
        return new ServiceResponse
        {
            Id = service.Id,
            Name = service.Name,
            Sku = service.Sku,
            Price = RoundMoney(service.Price),
            Description = service.Description,
            CategoryId = service.CategoryId,
            CategoryName = categoryName ?? service.Category?.Name,
            DurationMinutes = service.DurationMinutes,
            IsActive = service.IsActive
        };
    }

    private static string NormalizeRequired(string? value, string errorMessage)
    {
        var normalized = NormalizeOptional(value);
        if (string.IsNullOrWhiteSpace(normalized))
        {
            throw new InvalidOperationException(errorMessage);
        }

        return normalized;
    }

    private static string? NormalizeOptional(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return value.Trim();
    }

    private static decimal RoundMoney(decimal value) =>
        decimal.Round(value, 2, MidpointRounding.AwayFromZero);
}
