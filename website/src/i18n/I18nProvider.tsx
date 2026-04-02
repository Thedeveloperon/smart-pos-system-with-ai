"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import type { Locale } from "@/i18n/config";
import type { MessageDictionary } from "@/i18n/messages";

type I18nContextValue = {
  locale: Locale;
  t: (path: string) => string;
  get: <T>(path: string) => T;
};

const I18nContext = createContext<I18nContextValue | null>(null);

type I18nProviderProps = {
  locale: Locale;
  messages: MessageDictionary;
  children: React.ReactNode;
};

function resolvePath(messages: MessageDictionary, path: string): unknown {
  return path.split(".").reduce<unknown>((currentValue, key) => {
    if (currentValue && typeof currentValue === "object" && key in currentValue) {
      return (currentValue as Record<string, unknown>)[key];
    }
    return undefined;
  }, messages);
}

export default function I18nProvider({ locale, messages, children }: I18nProviderProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      t: (path) => {
        const resolvedValue = resolvePath(messages, path);
        if (typeof resolvedValue === "string" || typeof resolvedValue === "number") {
          return String(resolvedValue);
        }
        return path;
      },
      get: <T,>(path: string) => resolvePath(messages, path) as T,
    }),
    [locale, messages],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }

  return context;
}
