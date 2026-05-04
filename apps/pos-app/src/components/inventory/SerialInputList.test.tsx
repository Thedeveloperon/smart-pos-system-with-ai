import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import SerialInputList from "./SerialInputList";

const PLACEHOLDER = "Paste serial numbers (one per line or comma-separated)";

function Harness() {
  const [serials, setSerials] = useState<string[]>([]);

  return <SerialInputList value={serials} onChange={setSerials} />;
}

describe("SerialInputList", () => {
  it("preserves newline separators while typing serials one by one", () => {
    render(<Harness />);

    const textarea = screen.getByPlaceholderText(PLACEHOLDER);

    fireEvent.change(textarea, { target: { value: "SN0001\n" } });
    expect(textarea).toHaveValue("SN0001\n");

    fireEvent.change(textarea, { target: { value: "SN0001\nSN0002" } });
    expect(textarea).toHaveValue("SN0001\nSN0002");
    expect(screen.getByText("2 serials entered")).toBeInTheDocument();
  });

  it("preserves comma separators while typing serials one by one", () => {
    render(<Harness />);

    const textarea = screen.getByPlaceholderText(PLACEHOLDER);

    fireEvent.change(textarea, { target: { value: "SN0001," } });
    expect(textarea).toHaveValue("SN0001,");

    fireEvent.change(textarea, { target: { value: "SN0001,SN0002" } });
    expect(textarea).toHaveValue("SN0001,SN0002");
    expect(screen.getByText("2 serials entered")).toBeInTheDocument();
  });
});
