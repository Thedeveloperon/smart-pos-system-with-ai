import { useState } from "react";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import BulkImportDialog from "./BulkImportDialog";
import { type ImportEntityType } from "./importTemplates";

const WIZARD_STEPS: { entityType: ImportEntityType; label: string; description: string }[] = [
  { entityType: "brand", label: "Brands", description: "Create brand master records first." },
  { entityType: "category", label: "Categories", description: "Add categories used by products." },
  { entityType: "product", label: "Products", description: "Import product catalog and stock values." },
  { entityType: "customer", label: "Customers", description: "Import your customer directory." },
];

type StepStatus = "pending" | "done" | "skipped";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAllComplete?: () => void;
};

export default function ShopImportWizard({ open, onOpenChange, onAllComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [statuses, setStatuses] = useState<StepStatus[]>(["pending", "pending", "pending", "pending"]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [finished, setFinished] = useState(false);

  const current = WIZARD_STEPS[currentIndex];

  function markCurrent(status: StepStatus) {
    setStatuses((previous) => previous.map((entry, index) => (index === currentIndex ? status : entry)));
  }

  function advance() {
    if (currentIndex < WIZARD_STEPS.length - 1) {
      setCurrentIndex((value) => value + 1);
      return;
    }

    setFinished(true);
    onAllComplete?.();
  }

  function resetAndClose() {
    setCurrentIndex(0);
    setStatuses(["pending", "pending", "pending", "pending"]);
    setImportDialogOpen(false);
    setFinished(false);
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open && !importDialogOpen} onOpenChange={(next) => (!next ? resetAndClose() : onOpenChange(true))}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Import Shop Data</DialogTitle>
            <DialogDescription>
              {finished
                ? "All steps complete."
                : "Follow the recommended import sequence. You can skip any step and continue."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {WIZARD_STEPS.map((step, index) => {
              const status = statuses[index];
              const isCurrent = !finished && index === currentIndex;
              return (
                <div
                  key={step.entityType}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3",
                    isCurrent && "border-primary bg-primary-soft ring-2 ring-primary/40",
                    status === "done" && "bg-muted/20",
                    !isCurrent && status === "pending" && "opacity-60",
                  )}
                >
                  <div className="grid h-8 w-8 place-items-center rounded-md">
                    {status === "done" ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : status === "skipped" ? (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    ) : isCurrent ? (
                      <ArrowRight className="h-5 w-5 text-primary" />
                    ) : (
                      <span className="text-sm text-muted-foreground">{index + 1}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", isCurrent && "text-primary")}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                  {status === "done" ? <span className="text-xs text-primary">Done</span> : null}
                  {status === "skipped" ? <span className="text-xs text-muted-foreground">Skipped</span> : null}
                </div>
              );
            })}
          </div>

          <Separator />

          <DialogFooter>
            {finished ? (
              <Button type="button" onClick={resetAndClose}>
                Close
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    markCurrent("skipped");
                    advance();
                  }}
                >
                  Skip {current.label}
                </Button>
                <Button type="button" onClick={() => setImportDialogOpen(true)}>
                  Import {current.label}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!finished ? (
        <BulkImportDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          entityType={current.entityType}
          onImportComplete={() => {
            markCurrent("done");
            setImportDialogOpen(false);
            advance();
          }}
        />
      ) : null}
    </>
  );
}
