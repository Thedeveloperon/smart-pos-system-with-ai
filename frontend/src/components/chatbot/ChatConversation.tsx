import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import type { AiChatMessage, AiChatMessageBlock } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type ChatConversationProps = {
  messages: AiChatMessage[];
  isTyping: boolean;
  onSendMessage: (text: string) => void;
  onBackToFaq: () => void;
  disabled?: boolean;
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

function renderStructuredBlock(block: AiChatMessageBlock, messageId: string, index: number) {
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
                  <th className="border-b border-border/60 px-1 py-1.5 text-left font-medium">Item</th>
                  <th className="border-b border-border/60 px-1 py-1.5 text-left font-medium">Current</th>
                  <th className="border-b border-border/60 px-1 py-1.5 text-left font-medium">Reorder</th>
                  <th className="border-b border-border/60 px-1 py-1.5 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {block.stock_table.rows.map((row, rowIndex) => (
                  <tr key={`${key}-row-${rowIndex}`}>
                    <td className="border-b border-border/40 px-1 py-1.5">{row.item}</td>
                    <td className="border-b border-border/40 px-1 py-1.5">{formatDecimal(row.current_stock)}</td>
                    <td className="border-b border-border/40 px-1 py-1.5">{formatDecimal(row.reorder_level)}</td>
                    <td className="border-b border-border/40 px-1 py-1.5">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No rows available.</p>
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
          {block.sales_kpi.from_date} to {block.sales_kpi.to_date}
        </p>
        <div className="mt-2 space-y-1.5 text-xs">
          <p>
            <span className="font-medium">Total revenue:</span> {formatDecimal(block.sales_kpi.revenue)}
          </p>
          <p>
            <span className="font-medium">Transactions:</span> {block.sales_kpi.transactions}
          </p>
          <p>
            <span className="font-medium">Average basket:</span> {formatDecimal(block.sales_kpi.average_basket)}
          </p>
          <p>
            <span className="font-medium">Top seller:</span> {block.sales_kpi.top_seller || "N/A"}
          </p>
          <p>
            <span className="font-medium">Trend:</span> {formatDecimal(block.sales_kpi.trend_percent)}% ({block.sales_kpi.trend_label})
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
      Structured response block type "{block.type}" is not supported in this client yet.
    </div>
  );
}

function formatInline(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = useMemo(() => content.split("\n"), [content]);
  const elements: ReactNode[] = [];
  let tableRows: string[][] = [];

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

  lines.forEach((line, index) => {
    const trimmed = line.trim();
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

  return <div className="space-y-0.5 text-xs leading-relaxed">{elements}</div>;
}

export function ChatConversation({
  messages,
  isTyping,
  onSendMessage,
  onBackToFaq,
  disabled = false,
}: ChatConversationProps) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
          Back to FAQ
        </button>
        <p className="text-[11px] text-muted-foreground">Grounded responses use POS report citations.</p>
      </div>

      <ScrollArea className="h-[min(52vh,29rem)] rounded-md border border-border/70 bg-muted/15">
        <div className="space-y-3 p-3">
          {messages.length === 0 && !isTyping ? (
            <div className="rounded-lg border border-dashed border-border/70 bg-background/80 px-4 py-6 text-center">
              <p className="text-sm font-medium text-foreground">No messages yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Send a question directly or start from the FAQ templates.
              </p>
            </div>
          ) : null}

          {messages.map((message) => {
            const bodyText = (message.content || message.error_message || "").trim();
            const isAssistant = message.role === "assistant";
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
                  )}
                >
                  <div className="mb-1 flex items-center gap-2 text-[11px]">
                    <span className={cn("font-semibold", isAssistant ? "text-foreground" : "text-primary-foreground")}>
                      {isAssistant ? "Assistant" : message.role === "system" ? "System" : "You"}
                    </span>
                    <span className={cn(isAssistant ? "text-muted-foreground" : "text-primary-foreground/80")}>
                      {new Date(message.created_at).toLocaleString()}
                    </span>
                    {message.charged_credits > 0 ? (
                      <span className={cn("ml-auto", isAssistant ? "text-muted-foreground" : "text-primary-foreground/85")}>
                        {message.charged_credits.toFixed(2)} credits
                      </span>
                    ) : null}
                  </div>

                  {isAssistant ? (
                    <div className="space-y-2">
                      {hasBlocks ? message.blocks!.map((block, index) => renderStructuredBlock(block, message.message_id, index)) : null}
                      {hasBodyText ? <SimpleMarkdown content={bodyText} /> : null}
                      {!hasBlocks && !hasBodyText ? <p className="text-xs">-</p> : null}
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap text-xs">{hasBodyText ? bodyText : "-"}</p>
                  )}

                  {message.citations.length > 0 ? (
                    <div className="mt-3 rounded-md border border-border/70 bg-background/80 p-2">
                      <p className="text-[11px] font-medium text-foreground">Citations</p>
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
          placeholder="Type a question..."
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
