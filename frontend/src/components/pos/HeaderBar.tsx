import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PauseCircle,
  Clock,
  LogOut,
  User,
  FileText,
  Lock,
  PlusCircle,
  BarChart3,
  Upload,
  Settings2,
  PencilLine,
  Menu,
} from "lucide-react";

interface HeaderBarProps {
  cashierName: string;
  heldBillsCount: number;
  onHeldBills: () => void;
  onTodaySales: () => void;
  onNewItem: () => void;
  onManageProducts?: () => void;
  onReports?: () => void;
  onImportSupplierBill: () => void;
  onShopSettings?: () => void;
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
  onManageProducts,
  onReports,
  onImportSupplierBill,
  onShopSettings,
  onSignOut,
  onAuditLog,
  onEndShift,
  isAdmin = false,
  hasActiveSession = false,
}: HeaderBarProps) => {
  return (
    <header className="bg-pos-header text-pos-header-foreground h-14 flex items-center justify-between px-4 gap-3 shrink-0">
      <div className="flex items-center">
        <img src="/logo.png" alt="SmartPOS Lanka logo" className="h-10 w-auto object-contain" />
      </div>

      <div className="hidden xl:flex items-center gap-2">
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

        {isAdmin && onManageProducts && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onManageProducts}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <PencilLine className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Manage</span>
          </Button>
        )}

        {isAdmin && onReports && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReports}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Reports</span>
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

        {isAdmin && onShopSettings && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onShopSettings}
            className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden md:inline ml-1">Shop</span>
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

      <div className="flex xl:hidden items-center gap-2">
        <div className="h-6 w-px bg-pos-header-foreground/20 hidden sm:block" />

        <div className="flex items-center gap-2 text-sm text-pos-header-foreground/80">
          <User className="h-4 w-4" />
          <span className="hidden lg:inline">{cashierName}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-pos-header-foreground hover:bg-pos-header-foreground/10"
              aria-label="Open menu"
            >
              <Menu className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => onHeldBills()}>
              <PauseCircle className="mr-2 h-4 w-4" />
              Held
              {heldBillsCount > 0 && <Badge className="ml-auto h-5 min-w-5 px-1 text-[10px]">{heldBillsCount}</Badge>}
            </DropdownMenuItem>

            {isAdmin && (
              <DropdownMenuItem onSelect={() => onNewItem()}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Item
              </DropdownMenuItem>
            )}

            {isAdmin && onManageProducts && (
              <DropdownMenuItem onSelect={() => onManageProducts()}>
                <PencilLine className="mr-2 h-4 w-4" />
                Manage
              </DropdownMenuItem>
            )}

            {isAdmin && onReports && (
              <DropdownMenuItem onSelect={() => onReports()}>
                <BarChart3 className="mr-2 h-4 w-4" />
                Reports
              </DropdownMenuItem>
            )}

            {isAdmin && (
              <DropdownMenuItem onSelect={() => onTodaySales()}>
                <Clock className="mr-2 h-4 w-4" />
                Today
              </DropdownMenuItem>
            )}

            {onAuditLog && (
              <DropdownMenuItem onSelect={() => onAuditLog()}>
                <FileText className="mr-2 h-4 w-4" />
                Audit
              </DropdownMenuItem>
            )}

            {hasActiveSession && onEndShift && (
              <DropdownMenuItem onSelect={() => onEndShift()}>
                <Lock className="mr-2 h-4 w-4" />
                End Shift
              </DropdownMenuItem>
            )}

            {isAdmin && (
              <DropdownMenuItem onSelect={() => onImportSupplierBill()}>
                <Upload className="mr-2 h-4 w-4" />
                Import Bill
              </DropdownMenuItem>
            )}

            {isAdmin && onShopSettings && (
              <DropdownMenuItem onSelect={() => onShopSettings()}>
                <Settings2 className="mr-2 h-4 w-4" />
                Shop
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => onSignOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default HeaderBar;
