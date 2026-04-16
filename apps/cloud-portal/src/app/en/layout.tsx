import I18nProvider from "@/i18n/I18nProvider";
import { getMessages } from "@/i18n/messages";

type LocaleLayoutProps = {
  children: React.ReactNode;
};

export default function EnglishLayout({ children }: LocaleLayoutProps) {
  return <I18nProvider locale="en" messages={getMessages("en")}>{children}</I18nProvider>;
}
