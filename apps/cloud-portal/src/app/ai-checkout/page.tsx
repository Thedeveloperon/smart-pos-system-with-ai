import { redirect } from "next/navigation";
import { defaultLocale } from "@/i18n/config";

type RootAiCheckoutPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

function appendSearchParamValue(params: URLSearchParams, key: string, value: string | string[] | undefined) {
  if (typeof value === "string") {
    params.set(key, value);
    return;
  }

  if (Array.isArray(value) && value.length > 0) {
    params.set(key, value[0] || "");
  }
}

export default function RootAiCheckoutPage({ searchParams = {} }: RootAiCheckoutPageProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    appendSearchParamValue(params, key, value);
  }

  const query = params.toString();
  redirect(`/${defaultLocale}/ai-checkout${query ? `?${query}` : ""}`);
}

