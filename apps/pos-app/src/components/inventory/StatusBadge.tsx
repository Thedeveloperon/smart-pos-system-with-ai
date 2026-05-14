import { type WarrantyClaim } from "@/lib/api";

const STYLES: Record<WarrantyClaim["status"], { label: string; cls: string }> = {
  Open: {
    label: "Open",
    cls: "bg-status-open-bg text-status-open ring-1 ring-inset ring-status-open/20",
  },
  InRepair: {
    label: "In Repair",
    cls: "bg-status-repair-bg text-status-repair ring-1 ring-inset ring-status-repair/20",
  },
  Resolved: {
    label: "Resolved",
    cls: "bg-status-resolved text-brand-foreground",
  },
  Rejected: {
    label: "Rejected",
    cls: "bg-status-rejected text-brand-foreground",
  },
};

export function StatusBadge({ status }: { status: WarrantyClaim["status"] }) {
  const s = STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
