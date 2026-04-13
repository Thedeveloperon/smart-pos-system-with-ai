import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageShellProps = {
  children: ReactNode;
  className?: string;
};

type SectionCardProps = {
  children: ReactNode;
  className?: string;
};

type StatusChipTone = "neutral" | "success" | "warning" | "info";

type StatusChipProps = {
  children: ReactNode;
  tone?: StatusChipTone;
  className?: string;
};

type DataTableWrapProps = {
  children: ReactNode;
  className?: string;
};

const toneClassByStatus: Record<StatusChipTone, string> = {
  neutral: "status-badge status-badge-neutral",
  success: "status-badge status-badge-success",
  warning: "status-badge status-badge-warning",
  info: "status-badge status-badge-info",
};

export function PageShell({ children, className }: PageShellProps) {
  return <main className={cn("app-shell px-4 py-10 md:py-12", className)}>{children}</main>;
}

export function SectionCard({ children, className }: SectionCardProps) {
  return <section className={cn("portal-surface space-y-4", className)}>{children}</section>;
}

export function StatusChip({ children, tone = "neutral", className }: StatusChipProps) {
  return <span className={cn(toneClassByStatus[tone], className)}>{children}</span>;
}

export function DataTableWrap({ children, className }: DataTableWrapProps) {
  return <div className={cn("rounded-2xl border border-border bg-card shadow-sm", className)}>{children}</div>;
}
