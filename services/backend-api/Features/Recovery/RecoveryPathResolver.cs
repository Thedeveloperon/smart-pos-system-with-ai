namespace SmartPos.Backend.Features.Recovery;

internal static class RecoveryPathResolver
{
    public static string ResolveRepositoryRoot(string contentRootPath)
    {
        var current = new DirectoryInfo(Path.GetFullPath(contentRootPath));
        while (current is not null)
        {
            if (Directory.Exists(Path.Combine(current.FullName, "scripts", "backup")))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return Path.GetFullPath(Path.Combine(contentRootPath, ".."));
    }
}
