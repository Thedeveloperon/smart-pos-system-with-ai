import { useState } from "react";
import { ArrowRight, Upload, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import BulkImportDialog from "./BulkImportDialog";
import ShopImportWizard from "./ShopImportWizard";
import { type ImportEntityType } from "./importTemplates";

const QUICK_IMPORTS: { entityType: ImportEntityType; title: string; description: string }[] = [
  { entityType: "brand", title: "Brands", description: "Import brand master records." },
  { entityType: "category", title: "Categories", description: "Import category records." },
  { entityType: "product", title: "Products", description: "Import product catalog and stock." },
  { entityType: "customer", title: "Customers", description: "Import customer directory data." },
];

export default function BulkImportWorkspace() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entityType, setEntityType] = useState<ImportEntityType>("brand");

  return (
    <>
      <div className="mx-auto max-w-[1400px] space-y-6 px-6 py-6">
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-2xl font-semibold tracking-tight">Bulk Import</CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                  Import large datasets using CSV or Excel files.
                </CardDescription>
              </div>
              <Button type="button" className="gap-2" onClick={() => setWizardOpen(true)}>
                <UploadCloud className="h-4 w-4" />
                Import Shop Data
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {QUICK_IMPORTS.map((item) => (
                <button
                  key={item.entityType}
                  type="button"
                  className="cursor-pointer rounded-lg border p-4 text-left transition-all hover:shadow-md"
                  onClick={() => {
                    setEntityType(item.entityType);
                    setDialogOpen(true);
                  }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="grid h-9 w-9 place-items-center rounded-md bg-primary-soft text-primary">
                        <Upload className="h-4 w-4" />
                      </div>
                      <p className="mt-3 text-base font-medium">{item.title}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <ShopImportWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <BulkImportDialog open={dialogOpen} onOpenChange={setDialogOpen} entityType={entityType} onImportComplete={() => {}} />
    </>
  );
}
