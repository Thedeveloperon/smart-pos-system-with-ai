import type { Locale } from "@/i18n/config";
import { defaultLocale } from "@/i18n/config";
import en from "../../messages/en.json";
import si from "../../messages/si.json";

export type MessageDictionary = Record<string, unknown>;

const dictionaries: Record<Locale, MessageDictionary> = {
  en: en as MessageDictionary,
  si: si as MessageDictionary,
};

export function getMessages(locale: Locale): MessageDictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}
