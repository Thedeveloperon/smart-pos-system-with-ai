namespace SmartPos.Backend.Security;

public sealed class AuthSecurityOptions
{
    public const string SectionName = "AuthSecurity";

    public bool RequireMfaForSuperAdmins { get; set; } = true;
    public int TotpStepSeconds { get; set; } = 30;
    public int TotpAllowedSkewWindows { get; set; } = 1;
}
