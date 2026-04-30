import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import PosHome from "@/pages/PosHome";
import InventoryPage from "@/pages/InventoryPage";
import ReportsPage from "@/pages/ReportsPage";
import ManagerPage from "@/pages/ManagerPage";
import { navigateBackToPos } from "@/lib/navigation";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const [view, setView] = useState<"pos" | "inventory" | "reports" | "manager">("inventory");

  if (view === "inventory") return <InventoryPage onBack={() => setView("pos")} />;
  if (view === "reports") return <ReportsPage onBack={() => setView("pos")} />;
  if (view === "manager") return <ManagerPage onBack={() => setView("pos")} />;
  return (
    <PosHome
      onBack={navigateBackToPos}
      onOpenInventory={() => setView("inventory")}
      onOpenReports={() => setView("reports")}
      onOpenManager={() => setView("manager")}
    />
  );
}
