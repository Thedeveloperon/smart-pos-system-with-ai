import {
  API_BASE_URL,
  ApiError,
  POS_CLIENT_VERSION,
  createIdempotencyKey,
  getAuthTerminalId,
  getStoredLicenseToken,
  type AiChatMessage,
  type AiChatMessageCreateRequest,
  type AiChatSessionSummary,
} from "@/lib/api";

const DEVICE_ID_HEADER = "X-Device-Id";
const DEVICE_CODE_HEADER = "X-Device-Code";
const TERMINAL_ID_HEADER = "X-Terminal-Id";
const POS_VERSION_HEADER = "X-POS-Version";

type AiChatStreamEvent =
  | {
      type: "start";
      assistant_message: AiChatMessage;
    }
  | {
      type: "delta";
      message_id?: string;
      delta?: string;
    }
  | {
      type: "complete";
      session: AiChatSessionSummary;
      user_message: AiChatMessage;
      assistant_message: AiChatMessage;
      remaining_credits: number;
    }
  | {
      type: "error";
      message_id?: string;
      error_message?: string;
    };

type StreamHandlers = {
  onStart?: (assistantMessage: AiChatMessage) => void;
  onDelta?: (messageId: string | undefined, delta: string) => void;
  onComplete?: (payload: {
    session: AiChatSessionSummary;
    userMessage: AiChatMessage;
    assistantMessage: AiChatMessage;
    remainingCredits: number;
  }) => void;
  onError?: (message: string) => void;
};

function buildStreamHeaders() {
  const terminalId = getAuthTerminalId();
  const licenseToken = getStoredLicenseToken();
  const headers = new Headers({
    "Content-Type": "application/json",
    "Idempotency-Key": createIdempotencyKey(),
    [TERMINAL_ID_HEADER]: terminalId,
    [DEVICE_ID_HEADER]: terminalId,
    [DEVICE_CODE_HEADER]: terminalId,
    [POS_VERSION_HEADER]: POS_CLIENT_VERSION,
  });

  if (licenseToken) {
    headers.set("X-License-Token", licenseToken);
  }

  return headers;
}

function parseApiError(bodyText: string, status: number) {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return new ApiError("Chat stream request failed.", status);
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      message?: string;
      error?: {
        code?: string;
        message?: string;
      };
    };
    const message = parsed.error?.message || parsed.message || "Chat stream request failed.";
    return new ApiError(message, status, parsed.error?.code);
  } catch {
    return new ApiError(trimmed, status);
  }
}

function parseSseChunk(rawChunk: string): AiChatStreamEvent | null {
  const normalized = rawChunk.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return null;
  }

  const dataLines = normalized
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) {
    return null;
  }

  const payload = dataLines.join("\n");
  if (!payload || payload === "[DONE]") {
    return null;
  }

  return JSON.parse(payload) as AiChatStreamEvent;
}

export async function streamAiChatMessage(
  sessionId: string,
  requestBody: AiChatMessageCreateRequest,
  handlers: StreamHandlers = {},
) {
  const body = JSON.stringify(requestBody);
  const response = await fetch(`${API_BASE_URL}/api/ai/chat/sessions/${sessionId}/messages/stream`, {
    method: "POST",
    credentials: "include",
    headers: buildStreamHeaders(),
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw parseApiError(errorText, response.status);
  }

  if (!response.body) {
    throw new ApiError("Chat stream response body was empty.", response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    buffer = buffer.replace(/\r\n/g, "\n");

    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex >= 0) {
      const rawChunk = buffer.slice(0, boundaryIndex);
      buffer = buffer.slice(boundaryIndex + 2);

      const event = parseSseChunk(rawChunk);
      if (event) {
        if (event.type === "start") {
          handlers.onStart?.(event.assistant_message);
        } else if (event.type === "delta" && event.delta) {
          handlers.onDelta?.(event.message_id, event.delta);
        } else if (event.type === "complete") {
          handlers.onComplete?.({
            session: event.session,
            userMessage: event.user_message,
            assistantMessage: event.assistant_message,
            remainingCredits: event.remaining_credits,
          });
        } else if (event.type === "error") {
          const message = event.error_message || "Chat stream failed.";
          handlers.onError?.(message);
          throw new ApiError(message, response.status);
        }
      }

      boundaryIndex = buffer.indexOf("\n\n");
    }

    if (done) {
      break;
    }
  }

  const trailingEvent = parseSseChunk(buffer);
  if (trailingEvent?.type === "error") {
    const message = trailingEvent.error_message || "Chat stream failed.";
    handlers.onError?.(message);
    throw new ApiError(message, response.status);
  }
}
