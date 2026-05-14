import type { ReactNode } from "react";

import type { ButtonProps } from "@/components/ui/button";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type ConfirmationDialogConfig = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
};

export type ConfirmationDialogProps = ConfirmationDialogConfig & {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onOpenChange?: (open: boolean) => void;
  confirmDisabled?: boolean;
  cancelDisabled?: boolean;
  confirmContent?: ReactNode;
};

const ConfirmationDialog = ({
  open,
  onConfirm,
  onCancel,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant,
  confirmDisabled,
  cancelDisabled,
  confirmContent,
}: ConfirmationDialogProps) => {
  const handleOpenChange = (nextOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(nextOpen);
      return;
    }

    if (!nextOpen) {
      onCancel();
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} disabled={cancelDisabled}>
            {cancelLabel || "Cancel"}
          </AlertDialogCancel>
          <Button type="button" variant={confirmVariant || "default"} onClick={onConfirm} disabled={confirmDisabled}>
            {confirmContent || confirmLabel || "Confirm"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export { ConfirmationDialog };
