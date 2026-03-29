import { Button } from "@/components/ui/button";
import { Shield, Lock, Clock } from "lucide-react";
import { useCashSession } from "./CashSessionContext";

interface CashSessionBannerProps {
  onEndShift: () => void;
}

const CashSessionBanner = ({ onEndShift }: CashSessionBannerProps) => {
  const { session } = useCashSession();

  if (!session || session.status === "closed") return null;

  const elapsed = Math.floor((Date.now() - session.openedAt.getTime()) / 60000);
  const hours = Math.floor(elapsed / 60);
  const mins = elapsed % 60;

  return (
    <div className="bg-accent/60 border-b border-accent px-4 py-1.5 flex items-center justify-between text-xs">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-success font-semibold">
          <Shield className="h-3.5 w-3.5" />
          <span>Session Active</span>
        </div>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {hours > 0 ? `${hours}h ${mins}m` : `${mins}m`}
        </span>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground">
          Opening: <span className="font-medium text-foreground">Rs. {session.opening.total.toLocaleString()}</span>
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-6 text-xs rounded-lg gap-1 border-destructive/30 text-destructive hover:bg-destructive/10"
        onClick={onEndShift}
      >
        <Lock className="h-3 w-3" />
        End Shift
      </Button>
    </div>
  );
};

export default CashSessionBanner;
