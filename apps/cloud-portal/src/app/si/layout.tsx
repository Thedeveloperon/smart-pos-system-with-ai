import I18nProvider from "@/i18n/I18nProvider";
import { getMessages } from "@/i18n/messages";

type LocaleLayoutProps = {
  children: React.ReactNode;
};

export default function SinhalaLayout({ children }: LocaleLayoutProps) {
  return <I18nProvider locale="si" messages={getMessages("si")}>{children}</I18nProvider>;
}
