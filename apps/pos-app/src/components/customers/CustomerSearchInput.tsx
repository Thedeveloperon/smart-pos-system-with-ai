import type { ReactNode } from "react";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type CustomerSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  wrapperClassName?: string;
  loading?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  children?: ReactNode;
};

export default function CustomerSearchInput({
  value,
  onChange,
  placeholder = "Search customers...",
  className,
  wrapperClassName,
  loading = false,
  onFocus,
  onBlur,
  children,
}: CustomerSearchInputProps) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        className={cn("pl-9", className)}
      />
      {loading && <Loader2 className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />}
      {children}
    </div>
  );
}
