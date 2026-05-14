import { describe, expect, it } from "vitest";
import { buildLocaleHref } from "@/i18n/localePath";

describe("buildLocaleHref", () => {
  it("keeps route segments and swaps locale", () => {
    expect(buildLocaleHref("/si/account", "en")).toBe("/en/account");
    expect(buildLocaleHref("/en/start", "si")).toBe("/si/start");
  });

  it("preserves existing query string", () => {
    const searchParams = new URLSearchParams("plan=starter&checkout=success");
    expect(buildLocaleHref("/en/start", "si", searchParams)).toBe("/si/start?plan=starter&checkout=success");
  });

  it("adds locale segment when path has no locale prefix", () => {
    expect(buildLocaleHref("/admin/login", "si")).toBe("/si/admin/login");
  });

  it("handles root and empty paths", () => {
    expect(buildLocaleHref("/", "si")).toBe("/si");
    expect(buildLocaleHref("", "en")).toBe("/en");
  });
});
