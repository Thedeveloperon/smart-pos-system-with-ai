import { useEffect } from "react";

interface UsePosShortcutsOptions {
  enabled?: boolean;
  actionsEnabled?: boolean;
  onFocusSearch: () => void;
  onHoldBill: () => void;
  onOpenCashWorkflow: () => void;
  onCompleteSale: () => void;
  onOpenHelp: () => void;
  onEscape?: () => void;
}

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  if (target.isContentEditable) {
    return true;
  }

  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
};

const REPEAT_BLOCKED_ACTION_KEYS = new Set(["F2", "F4", "F8", "F9"]);

export const usePosShortcuts = ({
  enabled = true,
  actionsEnabled = true,
  onFocusSearch,
  onHoldBill,
  onOpenCashWorkflow,
  onCompleteSale,
  onOpenHelp,
  onEscape,
}: UsePosShortcutsOptions) => {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const typingTarget = isTypingTarget(event.target);

      if (event.key === "F1") {
        event.preventDefault();
        onOpenHelp();
        return;
      }

      if ((event.key === "?" || (event.key === "/" && event.shiftKey)) && !typingTarget) {
        event.preventDefault();
        onOpenHelp();
        return;
      }

      if (event.key === "Escape") {
        onEscape?.();
        return;
      }

      if (typingTarget) {
        return;
      }

      if (!actionsEnabled) {
        return;
      }

      if (event.repeat && REPEAT_BLOCKED_ACTION_KEYS.has(event.key)) {
        return;
      }

      if (event.key === "F2") {
        event.preventDefault();
        onFocusSearch();
        return;
      }

      if (event.key === "F4") {
        event.preventDefault();
        onHoldBill();
        return;
      }

      if (event.key === "F8") {
        event.preventDefault();
        onOpenCashWorkflow();
        return;
      }

      if (event.key === "F9") {
        event.preventDefault();
        onCompleteSale();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    enabled,
    actionsEnabled,
    onCompleteSale,
    onEscape,
    onFocusSearch,
    onHoldBill,
    onOpenCashWorkflow,
    onOpenHelp,
  ]);
};
