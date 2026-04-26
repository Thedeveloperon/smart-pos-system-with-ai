import { createRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrowserMultiFormatReader } from "@zxing/browser";
import ProductSearchPanel, { type ProductSearchPanelHandle } from "./ProductSearchPanel";
import type { Product } from "./types";

const sampleProducts: Product[] = [
  {
    id: "prod-1",
    name: "Milk 1L",
    sku: "MILK-1L",
    barcode: "1234567890128",
    price: 450,
    stock: 20,
  },
];

const openBarcodeMode = () => {
  fireEvent.click(screen.getByRole("button", { name: "Switch to barcode mode" }));
};

const toggleCameraSwitch = () => {
  fireEvent.click(screen.getByRole("switch", { name: "Camera barcode scanner" }));
};

describe("ProductSearchPanel barcode mode", () => {
  it("adds exact barcode match to cart when Enter is pressed in barcode mode", () => {
    const onAddToCart = vi.fn();

    render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

    openBarcodeMode();
    const input = screen.getByPlaceholderText("Scan or enter barcode...");

    fireEvent.change(input, { target: { value: "1234567890128" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onAddToCart).toHaveBeenCalledWith(sampleProducts[0], 1);
    expect(input).toHaveValue("");
  });

  it("shows clear no-match feedback for scanner-like bursts", () => {
    const onAddToCart = vi.fn();

    render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

    openBarcodeMode();
    const input = screen.getByPlaceholderText("Scan or enter barcode...");

    for (const key of "9999999999999") {
      fireEvent.keyDown(input, { key });
    }
    fireEvent.change(input, { target: { value: "9999999999999" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onAddToCart).not.toHaveBeenCalled();
    expect(screen.getByText('No product matched scanned barcode "9999999999999".')).toBeInTheDocument();
  });

  it("does not auto-add product on Enter in manual mode", () => {
    const onAddToCart = vi.fn();

    render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

    const input = screen.getByPlaceholderText("Search products by name, SKU...");
    fireEvent.change(input, { target: { value: "Milk" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(onAddToCart).not.toHaveBeenCalled();
  });

  it("supports focusSearch imperative handle for shortcut focus behavior", () => {
    const onAddToCart = vi.fn();
    const panelRef = createRef<ProductSearchPanelHandle>();

    render(<ProductSearchPanel ref={panelRef} products={sampleProducts} onAddToCart={onAddToCart} />);

    const input = screen.getByPlaceholderText("Search products by name, SKU...");
    input.blur();

    act(() => {
      panelRef.current?.focusSearch();
    });

    expect(input).toHaveFocus();
  });

  it("enables camera scan when mediaDevices is available even without BarcodeDetector", async () => {
    const onAddToCart = vi.fn();
    const originalMediaDevices = navigator.mediaDevices;
    const decodeSpy = vi.spyOn(BrowserMultiFormatReader.prototype, "decodeFromConstraints").mockResolvedValue({
      stop: vi.fn(),
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
      },
    });

    try {
      render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

      openBarcodeMode();
      toggleCameraSwitch();

      await waitFor(() => expect(decodeSpy).toHaveBeenCalledOnce());
      expect(
        screen.queryByText("Camera barcode scan is unavailable in this browser. Use scanner input and Enter."),
      ).not.toBeInTheDocument();
    } finally {
      decodeSpy.mockRestore();
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
    }
  });

  it("keeps camera running until cashier turns switch off", async () => {
    const onAddToCart = vi.fn();
    const originalMediaDevices = navigator.mediaDevices;
    const stopSpy = vi.fn();
    const decodeSpy = vi.spyOn(BrowserMultiFormatReader.prototype, "decodeFromConstraints").mockResolvedValue({
      stop: stopSpy,
    });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
      },
    });

    try {
      render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

      openBarcodeMode();
      const cameraSwitch = screen.getByRole("switch", { name: "Camera barcode scanner" });
      expect(cameraSwitch).toHaveAttribute("aria-checked", "false");

      toggleCameraSwitch();

      await waitFor(() => expect(decodeSpy).toHaveBeenCalledOnce());
      expect(cameraSwitch).toHaveAttribute("aria-checked", "true");
      expect(stopSpy).not.toHaveBeenCalled();

      toggleCameraSwitch();

      await waitFor(() => expect(stopSpy).toHaveBeenCalledOnce());
      expect(cameraSwitch).toHaveAttribute("aria-checked", "false");
    } finally {
      decodeSpy.mockRestore();
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
    }
  });

  it("retries with relaxed camera constraints when preferred constraints fail with NotFoundError", async () => {
    const onAddToCart = vi.fn();
    const originalMediaDevices = navigator.mediaDevices;
    const decodeSpy = vi
      .spyOn(BrowserMultiFormatReader.prototype, "decodeFromConstraints")
      .mockRejectedValueOnce(new DOMException("No preferred camera", "NotFoundError"))
      .mockResolvedValueOnce({
        stop: vi.fn(),
      });

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
      },
    });

    try {
      render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

      openBarcodeMode();
      toggleCameraSwitch();

      await waitFor(() => expect(decodeSpy).toHaveBeenCalledTimes(2));
      expect(decodeSpy.mock.calls[0]?.[0]).toMatchObject({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      expect(decodeSpy.mock.calls[1]?.[0]).toEqual({
        audio: false,
        video: true,
      });
    } finally {
      decodeSpy.mockRestore();
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
    }
  });

  it("shows no-camera feedback only after both startup attempts fail", async () => {
    const onAddToCart = vi.fn();
    const originalMediaDevices = navigator.mediaDevices;
    const decodeSpy = vi
      .spyOn(BrowserMultiFormatReader.prototype, "decodeFromConstraints")
      .mockRejectedValue(new DOMException("No camera devices", "NotFoundError"));

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(),
      },
    });

    try {
      render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

      openBarcodeMode();
      toggleCameraSwitch();

      await waitFor(() => expect(decodeSpy).toHaveBeenCalledTimes(2));
      expect(screen.getByText("No camera device was found on this system.")).toBeInTheDocument();
      expect(screen.getByRole("switch", { name: "Camera barcode scanner" })).toHaveAttribute("aria-checked", "false");
    } finally {
      decodeSpy.mockRestore();
      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
    }
  });

  it("shows clear fallback when camera scan is unavailable", () => {
    const onAddToCart = vi.fn();

    render(<ProductSearchPanel products={sampleProducts} onAddToCart={onAddToCart} />);

    openBarcodeMode();
    toggleCameraSwitch();

    expect(
      screen.getByText("Camera barcode scan is unavailable in this browser. Use scanner input and Enter."),
    ).toBeInTheDocument();
  });
});
