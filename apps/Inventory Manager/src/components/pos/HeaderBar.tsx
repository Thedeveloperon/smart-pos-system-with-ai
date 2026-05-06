import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Package, Receipt, Settings, ShoppingCart, Tag } from "lucide-react";

type Props = {
  onBack?: () => void;
  onInventory?: () => void;
  onReports?: () => void;
  onManager?: () => void;
  onPromotions?: () => void;
  onPurchases?: () => void;
  inventoryAlertCount?: number;
};

export default function HeaderBar({
  onBack,
  onInventory,
  onReports,
  onManager,
  onPromotions,
  onPurchases,
  inventoryAlertCount = 0,
}: Props) {
  return (
    <header className="border-b border-white/10 bg-pos-header text-pos-header-foreground shadow-md">
      <div className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {onBack && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onBack}
                aria-label="Back to POS"
                className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="ml-1">Back</span>
              </Button>
              <div className="h-4 w-px bg-white/15" />
            </>
          )}
          <Receipt className="h-5 w-5" />
          <span className="font-semibold">Inventory Manager</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReports}
            className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
          >
            <Receipt className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Reports</span>
          </Button>
          {onInventory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onInventory}
              className="relative text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
            >
              <Package className="h-4 w-4" />
              <span className="hidden md:inline ml-1">Inventory</span>
              {inventoryAlertCount > 0 && (
                <Badge className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center border-0 bg-destructive px-1 text-[10px] text-destructive-foreground">
                  {inventoryAlertCount}
                </Badge>
              )}
            </Button>
          )}
          {onPurchases && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPurchases}
              className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
            >
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden md:inline ml-1">Purchases</span>
            </Button>
          )}
          {onPromotions && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPromotions}
              className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
            >
              <Tag className="h-4 w-4" />
              <span className="hidden md:inline ml-1">Promotions</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onManager}
            className="text-pos-header-foreground/80 hover:bg-white/10 hover:text-pos-header-foreground"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Manager</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
