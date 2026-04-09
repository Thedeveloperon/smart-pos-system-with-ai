using System.ComponentModel;
using System.Diagnostics;
using System.Text;
using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Recovery;

public sealed class RecoveryOpsService(
    IOptions<RecoveryOpsOptions> optionsAccessor,
    IWebHostEnvironment environment,
    ILogger<RecoveryOpsService> logger)
{
    private const int OutputTailMaxLength = 4_000;
    private readonly RecoveryOpsOptions options = optionsAccessor.Value;
    private readonly string repoRootPath = Path.GetFullPath(Path.Combine(environment.ContentRootPath, ".."));

    public Task<RecoveryStatusResponse> GetStatusAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var scriptRoot = ResolveScriptRootPath();
        var backupRoot = ResolveBackupRootPath(null);
        var metricsFilePath = ResolveMetricsFilePath(null);

        return Task.FromResult(new RecoveryStatusResponse
        {
            GeneratedAt = DateTimeOffset.UtcNow,
            Enabled = options.Enabled,
            DryRun = options.DryRun,
            AllowCommandExecution = options.AllowCommandExecution,
            ScriptRootPath = scriptRoot,
            BackupRootPath = backupRoot,
            MetricsFilePath = metricsFilePath,
            LatestBackupFile = ResolveLatestBackupFile(backupRoot),
            LastRestoreMetric = RecoveryMetricsReader.ReadLastMetric(metricsFilePath),
            DrillHealth = RecoveryDrillHealthEvaluator.Evaluate(options, metricsFilePath, DateTimeOffset.UtcNow)
        });
    }

    public Task<RecoveryOperationResponse> RunPreflightAsync(
        RecoveryRunPreflightRequest? request,
        CancellationToken cancellationToken)
    {
        var normalizedRequest = request ?? new RecoveryRunPreflightRequest();
        var resolvedBackupRoot = ResolveBackupRootPath(normalizedRequest.BackupRoot);
        var environmentOverrides = BuildCommonOverrides(
            normalizedRequest.BackupMode,
            normalizedRequest.SqliteDbPath,
            resolvedBackupRoot,
            normalizedRequest.RestoreMode,
            metricsFile: null);

        return RunScriptAsync(
            operation: "preflight",
            scriptName: options.PreflightScriptName,
            args: [],
            environmentOverrides,
            resolvedBackupFile: null,
            cancellationToken);
    }

    public Task<RecoveryOperationResponse> RunBackupAsync(
        RecoveryRunBackupRequest? request,
        CancellationToken cancellationToken)
    {
        var normalizedRequest = request ?? new RecoveryRunBackupRequest();
        var resolvedBackupRoot = ResolveBackupRootPath(normalizedRequest.BackupRoot);
        var environmentOverrides = BuildCommonOverrides(
            normalizedRequest.BackupMode,
            normalizedRequest.SqliteDbPath,
            resolvedBackupRoot,
            restoreMode: null,
            metricsFile: null);
        if (!string.IsNullOrWhiteSpace(normalizedRequest.BackupTier))
        {
            environmentOverrides["BACKUP_TIER"] = normalizedRequest.BackupTier.Trim();
        }

        return RunScriptAsync(
            operation: "backup",
            scriptName: options.BackupScriptName,
            args: [],
            environmentOverrides,
            resolvedBackupFile: null,
            cancellationToken);
    }

    public Task<RecoveryOperationResponse> RunRestoreSmokeAsync(
        RecoveryRunRestoreSmokeRequest? request,
        CancellationToken cancellationToken)
    {
        var normalizedRequest = request ?? new RecoveryRunRestoreSmokeRequest();
        var backupRoot = ResolveBackupRootPath(normalizedRequest.BackupRoot);
        var metricsFilePath = ResolveMetricsFilePath(normalizedRequest.MetricsFile);
        var resolvedBackupFile = ResolveRestoreBackupFile(normalizedRequest.BackupFilePath, backupRoot);
        var environmentOverrides = BuildCommonOverrides(
            backupMode: null,
            sqliteDbPath: null,
            backupRoot: backupRoot,
            restoreMode: normalizedRequest.RestoreMode,
            metricsFile: metricsFilePath);

        return RunScriptAsync(
            operation: "restore_smoke",
            scriptName: options.RestoreSmokeScriptName,
            args: [resolvedBackupFile],
            environmentOverrides,
            resolvedBackupFile,
            cancellationToken);
    }

    private async Task<RecoveryOperationResponse> RunScriptAsync(
        string operation,
        string scriptName,
        IReadOnlyList<string> args,
        IReadOnlyDictionary<string, string> environmentOverrides,
        string? resolvedBackupFile,
        CancellationToken cancellationToken)
    {
        EnsureRecoveryEnabled();

        var scriptPath = ResolveScriptPath(scriptName);
        var shellCommand = string.IsNullOrWhiteSpace(options.ShellCommand)
            ? "bash"
            : options.ShellCommand.Trim();
        var startedAt = DateTimeOffset.UtcNow;
        var commandPreview = BuildCommandPreview(shellCommand, scriptPath, args);

        if (options.DryRun)
        {
            return new RecoveryOperationResponse
            {
                Operation = operation,
                Status = "completed",
                StartedAt = startedAt,
                CompletedAt = DateTimeOffset.UtcNow,
                DurationMs = 0,
                Command = commandPreview,
                ExitCode = 0,
                Message = "Dry-run mode enabled. Command was not executed.",
                OutputTail = null,
                ResolvedBackupFile = resolvedBackupFile
            };
        }

        if (!options.AllowCommandExecution)
        {
            throw new RecoveryException(
                RecoveryErrorCodes.RecoveryExecutionDisabled,
                "Recovery command execution is disabled by configuration.",
                StatusCodes.Status409Conflict);
        }

        var timeoutSeconds = Math.Clamp(options.CommandTimeoutSeconds, 30, 7_200);
        var timeout = TimeSpan.FromSeconds(timeoutSeconds);
        var startInfo = new ProcessStartInfo
        {
            FileName = shellCommand,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = repoRootPath
        };

        startInfo.ArgumentList.Add(scriptPath);
        foreach (var arg in args)
        {
            startInfo.ArgumentList.Add(arg);
        }

        foreach (var (key, value) in environmentOverrides)
        {
            startInfo.Environment[key] = value;
        }

        using var process = new Process { StartInfo = startInfo };

        try
        {
            process.Start();
        }
        catch (Exception ex) when (ex is Win32Exception or FileNotFoundException)
        {
            throw new RecoveryException(
                RecoveryErrorCodes.ShellUnavailable,
                $"Shell command '{shellCommand}' is not available on this host.",
                StatusCodes.Status500InternalServerError);
        }

        var stdOutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
        var stdErrTask = process.StandardError.ReadToEndAsync(cancellationToken);

        using var timeoutCts = new CancellationTokenSource(timeout);
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        try
        {
            await process.WaitForExitAsync(linkedCts.Token);
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            TryKillProcess(process);
            throw new RecoveryException(
                RecoveryErrorCodes.ProcessTimeout,
                $"Recovery operation timed out after {timeoutSeconds} seconds.",
                StatusCodes.Status504GatewayTimeout);
        }

        var stdOut = await stdOutTask;
        var stdErr = await stdErrTask;
        var output = BuildOutput(stdOut, stdErr);
        var completedAt = DateTimeOffset.UtcNow;

        if (process.ExitCode != 0)
        {
            logger.LogWarning(
                "Recovery operation '{Operation}' failed with exit code {ExitCode}.",
                operation,
                process.ExitCode);

            throw new RecoveryException(
                RecoveryErrorCodes.ProcessFailed,
                $"Recovery operation '{operation}' failed with exit code {process.ExitCode}. Output: {CreateOutputTail(output)}",
                StatusCodes.Status500InternalServerError);
        }

        return new RecoveryOperationResponse
        {
            Operation = operation,
            Status = "completed",
            StartedAt = startedAt,
            CompletedAt = completedAt,
            DurationMs = Convert.ToInt64((completedAt - startedAt).TotalMilliseconds),
            Command = commandPreview,
            ExitCode = process.ExitCode,
            Message = $"Recovery operation '{operation}' completed successfully.",
            OutputTail = CreateOutputTail(output),
            ResolvedBackupFile = resolvedBackupFile
        };
    }

    private void EnsureRecoveryEnabled()
    {
        if (!options.Enabled)
        {
            throw new RecoveryException(
                RecoveryErrorCodes.RecoveryDisabled,
                "Recovery operations are disabled by configuration.",
                StatusCodes.Status404NotFound);
        }
    }

    private string ResolveRestoreBackupFile(string? requestedBackupFilePath, string backupRoot)
    {
        if (!string.IsNullOrWhiteSpace(requestedBackupFilePath))
        {
            var candidate = ToAbsolutePath(requestedBackupFilePath.Trim());
            if (!File.Exists(candidate))
            {
                throw new RecoveryException(
                    RecoveryErrorCodes.BackupFileNotFound,
                    $"Backup file was not found: {candidate}",
                    StatusCodes.Status404NotFound);
            }

            return candidate;
        }

        var latest = ResolveLatestBackupFile(backupRoot);
        if (string.IsNullOrWhiteSpace(latest))
        {
            throw new RecoveryException(
                RecoveryErrorCodes.BackupFileNotFound,
                "No backup archive was found under backup_root.",
                StatusCodes.Status404NotFound);
        }

        return latest;
    }

    private string ResolveScriptPath(string scriptName)
    {
        var trimmedScriptName = string.IsNullOrWhiteSpace(scriptName)
            ? throw new RecoveryException(
                RecoveryErrorCodes.InvalidRequest,
                "Recovery script name is not configured.",
                StatusCodes.Status500InternalServerError)
            : scriptName.Trim();

        var scriptPath = Path.GetFullPath(Path.Combine(ResolveScriptRootPath(), trimmedScriptName));
        if (!File.Exists(scriptPath))
        {
            throw new RecoveryException(
                RecoveryErrorCodes.ScriptNotFound,
                $"Recovery script was not found: {scriptPath}",
                StatusCodes.Status500InternalServerError);
        }

        return scriptPath;
    }

    private string ResolveScriptRootPath()
    {
        var configured = options.ScriptRootPath;
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return ToAbsolutePath(configured.Trim());
        }

        return Path.GetFullPath(Path.Combine(repoRootPath, "scripts", "backup"));
    }

    private string ResolveBackupRootPath(string? requestBackupRoot)
    {
        if (!string.IsNullOrWhiteSpace(requestBackupRoot))
        {
            return ToAbsolutePath(requestBackupRoot.Trim());
        }

        if (!string.IsNullOrWhiteSpace(options.BackupRootPath))
        {
            return ToAbsolutePath(options.BackupRootPath.Trim());
        }

        return Path.GetFullPath(Path.Combine(repoRootPath, "backups"));
    }

    private string ResolveMetricsFilePath(string? requestMetricsFile)
    {
        if (!string.IsNullOrWhiteSpace(requestMetricsFile))
        {
            return ToAbsolutePath(requestMetricsFile.Trim());
        }

        if (!string.IsNullOrWhiteSpace(options.MetricsFilePath))
        {
            return ToAbsolutePath(options.MetricsFilePath.Trim());
        }

        return Path.GetFullPath(Path.Combine(repoRootPath, "backups", "metrics", "restore_metrics.jsonl"));
    }

    private Dictionary<string, string> BuildCommonOverrides(
        string? backupMode,
        string? sqliteDbPath,
        string? backupRoot,
        string? restoreMode,
        string? metricsFile)
    {
        var environmentOverrides = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(backupMode))
        {
            environmentOverrides["BACKUP_MODE"] = backupMode.Trim();
        }

        if (!string.IsNullOrWhiteSpace(sqliteDbPath))
        {
            environmentOverrides["SQLITE_DB_PATH"] = ToAbsolutePath(sqliteDbPath.Trim());
        }

        if (!string.IsNullOrWhiteSpace(backupRoot))
        {
            environmentOverrides["BACKUP_ROOT"] = ToAbsolutePath(backupRoot.Trim());
        }

        if (!string.IsNullOrWhiteSpace(restoreMode))
        {
            environmentOverrides["RESTORE_MODE"] = restoreMode.Trim();
        }

        if (!string.IsNullOrWhiteSpace(metricsFile))
        {
            environmentOverrides["METRICS_FILE"] = ToAbsolutePath(metricsFile.Trim());
        }

        return environmentOverrides;
    }

    private string ToAbsolutePath(string path)
    {
        if (Path.IsPathRooted(path))
        {
            return Path.GetFullPath(path);
        }

        return Path.GetFullPath(Path.Combine(repoRootPath, path));
    }

    private static string? ResolveLatestBackupFile(string backupRoot)
    {
        if (!Directory.Exists(backupRoot))
        {
            return null;
        }

        var latest = Directory.EnumerateFiles(backupRoot, "*", SearchOption.AllDirectories)
            .Where(IsBackupArchive)
            .Select(path => new FileInfo(path))
            .OrderByDescending(file => file.LastWriteTimeUtc)
            .FirstOrDefault();

        return latest?.FullName;
    }

    private static bool IsBackupArchive(string path)
    {
        return path.EndsWith(".tar.gz", StringComparison.OrdinalIgnoreCase) ||
               path.EndsWith(".tar.gz.enc", StringComparison.OrdinalIgnoreCase);
    }

    private static string BuildCommandPreview(string shellCommand, string scriptPath, IReadOnlyList<string> args)
    {
        var builder = new StringBuilder();
        builder.Append(shellCommand);
        builder.Append(' ');
        builder.Append(scriptPath);
        foreach (var arg in args)
        {
            builder.Append(' ');
            builder.Append(arg);
        }

        return builder.ToString();
    }

    private static string BuildOutput(string stdOut, string stdErr)
    {
        var builder = new StringBuilder();
        if (!string.IsNullOrWhiteSpace(stdOut))
        {
            builder.Append(stdOut.Trim());
        }

        if (!string.IsNullOrWhiteSpace(stdErr))
        {
            if (builder.Length > 0)
            {
                builder.AppendLine();
            }

            builder.Append(stdErr.Trim());
        }

        return builder.ToString();
    }

    private static string? CreateOutputTail(string? output)
    {
        if (string.IsNullOrWhiteSpace(output))
        {
            return null;
        }

        return output.Length <= OutputTailMaxLength
            ? output
            : output[^OutputTailMaxLength..];
    }

    private static void TryKillProcess(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch
        {
            // best effort
        }
    }
}
