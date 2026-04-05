import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type AiInsightsFabProps = {
  onClick: () => void;
  credits?: number | null;
};

const AiInsightsFab = ({ onClick, credits = null }: AiInsightsFabProps) => (
  <div className="pointer-events-none fixed bottom-[5.25rem] right-4 z-40 md:bottom-20 md:right-6">
    <Button
      type="button"
      onClick={onClick}
      className="pointer-events-auto relative h-12 rounded-full px-4 shadow-lg"
      title="Open AI assistant (Alt + A)"
      aria-label="Open AI assistant"
    >
      <Sparkles className="h-4 w-4" />
      <span className="ml-2 text-sm font-semibold">AI Assistant</span>
      {credits !== null && (
        <Badge className="absolute -right-2 -top-2 h-5 min-w-5 px-1 text-[10px]">
          {credits > 999 ? "999+" : credits.toFixed(0)}
        </Badge>
      )}
    </Button>
  </div>
);

export default AiInsightsFab;
