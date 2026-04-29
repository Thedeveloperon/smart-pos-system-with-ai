import { Badge } from "@/components/ui/badge";

type Props = { expiryDate?: string };

export default function ExpiryBadge({ expiryDate }: Props) {
  if (!expiryDate) {
    return <Badge variant="secondary">No expiry</Badge>;
  }
  const days = Math.round((new Date(expiryDate).getTime() - Date.now()) / 86400000);
  if (days <= 7) {
    return <Badge variant="destructive">{days <= 0 ? "Expired" : `${days}d left`}</Badge>;
  }
  if (days <= 30) {
    return <Badge className="bg-warning/15 text-warning-foreground hover:bg-warning/15">{days}d left</Badge>;
  }
  return (
    <Badge variant="outline" className="text-success border-success/30">
      {days}d left
    </Badge>
  );
}
