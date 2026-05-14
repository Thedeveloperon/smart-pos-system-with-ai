import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FaqBrowser } from "./FaqBrowser";

describe("FaqBrowser", () => {
  it("hides unsupported categories and still sends supported questions", () => {
    const onSendQuestion = vi.fn();

    render(<FaqBrowser onSendQuestion={onSendQuestion} language="english" />);

    expect(screen.queryByText("Customers")).not.toBeInTheDocument();
    expect(screen.queryByText("Alerts & Exceptions")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Which items are currently low in stock?" }));

    expect(onSendQuestion).toHaveBeenCalledWith("Which items are currently low in stock?");
  });

  it("renders Tamil FAQ text and localized placeholders", () => {
    const onSendQuestion = vi.fn();

    render(<FaqBrowser onSendQuestion={onSendQuestion} language="tamil" />);

    expect(screen.getByText("பொதுவான கேள்விகளை பார்க்க ஒரு வகையை தேர்ந்தெடுக்கவும்:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "சரக்கு மற்றும் இன்வெண்டரி" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\{பொருள் பெயர்\}.+சரக்கு அளவு என்ன\?/ }));
    fireEvent.change(screen.getByPlaceholderText("பொருள் பெயர் உள்ளிடவும்..."), {
      target: { value: "Milk" },
    });
    fireEvent.click(screen.getByRole("button", { name: "கேள்வியை அனுப்பு" }));

    expect(onSendQuestion).toHaveBeenCalledWith("Milk இன் தற்போதைய சரக்கு அளவு என்ன?");
  });
});
