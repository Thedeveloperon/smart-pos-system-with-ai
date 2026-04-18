import AdminLoginForm from "@/components/admin/AdminLoginForm";
import I18nProvider from "@/i18n/I18nProvider";
import { getMessages } from "@/i18n/messages";

export default function AdminLoginPage() {
  return (
    <I18nProvider locale="en" messages={getMessages("en")}>
      <AdminLoginForm />
    </I18nProvider>
  );
}
