namespace SmartPos.Backend.Security;

public static class SmartPosRoles
{
    public const string Owner = "owner";
    public const string Manager = "manager";
    public const string Cashier = "cashier";
    public const string SuperAdmin = "super_admin";
    public const string Support = "support";
    public const string BillingAdmin = "billing_admin";
    public const string SecurityAdmin = "security_admin";

    public static readonly string[] SuperAdminRoles =
    [
        SuperAdmin,
        Support,
        BillingAdmin,
        SecurityAdmin
    ];

    public static bool IsSuperAdminRole(string? role)
    {
        return !string.IsNullOrWhiteSpace(role) &&
               SuperAdminRoles.Contains(role.Trim().ToLowerInvariant(), StringComparer.Ordinal);
    }
}

public static class SmartPosPolicies
{
    public const string ManagerOrOwner = "manager_or_owner";
    public const string SuperAdmin = "super_admin";
    public const string SuperAdminOperator = "super_admin_operator";
    public const string SupportOperator = "support_operator";
    public const string SupportOrSecurity = "support_or_security";
    public const string SupportOrBilling = "support_or_billing";
    public const string BillingOrSecurity = "billing_or_security";
    public const string BillingApprover = "billing_approver";
}
