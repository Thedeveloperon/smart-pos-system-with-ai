import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  createAdminShopUser,
  deactivateAdminShopUser,
  fetchAdminShopUsers,
  reactivateAdminShopUser,
  resetAdminShopUserPassword,
  updateAdminShopUser,
  type AdminShopUserRow,
  type AdminShopsLicensingSnapshotResponse,
} from "@/lib/adminApi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AdminUsersPanelProps = {
  shops: AdminShopsLicensingSnapshotResponse["items"];
};

type CreateUserForm = {
  username: string;
  fullName: string;
  roleCode: "owner" | "manager" | "cashier";
  password: string;
  actorNote: string;
};

type EditUserForm = {
  username: string;
  fullName: string;
  roleCode: "owner" | "manager" | "cashier";
  actorNote: string;
};

type ResetPasswordForm = {
  newPassword: string;
  actorNote: string;
};

const initialCreateForm: CreateUserForm = {
  username: "",
  fullName: "",
  roleCode: "cashier",
  password: "",
  actorNote: "",
};

const initialResetForm: ResetPasswordForm = {
  newPassword: "",
  actorNote: "",
};

const roleLabel = (roleCode: string) => roleCode.replaceAll("_", " ");

const AdminUsersPanel = ({ shops }: AdminUsersPanelProps) => {
  const [selectedShopCode, setSelectedShopCode] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<AdminShopUserRow[]>([]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(initialCreateForm);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editingUser, setEditingUser] = useState<AdminShopUserRow | null>(null);
  const [editForm, setEditForm] = useState<EditUserForm>({
    username: "",
    fullName: "",
    roleCode: "cashier",
    actorNote: "",
  });
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [resettingUser, setResettingUser] = useState<AdminShopUserRow | null>(null);
  const [resetForm, setResetForm] = useState<ResetPasswordForm>(initialResetForm);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const shopOptions = useMemo(
    () => [...shops].sort((a, b) => a.shop_code.localeCompare(b.shop_code)),
    [shops],
  );

  useEffect(() => {
    if (!selectedShopCode && shopOptions.length > 0) {
      setSelectedShopCode(shopOptions[0].shop_code);
      return;
    }

    if (selectedShopCode && shopOptions.every((item) => item.shop_code !== selectedShopCode)) {
      setSelectedShopCode(shopOptions[0]?.shop_code ?? "");
    }
  }, [selectedShopCode, shopOptions]);

  const loadUsers = useCallback(
    async (quiet = false) => {
      if (!selectedShopCode) {
        setUsers([]);
        return;
      }

      setLoading(true);
      try {
        const response = await fetchAdminShopUsers({
          shopCode: selectedShopCode,
          search: search.trim() || undefined,
          includeInactive,
          take: 200,
        });
        setUsers(response.items);
      } catch (error) {
        console.error(error);
        if (!quiet) {
          toast.error(error instanceof Error ? error.message : "Failed to load shop users.");
        }
      } finally {
        setLoading(false);
      }
    },
    [includeInactive, search, selectedShopCode],
  );

  useEffect(() => {
    void loadUsers(true);
  }, [loadUsers]);

  const handleCreateUser = useCallback(async () => {
    if (!selectedShopCode) {
      toast.error("Select a shop first.");
      return;
    }

    if (!createForm.username.trim() || !createForm.fullName.trim() || !createForm.password.trim() || !createForm.actorNote.trim()) {
      toast.error("All create-user fields are required.");
      return;
    }

    setCreateSubmitting(true);
    try {
      await createAdminShopUser({
        shop_code: selectedShopCode,
        username: createForm.username.trim(),
        full_name: createForm.fullName.trim(),
        role_code: createForm.roleCode,
        password: createForm.password,
        actor: "support-ui",
        reason_code: "manual_shop_user_create",
        actor_note: createForm.actorNote.trim(),
      });
      toast.success("User created.");
      setCreateDialogOpen(false);
      setCreateForm(initialCreateForm);
      await loadUsers(true);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to create user.");
    } finally {
      setCreateSubmitting(false);
    }
  }, [createForm, loadUsers, selectedShopCode]);

  const openEditDialog = useCallback((user: AdminShopUserRow) => {
    const normalizedRole = (user.role_code || "cashier").toLowerCase();
    const safeRole: "owner" | "manager" | "cashier" =
      normalizedRole === "owner" || normalizedRole === "manager" || normalizedRole === "cashier"
        ? normalizedRole
        : "cashier";
    setEditingUser(user);
    setEditForm({
      username: user.username,
      fullName: user.full_name,
      roleCode: safeRole,
      actorNote: "",
    });
  }, []);

  const handleEditUser = useCallback(async () => {
    if (!editingUser) {
      return;
    }

    if (!editForm.username.trim() || !editForm.fullName.trim() || !editForm.actorNote.trim()) {
      toast.error("All edit fields are required.");
      return;
    }

    setEditSubmitting(true);
    try {
      await updateAdminShopUser(editingUser.user_id, {
        username: editForm.username.trim(),
        full_name: editForm.fullName.trim(),
        role_code: editForm.roleCode,
        actor: "support-ui",
        reason_code: "manual_shop_user_update",
        actor_note: editForm.actorNote.trim(),
      });
      toast.success("User updated.");
      setEditingUser(null);
      await loadUsers(true);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to update user.");
    } finally {
      setEditSubmitting(false);
    }
  }, [editForm, editingUser, loadUsers]);

  const openResetDialog = useCallback((user: AdminShopUserRow) => {
    setResettingUser(user);
    setResetForm(initialResetForm);
  }, []);

  const handleResetPassword = useCallback(async () => {
    if (!resettingUser) {
      return;
    }

    if (!resetForm.newPassword.trim() || !resetForm.actorNote.trim()) {
      toast.error("Both password and actor note are required.");
      return;
    }

    setResetSubmitting(true);
    try {
      await resetAdminShopUserPassword(resettingUser.user_id, {
        new_password: resetForm.newPassword,
        actor: "support-ui",
        reason_code: "manual_shop_user_password_reset",
        actor_note: resetForm.actorNote.trim(),
      });
      toast.success("Password reset and user sessions revoked.");
      setResettingUser(null);
      setResetForm(initialResetForm);
      await loadUsers(true);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to reset password.");
    } finally {
      setResetSubmitting(false);
    }
  }, [loadUsers, resetForm, resettingUser]);

  const handleDeactivate = useCallback(
    async (user: AdminShopUserRow) => {
      const actorNote = window.prompt(`Actor note for deactivating '${user.username}'`);
      if (!actorNote || !actorNote.trim()) {
        return;
      }

      try {
        await deactivateAdminShopUser(user.user_id, {
          actor: "support-ui",
          reason_code: "manual_shop_user_deactivate",
          actor_note: actorNote.trim(),
        });
        toast.success(`User '${user.username}' deactivated.`);
        await loadUsers(true);
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to deactivate user.");
      }
    },
    [loadUsers],
  );

  const handleReactivate = useCallback(
    async (user: AdminShopUserRow) => {
      const actorNote = window.prompt(`Actor note for reactivating '${user.username}'`);
      if (!actorNote || !actorNote.trim()) {
        return;
      }

      try {
        await reactivateAdminShopUser(user.user_id, {
          actor: "support-ui",
          reason_code: "manual_shop_user_reactivate",
          actor_note: actorNote.trim(),
        });
        toast.success(`User '${user.username}' reactivated.`);
        await loadUsers(true);
      } catch (error) {
        console.error(error);
        toast.error(error instanceof Error ? error.message : "Failed to reactivate user.");
      }
    },
    [loadUsers],
  );

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-end md:justify-between">
        <div className="grid w-full gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="admin-users-shop-select">Shop</Label>
            <select
              id="admin-users-shop-select"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={selectedShopCode}
              onChange={(event) => setSelectedShopCode(event.target.value)}
            >
              {shopOptions.length === 0 ? (
                <option value="">No shops</option>
              ) : (
                shopOptions.map((shop) => (
                  <option key={shop.shop_id} value={shop.shop_code}>
                    {shop.shop_code} - {shop.shop_name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="admin-users-search-input">Search</Label>
            <Input
              id="admin-users-search-input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="username / name / role"
            />
          </div>
          <div className="flex items-center gap-2 self-end pb-1">
            <input
              id="admin-users-include-inactive"
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="admin-users-include-inactive">Include inactive users</Label>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadUsers()} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!selectedShopCode) {
                toast.error("Select a shop first.");
                return;
              }

              setCreateDialogOpen(true);
            }}
          >
            Create User
          </Button>
        </div>
      </div>

      <div className="max-h-[62vh] overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {loading ? "Loading users..." : "No users found for this shop/filter."}
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => (
                <TableRow key={user.user_id}>
                  <TableCell className="font-medium">{user.username}</TableCell>
                  <TableCell>{user.full_name}</TableCell>
                  <TableCell className="capitalize">{roleLabel(user.role_code)}</TableCell>
                  <TableCell>
                    <Badge variant={user.is_active ? "secondary" : "outline"}>
                      {user.is_active ? "active" : "inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(user.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEditDialog(user)}>
                        Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openResetDialog(user)}>
                        Reset Password
                      </Button>
                      {user.is_active ? (
                        <Button variant="outline" size="sm" onClick={() => void handleDeactivate(user)}>
                          Deactivate
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => void handleReactivate(user)}>
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Shop User</DialogTitle>
            <DialogDescription>Create an owner, manager, or cashier for the selected shop.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                value={createForm.username}
                onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="new.user"
              />
            </div>
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input
                value={createForm.fullName}
                onChange={(event) => setCreateForm((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="User full name"
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={createForm.roleCode}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    roleCode: event.target.value as "owner" | "manager" | "cashier",
                  }))
                }
              >
                <option value="owner">owner</option>
                <option value="manager">manager</option>
                <option value="cashier">cashier</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-1">
              <Label>Actor Note</Label>
              <Input
                value={createForm.actorNote}
                onChange={(event) => setCreateForm((current) => ({ ...current, actorNote: event.target.value }))}
                placeholder="Why this account is being created"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateUser()} disabled={createSubmitting}>
              {createSubmitting ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUser(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update username, full name, or role for <span className="font-medium">{editingUser?.username}</span>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Username</Label>
              <Input
                value={editForm.username}
                onChange={(event) => setEditForm((current) => ({ ...current, username: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Full Name</Label>
              <Input
                value={editForm.fullName}
                onChange={(event) => setEditForm((current) => ({ ...current, fullName: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <select
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                value={editForm.roleCode}
                onChange={(event) =>
                  setEditForm((current) => ({
                    ...current,
                    roleCode: event.target.value as "owner" | "manager" | "cashier",
                  }))
                }
              >
                <option value="owner">owner</option>
                <option value="manager">manager</option>
                <option value="cashier">cashier</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label>Actor Note</Label>
              <Input
                value={editForm.actorNote}
                onChange={(event) => setEditForm((current) => ({ ...current, actorNote: event.target.value }))}
                placeholder="Why this user account is updated"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleEditUser()} disabled={editSubmitting}>
              {editSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(resettingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setResettingUser(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for <span className="font-medium">{resettingUser?.username}</span>. Existing sessions
              will be revoked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>New Password</Label>
              <Input
                type="password"
                value={resetForm.newPassword}
                onChange={(event) => setResetForm((current) => ({ ...current, newPassword: event.target.value }))}
                placeholder="At least 8 characters"
              />
            </div>
            <div className="space-y-1">
              <Label>Actor Note</Label>
              <Input
                value={resetForm.actorNote}
                onChange={(event) => setResetForm((current) => ({ ...current, actorNote: event.target.value }))}
                placeholder="Why password reset is required"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResettingUser(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleResetPassword()} disabled={resetSubmitting}>
              {resetSubmitting ? "Resetting..." : "Reset Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminUsersPanel;
