import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type AiInsightsFabProps = {
  onClick: () => void;
};

const AiInsightsFab = ({ onClick }: AiInsightsFabProps) => (
  <div className="pointer-events-none fixed bottom-[5.25rem] right-4 z-40 md:bottom-20 md:right-6">
    <Button
      type="button"
      onClick={onClick}
      size="icon"
      className="pointer-events-auto relative h-14 w-14 rounded-full border border-primary/40 bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
      title="Open AI assistant (Alt + A)"
      aria-label="Open AI assistant"
    >
      <MessageCircle className="h-6 w-6" />
      <span className="absolute -right-0.5 -top-0.5 h-4 w-4 rounded-full border-2 border-background bg-success" />
    </Button>
  </div>
);

export default AiInsightsFab;
