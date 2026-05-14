import { useEffect, useMemo, useState, type ElementType } from "react";
import {
  BarChart3,
  ChevronRight,
  DollarSign,
  Monitor,
  Package,
  Send,
  Truck,
  TrendingUp,
} from "lucide-react";
import type { ShopProfileLanguage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  getPosChatbotFaqCategories,
  type PosChatbotFaqCategory,
  type PosChatbotFaqQuestion,
} from "@/data/posChatbotFaq";

const iconMap: Record<string, ElementType> = {
  stock_inventory: Package,
  sales: TrendingUp,
  purchasing_suppliers: Truck,
  pricing_profit: DollarSign,
  cashier_operations: Monitor,
  reports_summaries: BarChart3,
};

type FaqBrowserText = {
  chooseCategory: string;
  tapQuestion: string;
  enterPlaceholder: (placeholderLabel: string) => string;
  sendQuestion: string;
  customQuestionPlaceholder: string;
  sendCustomQuestionAriaLabel: string;
};

type FaqBrowserProps = {
  onSendQuestion: (question: string) => void;
  disabled?: boolean;
  language?: ShopProfileLanguage;
};

function getFaqBrowserText(language: ShopProfileLanguage): FaqBrowserText {
  if (language === "sinhala") {
    return {
      chooseCategory: "සාමාන්‍ය ප්‍රශ්න පිරික්සීමට කාණ්ඩයක් තෝරන්න:",
      tapQuestion: "ප්‍රශ්නයක් වහාම යැවීමට ඔබන්න, හෝ අවශ්‍ය තැන් පුරවන්න.",
      enterPlaceholder: (placeholderLabel) => `${placeholderLabel} ඇතුළත් කරන්න...`,
      sendQuestion: "ප්‍රශ්නය යවන්න",
      customQuestionPlaceholder: "ඔබගේ ප්‍රශ්නය ලියන්න...",
      sendCustomQuestionAriaLabel: "අභිරුචි ප්‍රශ්නය යවන්න",
    };
  }

  if (language === "tamil") {
    return {
      chooseCategory: "பொதுவான கேள்விகளை பார்க்க ஒரு வகையை தேர்ந்தெடுக்கவும்:",
      tapQuestion: "ஒரு கேள்வியை உடனே அனுப்ப தட்டவும், அல்லது கேட்கப்பட்ட புலங்களை நிரப்பவும்.",
      enterPlaceholder: (placeholderLabel) => `${placeholderLabel} உள்ளிடவும்...`,
      sendQuestion: "கேள்வியை அனுப்பு",
      customQuestionPlaceholder: "உங்கள் கேள்வியை தட்டச்சு செய்யவும்...",
      sendCustomQuestionAriaLabel: "தனிப்பயன் கேள்வியை அனுப்பு",
    };
  }

  return {
    chooseCategory: "Choose a category to explore common questions:",
    tapQuestion: "Tap a question to send instantly, or fill placeholders when prompted.",
    enterPlaceholder: (placeholderLabel) => `Enter ${placeholderLabel}...`,
    sendQuestion: "Send Question",
    customQuestionPlaceholder: "Type a custom question...",
    sendCustomQuestionAriaLabel: "Send custom question",
  };
}

function buildQuestionWithPlaceholders(
  question: PosChatbotFaqQuestion,
  placeholderValues: Record<string, string>,
): string {
  let text = question.template;
  question.placeholders.forEach((placeholder) => {
    text = text.replaceAll(`{${placeholder.key}}`, placeholderValues[placeholder.key]?.trim() || "");
  });

  return text;
}

export function FaqBrowser({ onSendQuestion, disabled = false, language = "english" }: FaqBrowserProps) {
  const faqText = useMemo(() => getFaqBrowserText(language), [language]);
  const categories = useMemo(() => getPosChatbotFaqCategories(language), [language]);

  const [expandedCategory, setExpandedCategory] = useState<string | null>(categories[0]?.id ?? null);
  const [selectedQuestion, setSelectedQuestion] = useState<PosChatbotFaqQuestion | null>(null);
  const [placeholderValues, setPlaceholderValues] = useState<Record<string, string>>({});
  const [customQuestion, setCustomQuestion] = useState("");

  useEffect(() => {
    setExpandedCategory((previous) => {
      if (previous && categories.some((category) => category.id === previous)) {
        return previous;
      }

      return categories[0]?.id ?? null;
    });
    setSelectedQuestion(null);
    setPlaceholderValues({});
  }, [categories]);

  const allPlaceholdersFilled = useMemo(
    () => selectedQuestion?.placeholders.every((placeholder) => placeholderValues[placeholder.key]?.trim()) ?? false,
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
      onSendQuestion(question.template);
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

  const handleSendCustomQuestion = () => {
    const normalized = customQuestion.trim();
    if (!normalized || disabled) {
      return;
    }

    onSendQuestion(normalized);
    setCustomQuestion("");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-border/70 bg-muted/15">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-3">
          <div className="px-2 pb-2">
            <p className="text-sm font-medium text-foreground">{faqText.chooseCategory}</p>
            <p className="text-xs text-muted-foreground">{faqText.tapQuestion}</p>
          </div>

          {categories.map((category) => {
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
                                  key={placeholder.key}
                                  value={placeholderValues[placeholder.key] || ""}
                                  onChange={(event) =>
                                    setPlaceholderValues((previous) => ({
                                      ...previous,
                                      [placeholder.key]: event.target.value,
                                    }))
                                  }
                                  placeholder={faqText.enterPlaceholder(placeholder.label)}
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
                                {faqText.sendQuestion}
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

      <div className="border-t border-border/70 bg-background/85 p-3">
        <div className="flex gap-2">
          <Input
            value={customQuestion}
            onChange={(event) => setCustomQuestion(event.target.value)}
            placeholder={faqText.customQuestionPlaceholder}
            className="h-9 text-xs"
            disabled={disabled}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                handleSendCustomQuestion();
              }
            }}
          />
          <Button
            type="button"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSendCustomQuestion}
            disabled={disabled || !customQuestion.trim()}
            aria-label={faqText.sendCustomQuestionAriaLabel}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
