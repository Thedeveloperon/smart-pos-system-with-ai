import { useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  createAiChatSession,
  fetchAiChatHistory,
  fetchAiChatSession,
  fetchAiWallet,
  postAiChatMessage,
  type AiChatMessage,
  type AiChatSessionSummary,
  type AiInsightsUsageType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { FaqBrowser } from "@/components/chatbot/FaqBrowser";
import { ChatConversation } from "@/components/chatbot/ChatConversation";

interface AiInsightsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBalanceChange?: (balance: number) => void;
  isSuperAdmin?: boolean;
}

const CHAT_USAGE_TYPE: AiInsightsUsageType = "quick_insights";

const AiInsightsDialog = ({ open, onOpenChange, onBalanceChange }: AiInsightsDialogProps) => {
  const [chatSessions, setChatSessions] = useState<AiChatSessionSummary[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([]);
  const [chatView, setChatView] = useState<"faq" | "chat">("faq");
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [isSendingChatMessage, setIsSendingChatMessage] = useState(false);
  const [isCreatingChatSession, setIsCreatingChatSession] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [walletCredits, setWalletCredits] = useState<number | null>(null);

  const sessionLabel = useMemo(() => {
    if (!activeChatSessionId) {
      return "New chat";
    }

    const session = chatSessions.find((item) => item.session_id === activeChatSessionId);
    if (!session) {
      return "Saved chat";
    }

    const normalizedTitle = (session.title ?? "").trim();
    if (!normalizedTitle) {
      return "Saved chat";
    }

    return normalizedTitle.length > 30 ? `${normalizedTitle.slice(0, 30)}...` : normalizedTitle;
  }, [activeChatSessionId, chatSessions]);

  const loadWallet = async () => {
    try {
      const wallet = await fetchAiWallet();
      setWalletCredits(wallet.available_credits);
      onBalanceChange?.(wallet.available_credits);
    } catch (error) {
      console.error(error);
    }
  };

  const loadChatSession = async (sessionId: string) => {
    setIsLoadingChat(true);
    try {
      const response = await fetchAiChatSession(sessionId, 80);
      setActiveChatSessionId(response.session.session_id);
      setChatMessages(response.messages);
      setChatView("chat");
    } catch (error) {
      console.error(error);
      toast.error("Failed to load chat session.");
    } finally {
      setIsLoadingChat(false);
    }
  };

  const loadChatHistory = async () => {
    setIsLoadingChat(true);
    try {
      const response = await fetchAiChatHistory(30);
      setChatSessions(response.items);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load chat history.");
    } finally {
      setIsLoadingChat(false);
    }
  };

  const handleCreateChatSession = async () => {
    setIsCreatingChatSession(true);
    try {
      const session = await createAiChatSession({
        title: "",
        usage_type: CHAT_USAGE_TYPE,
      });
      setChatSessions((previous) => [session, ...previous.filter((item) => item.session_id !== session.session_id)]);
      setActiveChatSessionId(session.session_id);
      setChatMessages([]);
      setChatView("faq");
    } catch (error) {
      console.error(error);
      toast.error("Failed to create chat session.");
    } finally {
      setIsCreatingChatSession(false);
    }
  };

  const handleSendChatMessage = async (messageText: string) => {
    const normalizedMessage = messageText.trim();
    if (!normalizedMessage) {
      return;
    }

    setIsSendingChatMessage(true);
    try {
      setChatView("chat");
      let sessionId = activeChatSessionId;
      if (!sessionId) {
        const created = await createAiChatSession({
          title: "",
          usage_type: CHAT_USAGE_TYPE,
        });
        sessionId = created.session_id;
        setChatSessions((previous) => [created, ...previous.filter((item) => item.session_id !== created.session_id)]);
        setActiveChatSessionId(created.session_id);
      }

      const idKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const response = await postAiChatMessage(sessionId, {
        message: normalizedMessage,
        usage_type: CHAT_USAGE_TYPE,
        idempotency_key: `chat-${idKey}`,
      });

      setChatMessages((previous) => {
        const map = new Map<string, AiChatMessage>();
        previous.forEach((message) => {
          map.set(message.message_id, message);
        });
        map.set(response.user_message.message_id, response.user_message);
        map.set(response.assistant_message.message_id, response.assistant_message);
        return Array.from(map.values()).sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
      });

      setWalletCredits(response.remaining_credits);
      onBalanceChange?.(response.remaining_credits);
      await loadChatHistory();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to send chat message.");
    } finally {
      setIsSendingChatMessage(false);
    }
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsCollapsed(false);
    void Promise.all([loadWallet(), loadChatHistory()]);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed bottom-[5.25rem] right-4 z-50 md:bottom-20 md:right-6">
      <div className="pointer-events-auto w-[min(92vw,30rem)]">
        <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-foreground/15">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-lg font-semibold leading-tight">POS Assistant</p>
                <p className="text-xs text-primary-foreground/85">Always here to help</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="rounded-md p-1 text-primary-foreground/90 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground"
                onClick={() => setIsCollapsed((previous) => !previous)}
                aria-label={isCollapsed ? "Expand assistant" : "Collapse assistant"}
              >
                {isCollapsed ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
              </button>
              <button
                type="button"
                className="rounded-md p-1 text-primary-foreground/90 transition-colors hover:bg-primary-foreground/15 hover:text-primary-foreground"
                onClick={() => onOpenChange(false)}
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isCollapsed ? (
            <>
              <div className="flex items-center justify-between border-b border-border bg-muted/10 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {walletCredits === null ? "AI credits" : `Credits: ${walletCredits.toFixed(2)}`}
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={activeChatSessionId ?? ""}
                    onChange={(event) => {
                      const nextSessionId = event.target.value;
                      if (nextSessionId) {
                        void loadChatSession(nextSessionId);
                        return;
                      }

                      setActiveChatSessionId(null);
                      setChatMessages([]);
                      setChatView("faq");
                    }}
                    className="h-7 max-w-[10rem] rounded-md border border-border bg-background px-2 text-[11px]"
                  >
                    <option value="">{sessionLabel}</option>
                    {chatSessions.map((session) => (
                      <option key={session.session_id} value={session.session_id}>
                        {session.title || "Untitled chat"}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => void handleCreateChatSession()}
                    disabled={isCreatingChatSession}
                  >
                    {isCreatingChatSession ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    New Chat
                  </Button>
                </div>
              </div>

              <div className="h-[min(70vh,40rem)] p-3">
                {chatView === "faq" ? (
                  <FaqBrowser
                    onSendQuestion={(question) => {
                      void handleSendChatMessage(question);
                    }}
                    disabled={isSendingChatMessage || isCreatingChatSession || isLoadingChat}
                  />
                ) : (
                  <ChatConversation
                    messages={chatMessages}
                    isTyping={isLoadingChat || isSendingChatMessage}
                    onSendMessage={(question) => {
                      void handleSendChatMessage(question);
                    }}
                    onBackToFaq={() => setChatView("faq")}
                    disabled={isSendingChatMessage}
                  />
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default AiInsightsDialog;
