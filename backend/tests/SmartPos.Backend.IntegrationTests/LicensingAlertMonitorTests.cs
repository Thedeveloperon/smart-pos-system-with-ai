using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SmartPos.Backend.Features.Licensing;

namespace SmartPos.Backend.IntegrationTests;

public sealed class LicensingAlertMonitorTests
{
    [Fact]
    public void EvaluateAndEmitAlerts_WhenValidationFailuresSpike_ShouldLogWarning()
    {
        var sink = new LogSink();
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddProvider(new SinkLoggerProvider(sink)));

        var monitor = new LicensingAlertMonitor(
            Options.Create(new LicenseOptions
            {
                Alerts = new LicenseAlertOptions
                {
                    Enabled = true,
                    LicenseValidationSpikeThreshold = 2,
                    WebhookFailureThreshold = 99,
                    WindowMinutes = 10,
                    CooldownMinutes = 1,
                    EvaluationIntervalSeconds = 30
                }
            }),
            loggerFactory.CreateLogger<LicensingAlertMonitor>());

        monitor.RecordLicenseValidationFailure("INVALID_LICENSE_TOKEN");
        monitor.RecordLicenseValidationFailure("DEVICE_MISMATCH");
        monitor.EvaluateAndEmitAlerts();

        Assert.Contains(
            sink.WarningMessages,
            message => message.Contains("License validation failure spike detected", StringComparison.Ordinal));
    }

    [Fact]
    public void EvaluateAndEmitAlerts_WhenWebhookFailuresSpike_ShouldLogWarning()
    {
        var sink = new LogSink();
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddProvider(new SinkLoggerProvider(sink)));

        var monitor = new LicensingAlertMonitor(
            Options.Create(new LicenseOptions
            {
                Alerts = new LicenseAlertOptions
                {
                    Enabled = true,
                    LicenseValidationSpikeThreshold = 99,
                    WebhookFailureThreshold = 2,
                    WindowMinutes = 10,
                    CooldownMinutes = 1,
                    EvaluationIntervalSeconds = 30
                }
            }),
            loggerFactory.CreateLogger<LicensingAlertMonitor>());

        monitor.RecordWebhookFailure("invoice.payment_failed", "signature_invalid");
        monitor.RecordWebhookFailure("invoice.payment_failed", "signature_invalid");
        monitor.EvaluateAndEmitAlerts();

        Assert.Contains(
            sink.WarningMessages,
            message => message.Contains("Billing webhook failure spike detected", StringComparison.Ordinal));
    }

    private sealed class LogSink
    {
        private readonly List<string> warningMessages = [];

        public IReadOnlyList<string> WarningMessages => warningMessages;

        public void Add(LogLevel level, string message)
        {
            if (level < LogLevel.Warning)
            {
                return;
            }

            warningMessages.Add(message);
        }
    }

    private sealed class SinkLoggerProvider(LogSink sink) : ILoggerProvider
    {
        public ILogger CreateLogger(string categoryName)
        {
            return new SinkLogger(sink);
        }

        public void Dispose()
        {
        }
    }

    private sealed class SinkLogger(LogSink sink) : ILogger
    {
        public IDisposable BeginScope<TState>(TState state)
            where TState : notnull
        {
            return NoopScope.Instance;
        }

        public bool IsEnabled(LogLevel logLevel)
        {
            return true;
        }

        public void Log<TState>(
            LogLevel logLevel,
            EventId eventId,
            TState state,
            Exception? exception,
            Func<TState, Exception?, string> formatter)
        {
            sink.Add(logLevel, formatter(state, exception));
        }
    }

    private sealed class NoopScope : IDisposable
    {
        public static NoopScope Instance { get; } = new();

        public void Dispose()
        {
        }
    }
}
