import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type Props = {
  value: string[];
  onChange: (serials: string[]) => void;
};

const RANGE_LIMIT = 1000;

const parse = (raw: string): string[] =>
  raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

type RangeResult = {
  serials: string[];
  error: string | null;
};

const generateRange = (startRaw: string, endRaw: string): RangeResult => {
  const start = startRaw.trim();
  const end = endRaw.trim();

  if (!start && !end) {
    return { serials: [], error: null };
  }

  if (!start || !end) {
    return { serials: [], error: null };
  }

  const startMatch = start.match(/^(.*?)(\d+)$/);
  const endMatch = end.match(/^(.*?)(\d+)$/);

  if (!startMatch || !endMatch) {
    return {
      serials: [],
      error: "Range generation requires start and end serials that finish with numbers.",
    };
  }

  const [, startPrefix, startDigits] = startMatch;
  const [, endPrefix, endDigits] = endMatch;

  if (startPrefix !== endPrefix) {
    return {
      serials: [],
      error: "Start and end serials must use the same prefix.",
    };
  }

  const startNumber = Number.parseInt(startDigits, 10);
  const endNumber = Number.parseInt(endDigits, 10);

  if (endNumber < startNumber) {
    return {
      serials: [],
      error: "End serial must be greater than or equal to the start serial.",
    };
  }

  const total = endNumber - startNumber + 1;
  if (total > RANGE_LIMIT) {
    return {
      serials: [],
      error: `Ranges can include up to ${RANGE_LIMIT} serials at once.`,
    };
  }

  const shouldPad =
    startDigits.length === endDigits.length ||
    startDigits.startsWith("0") ||
    endDigits.startsWith("0");
  const width = shouldPad ? Math.max(startDigits.length, endDigits.length) : 0;

  return {
    serials: Array.from({ length: total }, (_, index) => {
      const current = String(startNumber + index);
      const suffix = width > 0 ? current.padStart(width, "0") : current;
      return `${startPrefix}${suffix}`;
    }),
    error: null,
  };
};

const formatPreview = (serials: string[]) => {
  if (serials.length <= 4) {
    return serials.join(", ");
  }

  return `${serials.slice(0, 3).join(", ")} ... ${serials.at(-1)}`;
};

export default function SerialInputList({ value, onChange }: Props) {
  const [text, setText] = useState(value.join("\n"));
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  useEffect(() => {
    setText(value.join("\n"));
  }, [value]);

  const rangeResult = generateRange(rangeStart, rangeEnd);

  const handleTextChange = (nextText: string) => {
    setText(nextText);
    onChange(parse(nextText));
  };

  const handleAppendRange = () => {
    if (rangeResult.serials.length === 0) {
      return;
    }

    const existing = parse(text);
    const seen = new Set(existing.map((serial) => serial.toLowerCase()));
    const serialsToAppend = rangeResult.serials.filter((serial) => {
      const key = serial.toLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

    const nextSerials = [...existing, ...serialsToAppend];
    handleTextChange(nextSerials.join("\n"));
    setRangeStart("");
    setRangeEnd("");
  };

  return (
    <div className="space-y-3">
      <Textarea
        rows={6}
        placeholder="Paste serial numbers (one per line or comma-separated)"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
      />
      <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Generate from range</p>
          <p className="text-xs text-muted-foreground">
            Use matching prefixes with numeric endings, for example{" "}
            <span className="font-mono">SN0001 to SN0010</span>.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="serial-range-start">Start serial</Label>
            <Input
              id="serial-range-start"
              placeholder="SN0001"
              value={rangeStart}
              onChange={(e) => setRangeStart(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="serial-range-end">End serial</Label>
            <Input
              id="serial-range-end"
              placeholder="SN0010"
              value={rangeEnd}
              onChange={(e) => setRangeEnd(e.target.value)}
            />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleAppendRange}
            disabled={rangeResult.serials.length === 0}
          >
            Add range
          </Button>
        </div>

        {rangeResult.error ? (
          <p className="text-sm text-destructive">{rangeResult.error}</p>
        ) : (
          rangeResult.serials.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {rangeResult.serials.length} serials ready:{" "}
              <span className="font-mono">{formatPreview(rangeResult.serials)}</span>
            </p>
          )
        )}
      </div>
      <div className="flex justify-end">
        <Badge variant="secondary">{parse(text).length} serials entered</Badge>
      </div>
    </div>
  );
}
