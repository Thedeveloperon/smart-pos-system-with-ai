import { ShoppingBag, ShoppingCart, CreditCard } from "lucide-react";

type TabKey = "products" | "cart" | "checkout";

interface MobileTabBarProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  cartCount: number;
}

const MobileTabBar = ({ activeTab, onTabChange, cartCount }: MobileTabBarProps) => {
  const tabs = [
    { key: "products" as TabKey, icon: ShoppingBag, label: "Products" },
    { key: "cart" as TabKey, icon: ShoppingCart, label: "Cart" },
    { key: "checkout" as TabKey, icon: CreditCard, label: "Checkout" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border flex z-50 md:hidden pos-shadow-lg">
      {tabs.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          className={`flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors relative ${
            activeTab === key
              ? "text-primary"
              : "text-muted-foreground"
          }`}
          onClick={() => onTabChange(key)}
        >
          <div className="relative">
            <Icon className="h-5 w-5" />
            {key === "cart" && cartCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-primary text-primary-foreground text-[9px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium">{label}</span>
          {activeTab === key && (
            <div className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-b" />
          )}
        </button>
      ))}
    </div>
  );
};

export default MobileTabBar;
