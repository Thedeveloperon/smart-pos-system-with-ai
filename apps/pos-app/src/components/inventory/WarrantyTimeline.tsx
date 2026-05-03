import { Clock, Wrench, PackageCheck, XCircle, Check } from "lucide-react";
import { type WarrantyClaim } from "@/lib/api";

function formatDt(iso: string | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Variant = "warning" | "info" | "success" | "destructive" | "muted";

type Step = {
  key: string;
  title: string;
  date: string | undefined;
  details: string[];
  completed: boolean;
  variant: Variant;
  Icon: React.ElementType;
};

const CIRCLE_COLORS: Record<Variant, string> = {
  warning: "border-status-open bg-status-open-bg text-status-open",
  info: "border-status-repair bg-status-repair-bg text-status-repair",
  success: "border-status-resolved bg-status-resolved-bg text-status-resolved",
  destructive: "border-status-rejected bg-status-rejected-bg text-status-rejected",
  muted: "border-border bg-muted text-muted-foreground",
};

function buildSteps(claim: WarrantyClaim): Step[] {
  const steps: Step[] = [];

  steps.push({
    key: "opened",
    title: "Claim Opened",
    date: claim.claim_date,
    details:
      claim.resolution_notes && claim.status === "Open" ? [`Notes: ${claim.resolution_notes}`] : [],
    completed: true,
    variant: "warning",
    Icon: Clock,
  });

  const handoverDone = claim.status !== "Open" || !!claim.handover_date;
  steps.push({
    key: "handover",
    title: "Handed to Supplier",
    date: claim.handover_date,
    details: [
      claim.supplier_name ? `Supplier: ${claim.supplier_name}` : "",
      claim.pickup_person_name ? `Picked up by: ${claim.pickup_person_name}` : "",
    ].filter(Boolean),
    completed: handoverDone,
    variant: handoverDone ? "info" : "muted",
    Icon: Wrench,
  });

  const isRejected = claim.status === "Rejected";
  const receivedBackDone = !!claim.received_back_date || claim.status === "Resolved";
  if (!isRejected || receivedBackDone) {
    steps.push({
      key: "received_back",
      title: "Received Back by Shop",
      date: claim.received_back_date ?? (claim.status === "Resolved" ? claim.updated_at : undefined),
      details: claim.received_back_person_name ? [`Received by: ${claim.received_back_person_name}`] : [],
      completed: receivedBackDone,
      variant: receivedBackDone ? "success" : "muted",
      Icon: PackageCheck,
    });
  }

  if (isRejected) {
    steps.push({
      key: "rejected",
      title: "Rejected",
      date: claim.updated_at,
      details: claim.resolution_notes ? [`Reason: ${claim.resolution_notes}`] : [],
      completed: true,
      variant: "destructive",
      Icon: XCircle,
    });
    return steps;
  }

  const resolved = claim.status === "Resolved";
  steps.push({
    key: "resolved",
    title: "Resolved",
    date: resolved ? claim.updated_at : undefined,
    details: resolved && claim.resolution_notes ? [`Notes: ${claim.resolution_notes}`] : [],
    completed: resolved,
    variant: resolved ? "success" : "muted",
    Icon: resolved ? Check : PackageCheck,
  });

  return steps;
}

export function WarrantyTimeline({ claim }: { claim: WarrantyClaim }) {
  const steps = buildSteps(claim);

  return (
    <div className="flex flex-col">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${CIRCLE_COLORS[step.variant]}`}
              >
                <step.Icon className="h-4 w-4" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border my-1" />}
            </div>

            <div className="pb-5">
              <p className="text-sm font-semibold leading-8 text-foreground">{step.title}</p>
              <p className="text-xs text-muted-foreground">{formatDt(step.date)}</p>
              {step.details.map((line, i) => (
                <p key={i} className="text-xs text-foreground/80 mt-0.5">
                  {line}
                </p>
              ))}
              {!step.completed && (
                <p className="text-xs text-muted-foreground italic mt-0.5">Pending</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
