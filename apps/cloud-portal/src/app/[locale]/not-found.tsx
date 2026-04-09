"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";

export default function LocaleNotFound() {
  const { locale, t } = useI18n();

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">{t("notFound.title")}</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("notFound.message")}</p>
        <Link href={`/${locale}`} className="text-primary underline hover:text-primary/90">
          {t("notFound.action")}
        </Link>
      </div>
    </div>
  );
}
