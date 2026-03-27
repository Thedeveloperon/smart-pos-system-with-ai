namespace SmartPos.Backend.Security;

public static class SmartPosRoles
{
    public const string Owner = "owner";
    public const string Manager = "manager";
    public const string Cashier = "cashier";
}

public static class SmartPosPolicies
{
    public const string ManagerOrOwner = "manager_or_owner";
}
