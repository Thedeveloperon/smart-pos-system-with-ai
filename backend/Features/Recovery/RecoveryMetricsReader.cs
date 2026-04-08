using System.Text.Json;

namespace SmartPos.Backend.Features.Recovery;

internal static class RecoveryMetricsReader
{
    public static RecoveryRestoreMetricRecord? ReadLastMetric(string metricsFilePath)
    {
        if (!File.Exists(metricsFilePath))
        {
            return null;
        }

        string? lastLine = null;
        foreach (var line in File.ReadLines(metricsFilePath))
        {
            if (!string.IsNullOrWhiteSpace(line))
            {
                lastLine = line;
            }
        }

        if (string.IsNullOrWhiteSpace(lastLine))
        {
            return null;
        }

        try
        {
            return JsonSerializer.Deserialize<RecoveryRestoreMetricRecord>(lastLine);
        }
        catch
        {
            return null;
        }
    }
}
