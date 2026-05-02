# Denomination Images

This folder stores denomination artwork used by the POS cash-session dialogs.

Current structure:

- `lkr/notes`: Sri Lankan rupee note artwork
- `lkr/coins`: Sri Lankan rupee coin artwork

Guidelines:

- Keep filenames stable so UI components do not need code changes when artwork is replaced.
- Prefer SVG for crisp rendering inside dialogs.
- If developers replace a file with a PNG or WebP later, update the `imagePath` in `apps/pos-app/src/components/pos/cash-session/types.ts`.

