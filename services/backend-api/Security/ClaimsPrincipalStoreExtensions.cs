using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using SmartPos.Backend.Infrastructure;

namespace SmartPos.Backend.Security;

public static class ClaimsPrincipalStoreExtensions
{
    public static async Task<Guid?> GetRequiredStoreIdAsync(
        this ClaimsPrincipal user,
        SmartPosDbContext dbContext,
        CancellationToken cancellationToken)
    {
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
