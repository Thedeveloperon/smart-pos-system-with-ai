import { interactive, claudeCode } from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";

// Interactive no-sandbox mode.
// This uses your local Claude Code login instead of requiring ANTHROPIC_API_KEY.
// Important: this runs on your host machine, not inside Docker.

await interactive({
  name: "worker",

  sandbox: noSandbox(),

  agent: claudeCode("claude-opus-4-6"),

  promptFile: "./.sandcastle/prompt.md",

  branchStrategy: { type: "merge-to-head" },
});