using Microsoft.AspNetCore.Identity;
using SmartPos.Backend.Domain;

namespace SmartPos.Backend.Security;

public static class PasswordHashing
{
    private static readonly PasswordHasher<AppUser> Hasher = new();

    public static string HashPassword(AppUser user, string password)
    {
        return Hasher.HashPassword(user, password);
    }

    public static bool VerifyPassword(AppUser user, string hashedPassword, string password)
    {
        var result = Hasher.VerifyHashedPassword(user, hashedPassword, password);
        return result is PasswordVerificationResult.Success or
               PasswordVerificationResult.SuccessRehashNeeded;
    }
}
