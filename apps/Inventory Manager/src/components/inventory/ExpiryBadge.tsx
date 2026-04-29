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
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{days}d left</Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-green-700 border-green-300">
      {days}d left
    </Badge>
  );
}
