namespace SmartPos.Backend.Features.AiChat.IntentPipeline;

public interface IAiChatGroundingHandler
{
    IReadOnlyCollection<AiChatIntentType> SupportedIntents { get; }

    Task<AiChatGroundingResult> BuildAsync(
        AiChatGroundingHandlerContext context,
        CancellationToken cancellationToken);
}
