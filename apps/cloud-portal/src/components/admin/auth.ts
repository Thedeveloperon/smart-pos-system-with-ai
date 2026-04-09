export type AdminSession = {
  user_id: string;
  username: string;
  full_name: string;
  role: string;
  device_id: string;
  device_code: string;
  expires_at: string;
  mfa_verified?: boolean;
};

type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

export function isSuperAdminRole(role?: string | null) {
  const normalized = (role || "").trim().toLowerCase();
  return (
    normalized === "super_admin" ||
    normalized === "support" ||
    normalized === "support_admin" ||
    normalized === "billing_admin" ||
    normalized === "security_admin"
  );
}

async function parseApiPayload(response: Response): Promise<unknown> {
  const responseText = await response.text();
  if (!responseText.trim()) {
    return null;
  }

  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

export function parseErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload.trim();
  }

  const candidate = payload as ApiErrorPayload;
  return (
    candidate?.error?.message?.trim() ||
    candidate?.message?.trim() ||
    "Request failed. Please try again."
  );
}

export async function bootstrapAdminSession() {
  const response = await fetch("/api/account/me", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });

  const payload = await parseApiPayload(response);

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(parseErrorMessage(payload));
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Session payload is empty.");
  }

  return payload as AdminSession;
}

export async function loginAdmin(username: string, password: string) {
  const response = await fetch("/api/account/login", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      username,
      password,
    }),
  });

  const payload = await parseApiPayload(response);
  if (!response.ok) {
    throw new Error(parseErrorMessage(payload));
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Session payload is empty.");
  }

  return payload as AdminSession;
}

export async function logoutAdmin() {
  await fetch("/api/account/logout", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({}),
  });
}
