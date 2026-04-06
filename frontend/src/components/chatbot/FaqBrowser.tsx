import { useMemo, useState, type ElementType } from "react";
import {
  BarChart3,
  ChevronRight,
  DollarSign,
  Monitor,
  Package,
  TriangleAlert,
  Truck,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  posChatbotFaqCategories,
  type PosChatbotFaqCategory,
  type PosChatbotFaqQuestion,
} from "@/data/posChatbotFaq";

const iconMap: Record<string, ElementType> = {
  stock_inventory: Package,
  sales: TrendingUp,
  purchasing_suppliers: Truck,
  pricing_profit: DollarSign,
  customers: Users,
  cashier_operations: Monitor,
  alerts_exceptions: TriangleAlert,
  reports_summaries: BarChart3,
};

type FaqBrowserProps = {
  onSendQuestion: (question: string) => void;
  disabled?: boolean;
};

function buildQuestionWithPlaceholders(
  question: PosChatbotFaqQuestion,
  placeholderValues: Record<string, string>,
): string {
  let text = question.text;
  question.placeholders.forEach((placeholder) => {
    text = text.replace(`{${placeholder}}`, placeholderValues[placeholder]?.trim() || `{${placeholder}}`);
  });

  return text;
}

export function FaqBrowser({ onSendQuestion, disabled = false }: FaqBrowserProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(posChatbotFaqCategories[0]?.id ?? null);
  const [selectedQuestion, setSelectedQuestion] = useState<PosChatbotFaqQuestion | null>(null);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});

  const allPlaceholdersFilled = useMemo(
    () => selectedQuestion?.placeholders.every((placeholder) => placeholderValues[placeholder]?.trim()) ?? false,
    [placeholderValues, selectedQuestion],
  );

  const handleCategoryClick = (categoryId: PosChatbotFaqCategory["id"]) => {
    setExpandedCategory((previous) => (previous === categoryId ? null : categoryId));
    setSelectedQuestion(null);
    setPlaceholderValues({});
  };

  const handleQuestionClick = (question: PosChatbotFaqQuestion) => {
    if (disabled) {
      return;
    }

    if (question.placeholders.length === 0) {
      onSendQuestion(question.text);
      return;
    }

    setSelectedQuestion(question);
    setPlaceholderValues({});
  };

  const handleSendWithPlaceholders = () => {
    if (!selectedQuestion || disabled || !allPlaceholdersFilled) {
      return;
    }

    onSendQuestion(buildQuestionWithPlaceholders(selectedQuestion, placeholderValues));
    setSelectedQuestion(null);
    setPlaceholderValues({});
  };

  return (
    <ScrollArea className="h-[28rem] rounded-md border border-border/70 bg-muted/15">
      <div className="space-y-1 p-3">
        <div className="px-2 pb-2">
          <p className="text-sm font-medium text-foreground">FAQ Templates</p>
          <p className="text-xs text-muted-foreground">
            Pick a category, then send a ready-made question or fill in the placeholders.
          </p>
        </div>

        {posChatbotFaqCategories.map((category) => {
          const Icon = iconMap[category.id] ?? Package;
          const isExpanded = expandedCategory === category.id;

          return (
            <div key={category.id} className="rounded-lg border border-transparent">
              <button
                type="button"
                onClick={() => handleCategoryClick(category.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                  "hover:bg-primary/8",
                  isExpanded && "bg-primary/10 text-primary",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{category.label}</span>
                <ChevronRight className={cn("h-4 w-4 shrink-0 transition-transform", isExpanded && "rotate-90")} />
              </button>

              {isExpanded ? (
                <div className="space-y-1 px-2 pb-2 pl-4">
                  {category.questions.map((question) => {
                    const isSelected = selectedQuestion?.id === question.id;

                    return (
                      <div key={question.id} className="rounded-md">
                        <button
                          type="button"
                          onClick={() => handleQuestionClick(question)}
                          disabled={disabled}
                          className={cn(
                            "w-full rounded-md px-3 py-2 text-left text-xs transition-colors",
                            "hover:bg-primary/5 hover:text-foreground",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                            isSelected ? "bg-primary/10 font-medium text-primary" : "text-foreground/80",
                          )}
                        >
                          {question.text}
                        </button>

                        {isSelected && question.placeholders.length > 0 ? (
                          <div className="space-y-2 px-3 py-2">
                            {question.placeholders.map((placeholder) => (
                              <Input
                                key={placeholder}
                                value={placeholderValues[placeholder] || ""}
                                onChange={(event) =>
                                  setPlaceholderValues((previous) => ({
                                    ...previous,
                                    [placeholder]: event.target.value,
                                  }))
                                }
                                placeholder={`Enter ${placeholder}...`}
                                className="h-8 text-xs"
                                disabled={disabled}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && allPlaceholdersFilled) {
                                    handleSendWithPlaceholders();
                                  }
                                }}
                              />
                            ))}
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={handleSendWithPlaceholders}
                              disabled={!allPlaceholdersFilled || disabled}
                            >
                              Send Question
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
