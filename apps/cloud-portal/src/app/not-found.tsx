import Link from "next/link";
import { defaultLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";

export default function NotFound() {
  const messages = getMessages(defaultLocale);
  const notFound = messages.notFound as {
    title: string;
    message: string;
    action: string;
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">{notFound.title}</h1>
        <p className="mb-4 text-xl text-muted-foreground">{notFound.message}</p>
        <Link href={`/${defaultLocale}`} className="text-primary underline hover:text-primary/90">
          {notFound.action}
        </Link>
      </div>
    </div>
  );
}
