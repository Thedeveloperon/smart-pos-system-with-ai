import { History, Wrench, Check, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "./StatusBadge";
import { type WarrantyClaim } from "@/lib/api";

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface Props {
  claims: WarrantyClaim[];
  onTimeline: (c: WarrantyClaim) => void;
  onReplace: (c: WarrantyClaim) => void;
  onHandover: (c: WarrantyClaim) => void;
  onResolve: (c: WarrantyClaim) => void;
  onReject: (c: WarrantyClaim) => void;
}

function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return (words[0]?.[0] ?? "?") + (words[1]?.[0] ?? "");
}

const AVATAR_GRADIENTS = [
  "from-violet-500 to-fuchsia-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-sky-500 to-indigo-500",
  "from-rose-500 to-pink-500",
  "from-lime-500 to-green-500",
];

function gradientFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function ClaimsTable({
  claims,
  onTimeline,
  onReplace,
  onHandover,
  onResolve,
  onReject,
}: Props) {
  if (claims.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-background py-16 text-center">
        <p className="text-sm text-muted-foreground">No claims match your filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,2.2fr)] gap-4 border-b border-border bg-muted/40 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <div>Product</div>
        <div>Claim Date</div>
        <div>Supplier</div>
        <div>Status</div>
        <div className="text-right">Actions</div>
      </div>

      <ul className="divide-y divide-border">
        {claims.map((c) => (
          <li
            key={c.id}
            className="grid grid-cols-[minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,2.2fr)] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${gradientFor(
                  c.id,
                )} text-xs font-semibold text-white`}
              >
                {initials(c.product_name).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{c.product_name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{c.serial_value}</p>
              </div>
            </div>

            <div className="text-sm text-foreground">{formatDate(c.claim_date)}</div>

            <div className="truncate text-sm text-foreground">
              {c.supplier_name ?? <span className="text-muted-foreground">—</span>}
            </div>

            <div>
              <StatusBadge status={c.status} />
            </div>

            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-foreground/70 hover:text-foreground"
                onClick={() => onTimeline(c)}
              >
                <History className="mr-1 h-4 w-4" />
                Timeline
              </Button>

              {c.status === "Open" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-brand hover:text-brand"
                  onClick={() => onReplace(c)}
                >
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Replace
                </Button>
              )}

              {c.status === "Open" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-status-repair hover:text-status-repair"
                  onClick={() => onHandover(c)}
                >
                  <Wrench className="mr-1 h-4 w-4" />
                  In Repair
                </Button>
              )}

              {c.status === "InRepair" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-status-resolved hover:text-status-resolved"
                  onClick={() => onResolve(c)}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Resolve
                </Button>
              )}

              {(c.status === "Open" || c.status === "InRepair") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-status-rejected hover:text-status-rejected"
                  onClick={() => onReject(c)}
                >
                  <XCircle className="mr-1 h-4 w-4" />
                  Reject
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
