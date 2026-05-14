export type PosShortcutId =
  | "focusSearch"
  | "holdBill"
  | "openCashWorkflow"
  | "completeSale"
  | "openHelp";

export interface PosShortcutDefinition {
  id: PosShortcutId;
  key: string;
  description: string;
}

export const POS_SHORTCUTS: PosShortcutDefinition[] = [
  { id: "focusSearch", key: "F2", description: "Focus product search" },
  { id: "holdBill", key: "F4", description: "Hold current bill" },
  { id: "openCashWorkflow", key: "F8", description: "Open cash workflow" },
  { id: "completeSale", key: "F9", description: "Complete sale (when valid)" },
  { id: "openHelp", key: "F1 or ?", description: "Open shortcut help" },
];

export const POS_SHORTCUT_LABELS = {
  focusSearch: "F2",
  holdBill: "F4",
  openCashWorkflow: "F8",
  completeSale: "F9",
  openHelp: "F1/?",
} as const;

export const POS_SHORTCUT_INLINE_HINT =
  "F2 Search | F4 Hold | F8 Cash | F9 Complete | F1 Help";
