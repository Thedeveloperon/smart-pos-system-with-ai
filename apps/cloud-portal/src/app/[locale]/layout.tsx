import type { Metadata } from "next";
import { notFound } from "next/navigation";
import I18nProvider from "@/i18n/I18nProvider";
import { isLocale, locales } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: {
    locale: string;
  };
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export function generateMetadata({ params }: LocaleLayoutProps): Metadata {
  if (!isLocale(params.locale)) {
    return {};
  }

  const locale = params.locale;
  const messages = getMessages(locale);
  const meta = messages.meta as {
    siteName: string;
    title: string;
    description: string;
    ogTitle: string;
    ogDescription: string;
    twitterTitle: string;
    twitterDescription: string;
    imageAlt: string;
  };

  return {
    title: {
      default: meta.title,
      template: "%s | SmartPOS",
    },
    description: meta.description,
    alternates: {
      canonical: `/${locale}`,
    },
    openGraph: {
      type: "website",
      locale: locale === "si" ? "si_LK" : "en_US",
      url: `/${locale}`,
      siteName: meta.siteName,
      title: meta.ogTitle,
      description: meta.ogDescription,
      images: [
        {
          url: "/placeholder.svg",
          width: 1200,
          height: 630,
          alt: meta.imageAlt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.twitterTitle,
      description: meta.twitterDescription,
      images: ["/placeholder.svg"],
    },
  };
}

export default function LocaleLayout({ children, params }: LocaleLayoutProps) {
  if (!isLocale(params.locale)) {
    notFound();
  }

  return (
    <I18nProvider locale={params.locale} messages={getMessages(params.locale)}>
      {children}
    </I18nProvider>
  );
}
