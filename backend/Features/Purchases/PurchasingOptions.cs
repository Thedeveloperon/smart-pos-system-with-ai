namespace SmartPos.Backend.Features.Purchases;

public sealed class PurchasingOptions
{
    public const string SectionName = "Purchasing";

    public bool EnableOcrImport { get; set; } = true;
    public string OcrProvider { get; set; } = "openai";
    public string TesseractCommand { get; set; } = "tesseract";
    public string TesseractLanguage { get; set; } = "eng";
    public int TesseractPageSegMode { get; set; } = 6;
    public long MaxFileSizeBytes { get; set; } = 10 * 1024 * 1024;
    public int MaxPdfPages { get; set; } = 20;
    public int OcrTimeoutMs { get; set; } = 8000;
    public int OcrRetryCount { get; set; } = 2;
    public int OcrCircuitBreakerFailureThreshold { get; set; } = 4;
    public int OcrCircuitBreakerOpenSeconds { get; set; } = 45;
    public string OpenAiApiBaseUrl { get; set; } = string.Empty;
    public string OpenAiModel { get; set; } = "gpt-4.1-mini";
    public int OpenAiMaxOutputTokens { get; set; } = 2200;
    public decimal LowConfidenceThreshold { get; set; } = 0.75m;
    public decimal FuzzyMatchThreshold { get; set; } = 0.72m;
    public decimal TotalsToleranceAmount { get; set; } = 2.00m;
    public bool UpdateCostPriceOnImport { get; set; } = true;
}
