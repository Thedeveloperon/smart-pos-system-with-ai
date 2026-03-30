import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PauseCircle,
  Clock,
  LogOut,
  User,
  ShoppingBag,
  FileText,
  Lock,
  PlusCircle,
  Upload,
} from "lucide-react";

interface HeaderBarProps {
  cashierName: string;
  heldBillsCount: number;
  onHeldBills: () => void;
  onTodaySales: () => void;
  onNewItem: () => void;
  onImportSupplierBill: () => void;
  onSignOut: () => void;
  onAuditLog?: () => void;
  onEndShift?: () => void;
  isAdmin?: boolean;
  hasActiveSession?: boolean;
}

const HeaderBar = ({
  cashierName,
  heldBillsCount,
  onHeldBills,
  onTodaySales,
  onNewItem,
  onImportSupplierBill,
  onSignOut,
  onAuditLog,
  onEndShift,
  isAdmin = false,
  hasActiveSession = false,
}: HeaderBarProps) => {
  return (
    <header className="bg-pos-header text-pos-header-foreground h-14 flex items-center justify-between px-4 gap-3 shrink-0">
      <div className="flex items-center gap-3">
        <ShoppingBag className="h-6 w-6 text-primary" />
        <h1 className="text-lg font-bold tracking-tight hidden sm:block">
          SmartPOS Lanka
        </h1>
        <h1 className="text-lg font-bold tracking-tight sm:hidden">POS</h1>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onHeldBills}
          className="text-pos-header-foreground hover:bg-pos-header-foreground/10 relative"
        >
          <PauseCircle className="h-4 w-4" />
          <span className="hidden md:inline ml-1">Held</span>
          {heldBillsCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] bg-warning text-warning-foreground">
              {heldBillsCount}
            </Badge>
          )}
        </Button>

        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewItem}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <PlusCircle className="h-4 w-4" />
            <span className="hidden md:inline ml-1">New Item</span>
          </Button>
        )}

        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onTodaySales}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Today</span>
          </Button>
        )}

        {onAuditLog && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAuditLog}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Audit</span>
          </Button>
        )}

        {hasActiveSession && onEndShift && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEndShift}
            className="text-pos-header-foreground hover:bg-destructive/20 hover:text-destructive"
          >
            <Lock className="h-4 w-4" />
            <span className="hidden md:inline ml-1">End Shift</span>
          </Button>
        )}

        {isAdmin && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onImportSupplierBill}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <Upload className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Import Bill</span>
          </Button>
        )}

        <div className="h-6 w-px bg-pos-header-foreground/20 mx-1 hidden sm:block" />

        <div className="flex items-center gap-2 text-sm text-pos-header-foreground/80">
          <User className="h-4 w-4" />
          <span className="hidden lg:inline">{cashierName}</span>
        </div>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onSignOut}
          className="text-pos-header-foreground hover:bg-destructive/20 hover:text-destructive"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
};

export default HeaderBar;
