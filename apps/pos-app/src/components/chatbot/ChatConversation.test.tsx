import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatConversation } from "./ChatConversation";
import type { AiChatMessage } from "@/lib/api";

function buildMessage(overrides: Partial<AiChatMessage>): AiChatMessage {
  return {
    message_id: "message-1",
    role: "assistant",
    status: "succeeded",
    usage_type: "quick_insights",
    content: "",
    citations: [],
    blocks: [],
    input_tokens: 0,
    output_tokens: 0,
    reserved_credits: 0,
    charged_credits: 0,
    refunded_credits: 0,
    created_at: "2026-04-26T10:00:00.000Z",
    completed_at: "2026-04-26T10:00:05.000Z",
    error_message: null,
    ...overrides,
  };
}

describe("ChatConversation", () => {
  it("renders markdown, structured blocks, citations, and markdown tables without regression", () => {
    render(
      <ChatConversation
        messages={[
          buildMessage({
            content: [
              "# Summary",
              "Use `milk` first.",
              "",
              "| Item | Qty |",
              "| --- | --- |",
              "| Milk | 4 |",
              "",
              "```sql",
              "select 1;",
              "```",
            ].join("\n"),
            citations: [
              {
                bucket_key: "reports.sales",
                title: "Sales report",
                summary: "Milk sold four units.",
              },
            ],
          }),
          buildMessage({
            message_id: "message-2",
            content: "Priority stock review",
            blocks: [
              {
                type: "stock_table",
                stock_table: {
                  title: "Low stock items",
                  rows: [
                    {
                      item: "Soda",
                      current_stock: 2,
                      reorder_level: 8,
                      status: "low",
                    },
                  ],
                  footer_note: "Reorder before tomorrow.",
                },
              },
            ],
          }),
        ]}
        isTyping={false}
        onSendMessage={vi.fn()}
        onBackToFaq={vi.fn()}
      />,
    );

    expect(screen.getByText("Summary")).toBeInTheDocument();
    expect(screen.getByText("milk", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText("select 1;")).toBeInTheDocument();
    expect(screen.getByText("Low stock items")).toBeInTheDocument();
    expect(screen.getByText("Reorder before tomorrow.")).toBeInTheDocument();
    expect(screen.getByText("Sales report: Milk sold four units.")).toBeInTheDocument();
    expect(screen.getByText("Soda")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Milk")).toBeInTheDocument();
  });
});
