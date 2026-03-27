namespace SmartPos.Backend.Security;

public sealed class JwtCookieOptions
{
    public const string SectionName = "JwtAuth";

    public string Issuer { get; set; } = "smartpos-api";
    public string Audience { get; set; } = "smartpos-pwa";
    public string SecretKey { get; set; } =
        "smartpos-dev-secret-key-change-before-production-2026";
    public int ExpiryMinutes { get; set; } = 480;
    public string CookieName { get; set; } = "smartpos_auth";
    public bool SecureCookie { get; set; }
}
