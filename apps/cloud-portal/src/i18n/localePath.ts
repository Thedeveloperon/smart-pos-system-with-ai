import type { Locale } from "@/i18n/config";
import { isLocale } from "@/i18n/config";

type SearchParamsLike = {
  toString: () => string;
} | null | undefined;

export function buildLocaleHref(
  pathname: string | null | undefined,
  targetLocale: Locale,
  searchParams?: SearchParamsLike,
): string {
  const safePathname = pathname && pathname.startsWith("/") ? pathname : `/${pathname ?? ""}`;
  const pathSegments = safePathname.split("/").filter(Boolean);

  if (pathSegments.length === 0) {
    return withSearch(`/${targetLocale}`, searchParams);
  }

  if (isLocale(pathSegments[0])) {
    pathSegments[0] = targetLocale;
  } else {
    pathSegments.unshift(targetLocale);
  }

  return withSearch(`/${pathSegments.join("/")}`, searchParams);
}

function withSearch(pathname: string, searchParams?: SearchParamsLike): string {
  const query = searchParams?.toString().trim();
  return query ? `${pathname}?${query}` : pathname;
}
