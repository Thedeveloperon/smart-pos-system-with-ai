import type { UserRole } from "@/components/pos/cash-session/types";

export interface AppUser {
  username: string;
  displayName: string;
  role: UserRole;
  backendRole: string;
  sessionId?: string;
  sessionExpiresAt?: string;
}

export const mapBackendRoleToUserRole = (role: string): UserRole => {
  const normalizedRole = role.toLowerCase();
  if (
    normalizedRole === "owner" ||
    normalizedRole === "super_admin" ||
    normalizedRole === "support" ||
    normalizedRole === "billing_admin" ||
    normalizedRole === "security_admin"
  ) {
    return "admin";
  }

  if (normalizedRole === "manager") {
    return "manager";
  }

  return "cashier";
};

export const isSuperAdminBackendRole = (role?: string | null) => {
  if (!role) {
    return false;
  }

  const normalizedRole = role.toLowerCase();
  return (
    normalizedRole === "super_admin" ||
    normalizedRole === "support" ||
    normalizedRole === "billing_admin" ||
    normalizedRole === "security_admin"
  );
};
