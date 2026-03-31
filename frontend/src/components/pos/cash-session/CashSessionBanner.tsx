import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Clock } from "lucide-react";
import { useCashSession } from "./CashSessionContext";

interface CashSessionBannerProps {
  onEndShift: () => void;
}

const CashSessionBanner = ({ onEndShift }: CashSessionBannerProps) => {
  const { session } = useCashSession();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!session || session.status === "closed") {
      return;
    }

    let intervalId: number | undefined;
    const tick = () => setNowMs(Date.now());
    const delayToNextSecond = 1000 - (Date.now() % 1000);
    const timeoutId = window.setTimeout(() => {
      tick();
      intervalId = window.setInterval(tick, 1000);
    }, delayToNextSecond);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [session]);

  if (!session || session.status === "closed") return null;

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - session.openedAt.getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const mins = Math.floor((elapsedSeconds % 3600) / 60);
  const secs = elapsedSeconds % 60;
  const elapsedLabel = `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

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
          <span className="inline-block w-[8ch] tabular-nums font-mono text-left">
            {elapsedLabel}
          </span>
        </span>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground">
          Opening:{" "}
          <span className="font-medium text-foreground tabular-nums">
            Rs. {session.opening.total.toLocaleString()}
          </span>
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
