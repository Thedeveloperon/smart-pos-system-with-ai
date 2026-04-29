import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type Props = {
  value: string[];
  onChange: (serials: string[]) => void;
};

const parse = (raw: string): string[] =>
  raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

export default function SerialInputList({ value, onChange }: Props) {
  const [text, setText] = useState(value.join("\n"));

  useEffect(() => {
    setText(value.join("\n"));
  }, [value]);

  return (
    <div className="space-y-2">
      <Textarea
        rows={6}
        placeholder="Paste serial numbers (one per line or comma-separated)"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parse(e.target.value));
        }}
      />
      <div className="flex justify-end">
        <Badge variant="secondary">{parse(text).length} serials entered</Badge>
      </div>
    </div>
  );
}
