namespace SmartPos.Backend.Security;

public sealed class AuthSecurityOptions
{
    public const string SectionName = "AuthSecurity";

    public bool RequireMfaForSuperAdmins { get; set; } = true;
    public bool ResetSeedUserPasswordsOnStartup { get; set; } = false;
    public int TotpStepSeconds { get; set; } = 30;
    public int TotpAllowedSkewWindows { get; set; } = 1;
    public int ImpossibleTravelLookbackMinutes { get; set; } = 30;
    public int ConcurrentDeviceWindowMinutes { get; set; } = 15;
    public int ConcurrentDeviceThreshold { get; set; } = 3;
    public int ConcurrentSourceThreshold { get; set; } = 2;
    public bool EnableLoginLockout { get; set; } = true;
    public int MaxFailedLoginAttempts { get; set; } = 5;
    public int FailedLoginAttemptWindowMinutes { get; set; } = 15;
    public int LockoutDurationMinutes { get; set; } = 15;
    public int FailureThrottleDelayMilliseconds { get; set; } = 300;
    public bool EnforceSessionRevocation { get; set; } = true;
}
