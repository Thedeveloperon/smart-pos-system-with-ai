using System.ComponentModel;
using System.Diagnostics;
using System.Globalization;
using System.Text;
using Microsoft.Extensions.Options;

namespace SmartPos.Backend.Features.Purchases;

public sealed class TesseractOcrProvider(
    BasicTextOcrProvider basicTextProvider,
    IOptions<PurchasingOptions> options,
    ILogger<TesseractOcrProvider> logger) : IOcrProviderCore
{
    private static readonly HashSet<string> SupportedImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png",
        ".jpg",
        ".jpeg"
    };

    private static readonly HashSet<string> SupportedImageContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "image/png",
        "image/jpg",
        "image/jpeg"
    };

    public async Task<PurchaseOcrExtractionResult> ExtractAsync(BillFileData file, CancellationToken cancellationToken)
    {
        if (!IsImageFile(file))
        {
            return await basicTextProvider.ExtractAsync(file, cancellationToken);
        }

        var command = string.IsNullOrWhiteSpace(options.Value.TesseractCommand)
            ? "tesseract"
            : options.Value.TesseractCommand.Trim();
        var language = string.IsNullOrWhiteSpace(options.Value.TesseractLanguage)
            ? "eng"
            : options.Value.TesseractLanguage.Trim();
        var pageSegMode = Math.Clamp(options.Value.TesseractPageSegMode, 0, 13);

        var tempDirectory = Path.Combine(Path.GetTempPath(), $"smartpos-ocr-{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDirectory);

        var extension = ResolveImageExtension(file);
        var inputPath = Path.Combine(tempDirectory, $"input{extension}");
        var outputBasePath = Path.Combine(tempDirectory, "ocr-output");
        var outputTextPath = $"{outputBasePath}.txt";

        try
        {
            await File.WriteAllBytesAsync(inputPath, file.Bytes, cancellationToken);

            var startInfo = new ProcessStartInfo
            {
                FileName = command,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            startInfo.ArgumentList.Add(inputPath);
            startInfo.ArgumentList.Add(outputBasePath);
            startInfo.ArgumentList.Add("-l");
            startInfo.ArgumentList.Add(language);
            startInfo.ArgumentList.Add("--psm");
            startInfo.ArgumentList.Add(pageSegMode.ToString(CultureInfo.InvariantCulture));

            using var process = new Process { StartInfo = startInfo };

            try
            {
                process.Start();
            }
            catch (Exception exception) when (exception is Win32Exception or FileNotFoundException)
            {
                throw new OcrProviderUnavailableException(
                    $"Tesseract command '{command}' is not available. Install Tesseract or set Purchasing:OcrProvider to 'basic-text'.",
                    exception);
            }

            var stdOutTask = process.StandardOutput.ReadToEndAsync();
            var stdErrTask = process.StandardError.ReadToEndAsync();

            try
            {
                await process.WaitForExitAsync(cancellationToken);
            }
            catch (OperationCanceledException)
            {
                TryKillProcess(process);
                throw;
            }

            var stdOut = await stdOutTask;
            var stdErr = await stdErrTask;

            if (process.ExitCode != 0)
            {
                throw new OcrProviderUnavailableException(
                    $"Tesseract OCR failed with exit code {process.ExitCode}. {TrimProcessMessage(stdErr, stdOut)}");
            }

            if (!File.Exists(outputTextPath))
            {
                throw new OcrProviderUnavailableException(
                    "Tesseract OCR finished without generating a text output file.");
            }

            var extractedBytes = await File.ReadAllBytesAsync(outputTextPath, cancellationToken);
            var parsed = await basicTextProvider.ExtractAsync(
                new BillFileData(
                    FileName: Path.GetFileName(outputTextPath),
                    ContentType: "text/plain",
                    Bytes: extractedBytes),
                cancellationToken);

            parsed.ProviderName = "tesseract";
            if (string.IsNullOrWhiteSpace(parsed.RawText))
            {
                var rawText = Encoding.UTF8.GetString(extractedBytes);
                parsed.RawText = rawText.Length > 24_000 ? rawText[..24_000] : rawText;
            }

            return parsed;
        }
        catch (OcrProviderUnavailableException)
        {
            throw;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception)
        {
            logger.LogError(
                exception,
                "Unexpected Tesseract OCR failure for file {FileName}.",
                file.FileName);

            throw new OcrProviderUnavailableException(
                "Tesseract OCR failed unexpectedly. Switch this upload to manual review.",
                exception);
        }
        finally
        {
            TryDeleteDirectory(tempDirectory);
        }
    }

    private static bool IsImageFile(BillFileData file)
    {
        if (SupportedImageContentTypes.Contains(file.ContentType))
        {
            return true;
        }

        var extension = Path.GetExtension(file.FileName);
        return SupportedImageExtensions.Contains(extension);
    }

    private static string ResolveImageExtension(BillFileData file)
    {
        var extension = Path.GetExtension(file.FileName);
        if (SupportedImageExtensions.Contains(extension))
        {
            return extension;
        }

        return file.ContentType.ToLowerInvariant() switch
        {
            "image/png" => ".png",
            "image/jpg" => ".jpg",
            "image/jpeg" => ".jpeg",
            _ => ".png"
        };
    }

    private static string TrimProcessMessage(string stdErr, string stdOut)
    {
        var message = string.IsNullOrWhiteSpace(stdErr) ? stdOut : stdErr;
        if (string.IsNullOrWhiteSpace(message))
        {
            return "No additional output from Tesseract.";
        }

        var flattened = message.ReplaceLineEndings(" ").Trim();
        return flattened.Length > 220 ? $"{flattened[..220]}..." : flattened;
    }

    private static void TryDeleteDirectory(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch
        {
            // Best effort cleanup of temporary OCR files.
        }
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
            // Process may have already exited.
        }
    }
}
