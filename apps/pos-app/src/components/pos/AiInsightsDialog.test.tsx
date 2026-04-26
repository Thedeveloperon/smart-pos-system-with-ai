import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiInsightsDialog from "./AiInsightsDialog";
import {
  createAiChatSession,
  fetchAiChatHistory,
  fetchAiChatSession,
  fetchAiWallet,
  type AiChatMessage,
  type AiChatSessionSummary,
} from "@/lib/api";
import { streamAiChatMessage } from "@/lib/aiChatStream";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock("@/lib/aiChatStream", () => ({
  streamAiChatMessage: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");

  return {
    ...actual,
    createAiChatSession: vi.fn(),
    fetchAiChatHistory: vi.fn(),
    fetchAiChatSession: vi.fn(),
    fetchAiWallet: vi.fn(),
  };
});

function buildSessionSummary(overrides: Partial<AiChatSessionSummary> = {}): AiChatSessionSummary {
  return {
    session_id: "session-1",
    title: "Restock chat",
    default_usage_type: "quick_insights",
    message_count: 2,
    created_at: "2026-04-26T10:00:00.000Z",
    updated_at: "2026-04-26T10:00:00.000Z",
    last_message_at: "2026-04-26T10:00:00.000Z",
    ...overrides,
  };
}

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

function createDeferredPromise() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("AiInsightsDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("uuid-1");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads wallet and history, shows an optimistic user bubble, and reconciles the streamed assistant response", async () => {
    const balanceChange = vi.fn();
    const session = buildSessionSummary();
    const deferred = createDeferredPromise();

    vi.mocked(fetchAiWallet).mockResolvedValue({
      available_credits: 25,
      updated_at: "2026-04-26T10:00:00.000Z",
    });
    vi.mocked(fetchAiChatHistory)
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ items: [session] });
    vi.mocked(createAiChatSession).mockResolvedValue(session);
    vi.mocked(streamAiChatMessage).mockImplementation(async (_sessionId, _request, handlers) => {
      const pendingAssistant = buildMessage({
        message_id: "assistant-pending",
        status: "pending",
        content: "",
      });
      handlers.onStart?.(pendingAssistant);
      handlers.onDelta?.(pendingAssistant.message_id, "Working through the stock data...");

      await deferred.promise;

      handlers.onComplete?.({
        session,
        userMessage: buildMessage({
          message_id: "user-final",
          role: "user",
          content: "What needs reorder first?",
          status: "succeeded",
          completed_at: null,
        }),
        assistantMessage: buildMessage({
          message_id: "assistant-final",
          content: "Summary:\n- Reorder Milk first.",
          blocks: [
            {
              type: "summary_list",
              summary_list: {
                title: "Priority restock",
                items: ["Milk should be reordered first."],
              },
            },
          ],
          citations: [
            {
              bucket_key: "reports.low_stock",
              title: "Low stock report",
              summary: "Milk is below reorder level.",
            },
          ],
          charged_credits: 2.5,
        }),
        remainingCredits: 17.5,
      });
    });

    render(
      <AiInsightsDialog
        open={true}
        onOpenChange={vi.fn()}
        onBalanceChange={balanceChange}
      />,
    );

    await waitFor(() => {
      expect(fetchAiWallet).toHaveBeenCalledTimes(1);
      expect(fetchAiChatHistory).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Credits: 25.00")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Type a custom question..."), {
      target: { value: "What needs reorder first?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send custom question" }));

    await waitFor(() => {
      expect(screen.getByText("What needs reorder first?")).toBeInTheDocument();
    });
    expect(screen.getByText("Working through the stock data...")).toBeInTheDocument();

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByText("Priority restock")).toBeInTheDocument();
      expect(screen.getByText("Credits: 17.50")).toBeInTheDocument();
    });

    expect(screen.getAllByText("What needs reorder first?")).toHaveLength(1);
    expect(screen.getByText("Low stock report: Milk is below reorder level.")).toBeInTheDocument();
    expect(fetchAiChatHistory).toHaveBeenCalledTimes(2);
    expect(balanceChange).toHaveBeenNthCalledWith(1, 25);
    expect(balanceChange).toHaveBeenNthCalledWith(2, 17.5);
  });

  it("loads an existing session when the user selects it from history", async () => {
    const session = buildSessionSummary({
      session_id: "session-existing",
      title: "Saved stock chat",
    });

    vi.mocked(fetchAiWallet).mockResolvedValue({
      available_credits: 40,
      updated_at: "2026-04-26T10:00:00.000Z",
    });
    vi.mocked(fetchAiChatHistory).mockResolvedValue({ items: [session] });
    vi.mocked(fetchAiChatSession).mockResolvedValue({
      session,
      messages: [
        buildMessage({
          message_id: "assistant-existing",
          content: "Saved summary from the previous session.",
        }),
      ],
    });

    render(<AiInsightsDialog open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(fetchAiChatHistory).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "session-existing" },
    });

    await waitFor(() => {
      expect(fetchAiChatSession).toHaveBeenCalledWith("session-existing", 80);
      expect(screen.getByText("Saved summary from the previous session.")).toBeInTheDocument();
    });
  });

  it("cleans up optimistic state and shows an error toast when streaming fails", async () => {
    const session = buildSessionSummary();

    vi.mocked(fetchAiWallet).mockResolvedValue({
      available_credits: 12,
      updated_at: "2026-04-26T10:00:00.000Z",
    });
    vi.mocked(fetchAiChatHistory).mockResolvedValue({ items: [] });
    vi.mocked(createAiChatSession).mockResolvedValue(session);
    vi.mocked(streamAiChatMessage).mockRejectedValue(new Error("Chat stream failed."));

    render(<AiInsightsDialog open={true} onOpenChange={vi.fn()} />);

    await waitFor(() => {
      expect(fetchAiWallet).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByPlaceholderText("Type a custom question..."), {
      target: { value: "Will this fail?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send custom question" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Chat stream failed.");
    });

    expect(screen.queryByText("Will this fail?")).not.toBeInTheDocument();
  });
});
