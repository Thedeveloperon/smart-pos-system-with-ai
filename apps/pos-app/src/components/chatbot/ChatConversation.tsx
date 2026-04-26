import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import type { AiChatMessage, AiChatMessageBlock, ShopProfileLanguage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ChatConversationText = {
  item: string;
  current: string;
  reorder: string;
  status: string;
  noRowsAvailable: string;
  periodSeparator: string;
  totalRevenue: string;
  transactions: string;
  averageBasket: string;
  topSeller: string;
  trend: string;
  notAvailable: string;
  statusLow: string;
  statusOut: string;
  statusOk: string;
  trendUp: string;
  trendDown: string;
  trendFlat: string;
  unsupportedBlock: (blockType: string) => string;
  backToFaq: string;
  groundedResponses: string;
  noMessagesYet: string;
  noMessagesHint: string;
  assistantRole: string;
  systemRole: string;
  youRole: string;
  creditsSuffix: string;
  citations: string;
  inputPlaceholder: string;
};

type ChatConversationProps = {
  messages: AiChatMessage[];
  isTyping: boolean;
  onSendMessage: (text: string) => void;
  onBackToFaq: () => void;
  disabled?: boolean;
  language?: ShopProfileLanguage;
};

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-sm border border-border/70 bg-muted/60 px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function formatDecimal(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function getChatConversationText(language: ShopProfileLanguage): ChatConversationText {
  if (language === "sinhala") {
    return {
      item: "භාණ්ඩය",
      current: "වත්මන්",
      reorder: "නැවත ඇණවුම්",
      status: "තත්ත්වය",
      noRowsAvailable: "පේළි නොමැත.",
      periodSeparator: "සිට",
      totalRevenue: "මුළු ආදායම",
      transactions: "ගනුදෙනු",
      averageBasket: "සාමාන්‍ය බිල් අගය",
      topSeller: "ඉහළම අයිතමය",
      trend: "ප්‍රවණතාව",
      notAvailable: "N/A",
      statusLow: "අඩු",
      statusOut: "අවසන්",
      statusOk: "හොඳයි",
      trendUp: "ඉහළ",
      trendDown: "පහළ",
      trendFlat: "ස්ථාවර",
      unsupportedBlock: (blockType) =>
        `"${blockType}" වර්ගයේ structured response block මෙම client එක තවම සහය නොදක්වයි.`,
      backToFaq: "FAQ වෙත ආපසු",
      groundedResponses: "POS වාර්තා උපුටා දැක්වීම් මත පිළිතුරු ලබාදේ.",
      noMessagesYet: "තවම පණිවිඩ නැත",
      noMessagesHint: "ප්‍රශ්නයක් කෙලින්ම යවන්න හෝ FAQ ආකෘති වලින් ආරම්භ කරන්න.",
      assistantRole: "සහායක",
      systemRole: "පද්ධතිය",
      youRole: "ඔබ",
      creditsSuffix: "ක්‍රෙඩිට්",
      citations: "උපුටා දැක්වීම්",
      inputPlaceholder: "ප්‍රශ්නයක් ලියන්න...",
    };
  }

  if (language === "tamil") {
    return {
      item: "பொருள்",
      current: "தற்போது",
      reorder: "மறு ஆர்டர்",
      status: "நிலை",
      noRowsAvailable: "வரிசைகள் இல்லை.",
      periodSeparator: "முதல்",
      totalRevenue: "மொத்த வருமானம்",
      transactions: "பரிவர்த்தனைகள்",
      averageBasket: "சராசரி பில் மதிப்பு",
      topSeller: "முன்னணி விற்பனையாளர்",
      trend: "போக்கு",
      notAvailable: "N/A",
      statusLow: "குறைவு",
      statusOut: "இல்லை",
      statusOk: "சரி",
      trendUp: "மேலே",
      trendDown: "கீழே",
      trendFlat: "மாறாதது",
      unsupportedBlock: (blockType) =>
        `"${blockType}" வகை structured response block இந்த client-ல் இன்னும் ஆதரிக்கப்படவில்லை.`,
      backToFaq: "FAQ-க்கு திரும்பு",
      groundedResponses: "POS அறிக்கை மேற்கோள்களை வைத்து பதில்கள் வழங்கப்படும்.",
      noMessagesYet: "இன்னும் செய்திகள் இல்லை",
      noMessagesHint: "ஒரு கேள்வியை நேராக அனுப்பவும் அல்லது FAQ மாதிரிகளில் இருந்து தொடங்கவும்.",
      assistantRole: "உதவியாளர்",
      systemRole: "கணினி",
      youRole: "நீங்கள்",
      creditsSuffix: "கிரெடிட்ஸ்",
      citations: "மேற்கோள்கள்",
      inputPlaceholder: "ஒரு கேள்வியை தட்டச்சு செய்யவும்...",
    };
  }

  return {
    item: "Item",
    current: "Current",
    reorder: "Reorder",
    status: "Status",
    noRowsAvailable: "No rows available.",
    periodSeparator: "to",
    totalRevenue: "Total revenue",
    transactions: "Transactions",
    averageBasket: "Average basket",
    topSeller: "Top seller",
    trend: "Trend",
    notAvailable: "N/A",
    statusLow: "Low",
    statusOut: "Out",
    statusOk: "OK",
    trendUp: "Up",
    trendDown: "Down",
    trendFlat: "Flat",
    unsupportedBlock: (blockType) =>
      `Structured response block type "${blockType}" is not supported in this client yet.`,
    backToFaq: "Back to FAQ",
    groundedResponses: "Grounded responses use POS report citations.",
    noMessagesYet: "No messages yet",
    noMessagesHint: "Send a question directly or start from the FAQ templates.",
    assistantRole: "Assistant",
    systemRole: "System",
    youRole: "You",
    creditsSuffix: "credits",
    citations: "Citations",
    inputPlaceholder: "Type a question...",
  };
}

function localizeStockStatus(status: string, uiText: ChatConversationText): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "low") {
    return uiText.statusLow;
  }

  if (normalized === "out") {
    return uiText.statusOut;
  }

  if (normalized === "ok") {
    return uiText.statusOk;
  }

  return status;
}

function localizeTrendLabel(label: string, uiText: ChatConversationText): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === "up") {
    return uiText.trendUp;
  }

  if (normalized === "down") {
    return uiText.trendDown;
  }

  if (normalized === "flat") {
    return uiText.trendFlat;
  }

  return label;
}

function renderStructuredBlock(
  block: AiChatMessageBlock,
  messageId: string,
  index: number,
  uiText: ChatConversationText,
) {
  const key = `${messageId}-block-${index}-${block.type}`;

  if (block.type === "stock_table" && block.stock_table) {
    return (
      <div key={key} className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm font-semibold text-foreground">{block.stock_table.title}</p>
        {block.stock_table.rows.length > 0 ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="border-b border-border/60 px-1 py-1.5 text-left font-medium">{uiText.item}</th>
                  <th className="border-b border-border/60 px-1 py-1.5 text-left font-medium">{uiText.current}</th>
                  <th className="border-b border-border/60 px-1 py-1.5 text-left font-medium">{uiText.reorder}</th>
                  <th className="border-b border-border/60 px-1 py-1.5 text-left font-medium">{uiText.status}</th>
                </tr>
              </thead>
              <tbody>
                {block.stock_table.rows.map((row, rowIndex) => (
                  <tr key={`${key}-row-${rowIndex}`}>
                    <td className="border-b border-border/40 px-1 py-1.5">{row.item}</td>
                    <td className="border-b border-border/40 px-1 py-1.5">{formatDecimal(row.current_stock)}</td>
                    <td className="border-b border-border/40 px-1 py-1.5">{formatDecimal(row.reorder_level)}</td>
                    <td className="border-b border-border/40 px-1 py-1.5">{localizeStockStatus(row.status, uiText)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{uiText.noRowsAvailable}</p>
        )}
        {block.stock_table.footer_note ? (
          <p className="mt-2 text-xs text-muted-foreground">{block.stock_table.footer_note}</p>
        ) : null}
      </div>
    );
  }

  if (block.type === "sales_kpi" && block.sales_kpi) {
    return (
      <div key={key} className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm font-semibold text-foreground">{block.sales_kpi.title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {block.sales_kpi.from_date} {uiText.periodSeparator} {block.sales_kpi.to_date}
        </p>
        <div className="mt-2 space-y-1.5 text-xs">
          <p>
            <span className="font-medium">{uiText.totalRevenue}:</span> {formatDecimal(block.sales_kpi.revenue)}
          </p>
          <p>
            <span className="font-medium">{uiText.transactions}:</span> {block.sales_kpi.transactions}
          </p>
          <p>
            <span className="font-medium">{uiText.averageBasket}:</span> {formatDecimal(block.sales_kpi.average_basket)}
          </p>
          <p>
            <span className="font-medium">{uiText.topSeller}:</span> {block.sales_kpi.top_seller || uiText.notAvailable}
          </p>
          <p>
            <span className="font-medium">{uiText.trend}:</span>{" "}
            {formatDecimal(block.sales_kpi.trend_percent)}% ({localizeTrendLabel(block.sales_kpi.trend_label, uiText)})
          </p>
        </div>
      </div>
    );
  }

  if (block.type === "summary_list" && block.summary_list) {
    return (
      <div key={key} className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        <p className="text-sm font-semibold text-foreground">{block.summary_list.title}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
          {block.summary_list.items.map((item, itemIndex) => (
            <li key={`${key}-item-${itemIndex}`}>{item}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div key={key} className="rounded-xl border border-border/70 bg-background/80 p-3 text-xs text-muted-foreground">
      {uiText.unsupportedBlock(block.type)}
    </div>
  );
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatInline(text: string): string {
  const codeTokens: string[] = [];
  let formatted = escapeHtml(text).replace(/`([^`]+)`/g, (_, code: string) => {
    const token = `__INLINE_CODE_${codeTokens.length}__`;
    codeTokens.push(
      `<code class="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[0.95em] text-foreground">${code}</code>`,
    );
    return token;
  });

  formatted = formatted.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");

  return formatted.replace(/__INLINE_CODE_(\d+)__/g, (_, index: string) => codeTokens[Number(index)] ?? "");
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = useMemo(() => content.split("\n"), [content]);
  const elements: ReactNode[] = [];
  let tableRows: string[][] = [];
  let codeBlockLines: string[] | null = null;
  let codeBlockLanguage = "";

  const flushTable = () => {
    if (tableRows.length < 2) {
      tableRows = [];
      return;
    }

    const headers = tableRows[0];
    const body = tableRows.slice(2);

    elements.push(
      <div key={`table-${elements.length}`} className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th key={`header-${index}`} className="border-b border-border px-2 py-1 text-left font-semibold">
                  {header.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td key={`cell-${rowIndex}-${cellIndex}`} className="border-b border-border/50 px-2 py-1">
                    {cell.trim()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    tableRows = [];
  };

  const flushCodeBlock = () => {
    if (!codeBlockLines) {
      return;
    }

    const blockContent = codeBlockLines.join("\n");
    elements.push(
      <div key={`code-${elements.length}`} className="my-2 overflow-x-auto rounded-lg border border-border/70 bg-background/90">
        {codeBlockLanguage ? (
          <div className="border-b border-border/70 px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {codeBlockLanguage}
          </div>
        ) : null}
        <pre className="p-3 text-[11px] leading-relaxed text-foreground">
          <code>{blockContent}</code>
        </pre>
      </div>,
    );
    codeBlockLines = null;
    codeBlockLanguage = "";
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (tableRows.length > 0) {
        flushTable();
      }

      if (codeBlockLines) {
        flushCodeBlock();
      } else {
        codeBlockLines = [];
        codeBlockLanguage = trimmed.slice(3).trim();
      }
      return;
    }

    if (codeBlockLines) {
      codeBlockLines.push(line);
      return;
    }

    const isTableLine = trimmed.startsWith("|") && trimmed.endsWith("|");

    if (isTableLine) {
      tableRows.push(trimmed.split("|").slice(1, -1));
      return;
    }

    if (tableRows.length > 0) {
      flushTable();
    }

    if (!trimmed) {
      elements.push(<div key={`spacer-${index}`} className="h-2" />);
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const headingClassName =
        level === 1
          ? "text-base font-semibold"
          : level === 2
            ? "text-sm font-semibold"
            : "text-xs font-semibold uppercase tracking-wide text-muted-foreground";

      elements.push(
        <p
          key={`heading-${index}`}
          className={headingClassName}
          dangerouslySetInnerHTML={{ __html: formatInline(headingText) }}
        />,
      );
      return;
    }

    if (trimmed.startsWith("- ")) {
      elements.push(
        <div key={`bullet-${index}`} className="flex gap-2">
          <span className="font-medium text-muted-foreground">*</span>
          <span dangerouslySetInnerHTML={{ __html: formatInline(trimmed.slice(2)) }} />
        </div>,
      );
      return;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      elements.push(
        <p key={`ordered-${index}`} dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />,
      );
      return;
    }

    elements.push(
      <p key={`text-${index}`} dangerouslySetInnerHTML={{ __html: formatInline(trimmed) }} />,
    );
  });

  if (tableRows.length > 0) {
    flushTable();
  }

  if (codeBlockLines) {
    flushCodeBlock();
  }

  return <div className="space-y-0.5 text-xs leading-relaxed">{elements}</div>;
}

export function ChatConversation({
  messages,
  isTyping,
  onSendMessage,
  onBackToFaq,
  disabled = false,
  language = "english",
}: ChatConversationProps) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uiText = useMemo(() => getChatConversationText(language), [language]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [isTyping, messages]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || disabled) {
      return;
    }

    onSendMessage(trimmed);
    setInput("");
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToFaq}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          {uiText.backToFaq}
        </button>
        <p className="text-[11px] text-muted-foreground">{uiText.groundedResponses}</p>
      </div>

      <ScrollArea className="h-[min(52vh,29rem)] rounded-md border border-border/70 bg-muted/15">
        <div className="space-y-3 p-3">
          {messages.length === 0 && !isTyping ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-background/80 px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">{uiText.noMessagesYet}</p>
              <p className="mt-1 text-xs text-muted-foreground">{uiText.noMessagesHint}</p>
            </div>
          ) : null}

          {messages.map((message) => {
            const bodyText = (message.content || message.error_message || "").trim();
            const isAssistant = message.role === "assistant";
            const isPending = message.status === "pending";
            const hasBlocks = isAssistant && Array.isArray(message.blocks) && message.blocks.length > 0;
            const hasBodyText = bodyText.length > 0;

            return (
              <div key={message.message_id} className={cn("flex", isAssistant ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2.5",
                    isAssistant
                      ? "rounded-bl-sm border border-primary/25 bg-primary/5 text-foreground"
                      : "rounded-br-sm bg-primary text-primary-foreground",
                    isPending ? "opacity-90" : null,
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px]">
                    <span className={cn("font-semibold", isAssistant ? "text-foreground" : "text-primary-foreground")}>
                      {isAssistant ? uiText.assistantRole : message.role === "system" ? uiText.systemRole : uiText.youRole}
                    </span>
                    <span className={cn(isAssistant ? "text-muted-foreground" : "text-primary-foreground/80")}>
                      {new Date(message.created_at).toLocaleString()}
                    </span>
                    {isPending ? <Loader2 className={cn("h-3 w-3 animate-spin", isAssistant ? "text-muted-foreground" : "text-primary-foreground/80")} /> : null}
                    {message.charged_credits > 0 ? (
                      <span className={cn("ml-auto", isAssistant ? "text-muted-foreground" : "text-primary-foreground/85")}>
                        {message.charged_credits.toFixed(2)} {uiText.creditsSuffix}
                      </span>
                    ) : null}
                  </div>

                  {isAssistant ? (
                    <div className="space-y-2">
                      {hasBlocks
                        ? message.blocks!.map((block, index) =>
                            renderStructuredBlock(block, message.message_id, index, uiText),
                          )
                        : null}
                      {hasBodyText ? <SimpleMarkdown content={bodyText} /> : null}
                      {!hasBlocks && !hasBodyText ? <p className="text-xs">-</p> : null}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-xs">{hasBodyText ? bodyText : "-"}</p>
                  )}

                  {message.citations.length > 0 ? (
                    <div className="mt-3 rounded-md border border-border/70 bg-background/80 p-2">
                      <p className="text-[11px] font-medium text-foreground">{uiText.citations}</p>
                      <div className="mt-1 space-y-1">
                        {message.citations.map((citation) => (
                          <p key={`${message.message_id}-${citation.bucket_key}`} className="text-[11px] text-muted-foreground">
                            {citation.title}: {citation.summary}
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          {isTyping ? <TypingIndicator /> : null}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      <div className="flex gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={uiText.inputPlaceholder}
          className="h-9 text-xs"
          disabled={disabled}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSend();
            }
          }}
        />
        <Button type="button" size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={disabled || !input.trim()}>
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
