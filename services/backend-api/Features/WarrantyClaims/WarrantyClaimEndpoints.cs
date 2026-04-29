using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Domain;
using SmartPos.Backend.Infrastructure;
using SmartPos.Backend.Security;

namespace SmartPos.Backend.Features.WarrantyClaims;

public static class WarrantyClaimEndpoints
{
    public static IEndpointRouteBuilder MapWarrantyClaimEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/warranty-claims")
            .WithTags("Warranty Claims")
            .RequireAuthorization(SmartPosPolicies.ManagerOrOwner);

        group.MapGet("/", async (
            string? status,
            DateTimeOffset? from_date,
            DateTimeOffset? to_date,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var query = dbContext.WarrantyClaims
                .AsNoTracking()
                .Include(x => x.SerialNumber)
                .ThenInclude(x => x.Product)
                .AsQueryable();

            if (currentStoreId.HasValue)
            {
                query = query.Where(x => x.StoreId == currentStoreId.Value);
            }

            if (!string.IsNullOrWhiteSpace(status) &&
                Enum.TryParse<WarrantyClaimStatus>(status, true, out var parsedStatus))
            {
                query = query.Where(x => x.Status == parsedStatus);
            }

            if (from_date.HasValue)
            {
                query = query.Where(x => x.ClaimDate >= from_date.Value);
            }

            if (to_date.HasValue)
            {
                query = query.Where(x => x.ClaimDate <= to_date.Value);
            }

            var items = await query
                .OrderByDescending(x => x.ClaimDate)
                .Select(x => new
                {
                    id = x.Id,
                    serial_number_id = x.SerialNumberId,
                    serial_value = x.SerialNumber.SerialValue,
                    product_id = x.SerialNumber.ProductId,
                    product_name = x.SerialNumber.Product.Name,
                    claim_date = x.ClaimDate,
                    status = x.Status,
                    resolution_notes = x.ResolutionNotes,
                    created_by_user_id = x.CreatedByUserId,
                    created_at = x.CreatedAtUtc,
                    updated_at = x.UpdatedAtUtc
                })
                .ToListAsync(cancellationToken);

            return Results.Ok(new { items });
        })
        .WithName("ListWarrantyClaims")
        .WithOpenApi();

        group.MapPost("/", async (
            CreateWarrantyClaimRequest request,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var serial = await dbContext.SerialNumbers
                .FirstOrDefaultAsync(x => x.Id == request.SerialNumberId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (serial is null)
            {
                return Results.NotFound(new { message = "Serial number not found." });
            }

            if (serial.Status is not (SerialNumberStatus.Sold or SerialNumberStatus.UnderWarranty))
            {
                return Results.BadRequest(new { message = "Warranty claims can only be created for sold or under-warranty serials." });
            }

            var now = DateTimeOffset.UtcNow;
            var claim = new WarrantyClaim
            {
                StoreId = serial.StoreId,
                SerialNumberId = serial.Id,
                ClaimDate = request.ClaimDate ?? now,
                Status = WarrantyClaimStatus.Open,
                ResolutionNotes = request.ResolutionNotes,
                CreatedByUserId = request.CreatedByUserId,
                CreatedAtUtc = now,
                UpdatedAtUtc = now,
                SerialNumber = serial
            };

            dbContext.WarrantyClaims.Add(claim);
            serial.Status = SerialNumberStatus.UnderWarranty;
            serial.UpdatedAtUtc = now;
            await dbContext.SaveChangesAsync(cancellationToken);

            return Results.Ok(new
            {
                id = claim.Id,
                serial_number_id = claim.SerialNumberId,
                status = claim.Status,
                claim_date = claim.ClaimDate
            });
        })
        .WithName("CreateWarrantyClaim")
        .WithOpenApi();

        group.MapGet("/{claimId:guid}", async (
            Guid claimId,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var claim = await dbContext.WarrantyClaims
                .AsNoTracking()
                .Include(x => x.SerialNumber)
                .ThenInclude(x => x.Product)
                .FirstOrDefaultAsync(x => x.Id == claimId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (claim is null)
            {
                return Results.NotFound(new { message = "Warranty claim not found." });
            }

            return Results.Ok(new
            {
                id = claim.Id,
                serial_number_id = claim.SerialNumberId,
                serial_value = claim.SerialNumber.SerialValue,
                product_id = claim.SerialNumber.ProductId,
                product_name = claim.SerialNumber.Product.Name,
                claim_date = claim.ClaimDate,
                status = claim.Status,
                resolution_notes = claim.ResolutionNotes,
                created_by_user_id = claim.CreatedByUserId,
                created_at = claim.CreatedAtUtc,
                updated_at = claim.UpdatedAtUtc
            });
        })
        .WithName("GetWarrantyClaim")
        .WithOpenApi();

        group.MapPut("/{claimId:guid}", async (
            Guid claimId,
            UpdateWarrantyClaimRequest request,
            ClaimsPrincipal user,
            SmartPosDbContext dbContext,
            CancellationToken cancellationToken) =>
        {
            var currentStoreId = await user.GetRequiredStoreIdAsync(dbContext, cancellationToken);
            var claim = await dbContext.WarrantyClaims
                .Include(x => x.SerialNumber)
                .FirstOrDefaultAsync(x => x.Id == claimId && (!currentStoreId.HasValue || x.StoreId == currentStoreId.Value), cancellationToken);
            if (claim is null)
            {
                return Results.NotFound(new { message = "Warranty claim not found." });
            }

            if (!IsValidStatusTransition(claim.Status, request.Status))
            {
                return Results.BadRequest(new { message = "Invalid warranty claim status transition." });
            }

            claim.Status = request.Status;
            claim.ResolutionNotes = request.ResolutionNotes;
            claim.UpdatedAtUtc = DateTimeOffset.UtcNow;

            if (request.Status is WarrantyClaimStatus.Resolved or WarrantyClaimStatus.Rejected)
            {
                claim.SerialNumber.Status = request.Status == WarrantyClaimStatus.Resolved
                    ? SerialNumberStatus.Sold
                    : SerialNumberStatus.Defective;
                claim.SerialNumber.UpdatedAtUtc = claim.UpdatedAtUtc;
            }

            await dbContext.SaveChangesAsync(cancellationToken);

            return Results.Ok(new
            {
                id = claim.Id,
                status = claim.Status,
                resolution_notes = claim.ResolutionNotes
            });
        })
        .WithName("UpdateWarrantyClaim")
        .WithOpenApi();

        return app;
    }

    private static bool IsValidStatusTransition(WarrantyClaimStatus currentStatus, WarrantyClaimStatus nextStatus)
    {
        if (currentStatus == nextStatus)
        {
            return true;
        }

        return currentStatus switch
        {
            WarrantyClaimStatus.Open => nextStatus is WarrantyClaimStatus.InRepair or WarrantyClaimStatus.Resolved or WarrantyClaimStatus.Rejected,
            WarrantyClaimStatus.InRepair => nextStatus is WarrantyClaimStatus.Resolved or WarrantyClaimStatus.Rejected,
            WarrantyClaimStatus.Resolved => false,
            WarrantyClaimStatus.Rejected => false,
            _ => false
        };
    }
}

public sealed class CreateWarrantyClaimRequest
{
    public Guid SerialNumberId { get; set; }
    public DateTimeOffset? ClaimDate { get; set; }
    public string? ResolutionNotes { get; set; }
    public Guid? CreatedByUserId { get; set; }
}

public sealed class UpdateWarrantyClaimRequest
{
    public WarrantyClaimStatus Status { get; set; } = WarrantyClaimStatus.Open;
    public string? ResolutionNotes { get; set; }
}
