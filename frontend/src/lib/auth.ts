import type { UserRole } from "@/components/pos/cash-session/types";

export interface AppUser {
  username: string;
  displayName: string;
  role: UserRole;
}

export const mapBackendRoleToUserRole = (role: string): UserRole => {
  if (role.toLowerCase() === "owner") {
    return "admin";
  }

  if (role.toLowerCase() === "manager") {
    return "manager";
  }

  return "cashier";
};

