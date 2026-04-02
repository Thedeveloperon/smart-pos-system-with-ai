namespace SmartPos.Backend.Security;

public sealed class AuthSecurityOptions
{
    public const string SectionName = "AuthSecurity";

    public bool RequireMfaForSuperAdmins { get; set; } = true;
    public int TotpStepSeconds { get; set; } = 30;
    public int TotpAllowedSkewWindows { get; set; } = 1;
    public int ImpossibleTravelLookbackMinutes { get; set; } = 30;
    public int ConcurrentDeviceWindowMinutes { get; set; } = 15;
    public int ConcurrentDeviceThreshold { get; set; } = 3;
    public int ConcurrentSourceThreshold { get; set; } = 2;
}
