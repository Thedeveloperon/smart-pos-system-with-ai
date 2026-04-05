import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

type AiInsightsFabProps = {
  onClick: () => void;
};

const AiInsightsFab = ({ onClick }: AiInsightsFabProps) => (
  <div className="pointer-events-none fixed bottom-[5.25rem] left-4 z-40 md:bottom-20 md:left-6">
    <Button
      type="button"
      onClick={onClick}
      size="icon"
      className="pointer-events-auto h-12 w-12 rounded-full shadow-lg"
      title="Open AI assistant (Alt + A)"
      aria-label="Open AI assistant"
    >
      <Sparkles className="h-5 w-5" />
    </Button>
  </div>
);

export default AiInsightsFab;
