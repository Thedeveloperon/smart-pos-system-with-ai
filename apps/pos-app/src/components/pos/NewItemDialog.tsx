import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Camera, Images, Loader2, PackagePlus, Plus, Sparkles, UploadCloud } from "lucide-react";

import {
  createCategory,
  createProduct,
  fetchBrands,
  fetchCategories,
  fetchSuppliers,
  fetchProductCatalogItems,
  generateProductBarcode,
  generateProductFromImageSuggestions,
  generateProductAiSuggestion,
  upsertProductSupplier,
  validateProductBarcode,
  type BrandRecord,
  type SupplierRecord,
  type ProductAiSuggestionTarget,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

type NewItemDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => Promise<void> | void;
};

type CategoryOption = {
  category_id: string;
  name: string;
  is_active: boolean;
  product_count: number;
};

type ExistingImageOption = {
  url: string;
  productName: string;
  productId: string;
  imageHint: string;
};

const defaultForm = {
  name: "",
  sku: "",
  barcode: "",
  imageUrl: "",
  categoryId: "",
  brandId: "",
  preferredSupplierId: "",
  unitPrice: "0",
  costPrice: "0",
  initialStockQuantity: "0",
  reorderLevel: "5",
  safetyStock: "0",
  targetStockLevel: "0",
  allowNegativeStock: true,
  isActive: true,
};
const isBarcodeFeatureEnabled = import.meta.env.VITE_BARCODE_FEATURE_ENABLED !== "false";

const IMAGE_UPLOAD_LIMIT_BYTES = 5 * 1024 * 1024;
const CATEGORY_SUGGESTION_LIMIT = 4;
const CATEGORY_SUGGESTION_MIN_SCORE = 8;
const CATEGORY_STOP_WORDS = new Set([
  "and",
  "by",
  "for",
  "from",
  "item",
  "new",
  "pack",
  "pcs",
  "piece",
  "set",
  "the",
  "with",
]);

const GENERIC_IMAGE_HINT_TOKENS = new Set([
  "camera",
  "capture",
  "download",
  "file",
  "gif",
  "heic",
  "heif",
  "image",
  "img",
  "item",
  "jpeg",
  "jpg",
  "new",
  "png",
  "photo",
  "scan",
  "screenshot",
  "upload",
  "webp",
  "whatsapp",
]);

const CATEGORY_SEMANTIC_GROUPS = [
  {
    id: "beverages",
    label: "Beverages",
    tokens: ["beverage", "beverages", "drink", "drinks", "water", "juice", "cola", "soda", "tea", "coffee", "milk"],
  },
  {
    id: "groceries",
    label: "Groceries",
    tokens: ["grocery", "groceries", "food", "foods", "rice", "flour", "sugar", "salt", "grain", "dhal", "lentil", "spice", "noodle"],
  },
  {
    id: "snacks",
    label: "Snacks",
    tokens: ["snack", "snacks", "biscuit", "cookie", "chips", "chocolate", "candy"],
  },
  {
    id: "personal-care",
    label: "Personal Care",
    tokens: ["personal", "care", "hygiene", "beauty", "soap", "shampoo", "toothpaste", "lotion", "cream"],
  },
  {
    id: "household",
    label: "Household",
    tokens: ["household", "home", "clean", "cleaner", "detergent", "bleach", "dishwash", "tissue"],
  },
  {
    id: "stationery",
    label: "Stationery",
    tokens: ["stationery", "office", "book", "books", "pen", "pencil", "notebook", "paper"],
  },
] as const;

const toCollapsedWhitespace = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .trim();

const normalizeCategoryName = (value: string) => toCollapsedWhitespace(value).toLowerCase();

const toTitleCase = (value: string) =>
  toCollapsedWhitespace(value)
    .split(" ")
    .map((token) => (token ? token[0].toUpperCase() + token.slice(1).toLowerCase() : token))
    .join(" ");

const isHashLikeImageToken = (token: string) => {
  if (!token) {
    return true;
  }

  if (token.length > 24) {
    return true;
  }

  if (/^\d+x\d+(q\d+)?$/.test(token)) {
    return true;
  }

  const digitCount = token.split("").filter((char) => /\d/.test(char)).length;
  const letterCount = token.split("").filter((char) => /[a-z]/i.test(char)).length;

  if (token.length >= 16 && digitCount >= 4 && letterCount >= 4) {
    return true;
  }

  if (token.length >= 12 && digitCount > letterCount) {
    return true;
  }

  return false;
};

const stemToken = (token: string) => {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
};

const tokenizeCategoryContext = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !CATEGORY_STOP_WORDS.has(token));

const inferSemanticGroups = (tokens: readonly string[]) => {
  const tokenSet = new Set(tokens.map(stemToken));
  const groups = new Set<string>();

  for (const group of CATEGORY_SEMANTIC_GROUPS) {
    const hasToken = group.tokens.some((token) => tokenSet.has(stemToken(token)));
    if (hasToken) {
      groups.add(group.id);
    }
  }

  return groups;
};

const inferCategoryCreateSuggestion = (name: string, imageHint: string) => {
  const contextTokens = tokenizeCategoryContext(`${name} ${imageHint}`);
  if (contextTokens.length === 0) {
    return "";
  }

  const tokenSet = new Set(contextTokens.map(stemToken));
  const scoredGroups = CATEGORY_SEMANTIC_GROUPS
    .map((group) => ({
      group,
      score: group.tokens.reduce((sum, token) => sum + (tokenSet.has(stemToken(token)) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score);

  if (scoredGroups[0]?.score > 0) {
    return scoredGroups[0].group.label;
  }

  const fallback = contextTokens
    .filter((token) => !/^\d+$/.test(token) && token.length > 2)
    .slice(0, 2)
    .join(" ");

  return fallback ? toTitleCase(fallback) : "";
};

const NewItemDialog = ({ open, onOpenChange, onCreated }: NewItemDialogProps) => {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [loadingExistingImages, setLoadingExistingImages] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [generatingBarcode, setGeneratingBarcode] = useState(false);
  const [validatingBarcode, setValidatingBarcode] = useState(false);
  const [barcodeValidationMessage, setBarcodeValidationMessage] = useState("");
  const [barcodeValidationTone, setBarcodeValidationTone] = useState<"neutral" | "success" | "error">("neutral");
  const [aiSuggestingTarget, setAiSuggestingTarget] = useState<ProductAiSuggestionTarget | null>(null);
  const [aiAnalyzingFromImage, setAiAnalyzingFromImage] = useState(false);
  const [imagePickerOpen, setImagePickerOpen] = useState(false);
  const [imagePickerQuery, setImagePickerQuery] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [uploadedImageDataUrl, setUploadedImageDataUrl] = useState("");
  const [uploadedImageHint, setUploadedImageHint] = useState("");
  const [uploadedImageFileNameHint, setUploadedImageFileNameHint] = useState("");
  const [existingImages, setExistingImages] = useState<ExistingImageOption[]>([]);
  const [categoryCreateName, setCategoryCreateName] = useState("");
  const [categoryCreateDirty, setCategoryCreateDirty] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const captureInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const items = await fetchCategories(true);
      setCategories(items);
      return items;
    } catch (error) {
      console.error(error);
      toast.error("Failed to load categories.");
      return [];
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  const loadBrands = useCallback(async () => {
    setLoadingBrands(true);
    try {
      const items = await fetchBrands(true);
      setBrands(items);
      return items;
    } catch (error) {
      console.error(error);
      toast.error("Failed to load brands.");
      return [];
    } finally {
      setLoadingBrands(false);
    }
  }, []);

  const loadSuppliers = useCallback(async () => {
    setLoadingSuppliers(true);
    try {
      const items = await fetchSuppliers(true);
      setSuppliers(items);
      return items;
    } catch (error) {
      console.error(error);
      toast.error("Failed to load suppliers.");
      return [];
    } finally {
      setLoadingSuppliers(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm(defaultForm);
    setAiSuggestingTarget(null);
    setAiAnalyzingFromImage(false);
    setImagePickerOpen(false);
    setImagePickerQuery("");
    setUploadedImageDataUrl("");
    setUploadedImageHint("");
    setUploadedImageFileNameHint("");
    setCategoryCreateName("");
    setCategoryCreateDirty(false);
    setCreatingCategory(false);

    const loadExistingImages = async () => {
      setLoadingExistingImages(true);
      try {
        const catalogItems = await fetchProductCatalogItems(200, true);
        const uniqueByUrl = new Map<string, ExistingImageOption>();

        for (const item of catalogItems) {
          const imageUrl = item.imageUrl?.trim();
          if (!imageUrl) {
            continue;
          }

          if (!uniqueByUrl.has(imageUrl)) {
            uniqueByUrl.set(imageUrl, {
              url: imageUrl,
              productName: item.name,
              productId: item.id,
              imageHint: item.name,
            });
          }
        }

        setExistingImages(Array.from(uniqueByUrl.values()));
      } catch (error) {
        console.error(error);
        toast.error("Failed to load existing item images.");
      } finally {
        setLoadingExistingImages(false);
      }
    };

    void Promise.all([loadCategories(), loadBrands(), loadSuppliers(), loadExistingImages()]);
  }, [loadBrands, loadCategories, loadSuppliers, open]);

  const categoryOptions = useMemo(
    () => categories.filter((category) => category.is_active),
    [categories]
  );

  const selectedCategoryName = useMemo(
    () => categoryOptions.find((category) => category.category_id === form.categoryId)?.name || "",
    [categoryOptions, form.categoryId]
  );

  const selectedBrandName = useMemo(
    () => brands.find((brand) => brand.id === form.brandId)?.name || "",
    [brands, form.brandId]
  );

  const selectedSupplierName = useMemo(
    () => suppliers.find((supplier) => supplier.id === form.preferredSupplierId)?.name || "",
    [form.preferredSupplierId, suppliers]
  );

  const effectiveImageHint = useMemo(() => {
    const candidates = [uploadedImageHint.trim(), uploadedImageFileNameHint.trim()].filter(Boolean);
    if (candidates.length === 0) {
      return "";
    }

    const unique: string[] = [];
    for (const candidate of candidates) {
      if (!unique.some((item) => item.toLowerCase() === candidate.toLowerCase())) {
        unique.push(candidate);
      }
    }

    return toCollapsedWhitespace(unique.join(" "));
  }, [uploadedImageFileNameHint, uploadedImageHint]);

  const allCategoriesByNormalizedName = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const category of categories) {
      const normalized = normalizeCategoryName(category.name);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, category);
      }
    }
    return map;
  }, [categories]);

  const activeCategoriesByNormalizedName = useMemo(() => {
    const map = new Map<string, CategoryOption>();
    for (const category of categoryOptions) {
      const normalized = normalizeCategoryName(category.name);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, category);
      }
    }
    return map;
  }, [categoryOptions]);

  const categoryCreateSuggestion = useMemo(
    () => inferCategoryCreateSuggestion(form.name, effectiveImageHint),
    [effectiveImageHint, form.name]
  );

  useEffect(() => {
    if (!open || categoryCreateDirty) {
      return;
    }

    setCategoryCreateName(categoryCreateSuggestion);
  }, [categoryCreateDirty, categoryCreateSuggestion, open]);

  const categorySuggestions = useMemo(() => {
    if (categoryOptions.length === 0) {
      return [];
    }

    const context = toCollapsedWhitespace(`${form.name} ${effectiveImageHint}`).toLowerCase();
    if (!context) {
      return [...categoryOptions]
        .sort(
          (left, right) =>
            (right.product_count ?? 0) - (left.product_count ?? 0) ||
            left.name.localeCompare(right.name)
        )
        .slice(0, CATEGORY_SUGGESTION_LIMIT);
    }

    const contextTokens = tokenizeCategoryContext(context).map(stemToken);
    if (contextTokens.length === 0) {
      return [];
    }

    const contextTokenSet = new Set(contextTokens);
    const contextSemanticGroups = inferSemanticGroups(contextTokens);
    const scored = categoryOptions
      .map((category) => {
        const categoryName = category.name.toLowerCase();
        const categoryTokens = tokenizeCategoryContext(categoryName).map(stemToken);
        const categorySemanticGroups = inferSemanticGroups(categoryTokens);
        let score = 0;

        if (context.includes(categoryName)) {
          score += 18;
        }

        for (const token of categoryTokens) {
          if (contextTokenSet.has(token)) {
            score += 6;
          }
        }

        for (const token of contextTokenSet) {
          if (token.length > 2 && categoryName.includes(token)) {
            score += 2;
          }
        }

        for (const semanticGroup of contextSemanticGroups) {
          if (categorySemanticGroups.has(semanticGroup)) {
            score += 8;
          }
        }

        if (score > 0) {
          score += Math.min(3, Math.floor(Math.log10((category.product_count ?? 0) + 1)));
        }

        return { category, score };
      })
      .sort((left, right) => right.score - left.score);

    return scored
      .filter((item) => item.score >= CATEGORY_SUGGESTION_MIN_SCORE)
      .map((item) => item.category)
      .slice(0, CATEGORY_SUGGESTION_LIMIT);
  }, [categoryOptions, effectiveImageHint, form.name]);

  const shouldShowCreateCategory = useMemo(() => {
    const hasContext = Boolean(toCollapsedWhitespace(`${form.name} ${effectiveImageHint}`));
    return hasContext && !form.categoryId && categorySuggestions.length === 0;
  }, [categorySuggestions.length, effectiveImageHint, form.categoryId, form.name]);

  const normalizedCategoryCreateName = normalizeCategoryName(categoryCreateName || categoryCreateSuggestion);
  const duplicateCategoryMatch = normalizedCategoryCreateName
    ? allCategoriesByNormalizedName.get(normalizedCategoryCreateName)
    : undefined;

  const imagePreviewUrl = uploadedImageDataUrl || form.imageUrl.trim();
  const imageAiSource = uploadedImageDataUrl || form.imageUrl.trim();
  const filteredExistingImages = useMemo(() => {
    const query = imagePickerQuery.trim().toLowerCase();
    if (!query) {
      return existingImages;
    }

    return existingImages.filter((option) => option.productName.toLowerCase().includes(query));
  }, [existingImages, imagePickerQuery]);

  const applyCategorySuggestion = (suggestion: string, showCreateHint = true) => {
    const normalizedSuggestion = normalizeCategoryName(suggestion);
    const matching = activeCategoriesByNormalizedName.get(normalizedSuggestion);
    if (matching) {
      setForm((prev) => ({ ...prev, categoryId: matching.category_id }));
      return { matched: true };
    }

    const inactiveMatch = allCategoriesByNormalizedName.get(normalizedSuggestion);
    if (inactiveMatch && !inactiveMatch.is_active) {
      toast.error(`"${inactiveMatch.name}" exists but is inactive. Reactivate it from category management.`);
      return { matched: false, inactive: true };
    }

    setCategoryCreateName(toTitleCase(suggestion));
    setCategoryCreateDirty(true);
    if (showCreateHint) {
      toast.info(`No matching category found. Create "${suggestion}".`);
    }

    return { matched: false, inactive: false };
  };

  const handleAiSuggestion = async (target: ProductAiSuggestionTarget) => {
    if (aiSuggestingTarget) {
      return;
    }

    if (target !== "image_url" && !form.name.trim() && !imageAiSource && !effectiveImageHint) {
      toast.error("Add item image or item name first to generate suggestions.");
      return;
    }

    const unitPrice = Number(form.unitPrice);
    const costPrice = Number(form.costPrice);

    setAiSuggestingTarget(target);
    try {
      const response = await generateProductAiSuggestion({
        target,
        name: form.name.trim() || null,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        image_url: imageAiSource || null,
        image_hint: effectiveImageHint || null,
        category_name: selectedCategoryName || null,
        category_options: categoryOptions.map((category) => category.name),
        unit_price: Number.isFinite(unitPrice) ? unitPrice : null,
        cost_price: Number.isFinite(costPrice) ? costPrice : null,
      });

      const suggestion = response.suggestion.trim();
      if (!suggestion) {
        toast.error("AI did not return a suggestion.");
        return;
      }

      if (target === "name") {
        setForm((prev) => ({ ...prev, name: suggestion }));
      } else if (target === "sku") {
        setForm((prev) => ({ ...prev, sku: suggestion }));
      } else if (target === "barcode") {
        setForm((prev) => ({ ...prev, barcode: suggestion }));
      } else if (target === "image_url") {
        setUploadedImageDataUrl("");
        setUploadedImageHint("");
        setUploadedImageFileNameHint("");
        setForm((prev) => ({ ...prev, imageUrl: suggestion }));
      } else if (target === "category") {
        const result = applyCategorySuggestion(suggestion);
        if (result.inactive) {
          return;
        }
      }

      toast.success(`AI suggestion applied for ${target.replace("_", " ")}.`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to generate AI suggestion.");
    } finally {
      setAiSuggestingTarget(null);
    }
  };

  const handleGenerateBarcode = async () => {
    if (!isBarcodeFeatureEnabled) {
      toast.info("Barcode feature is disabled for this rollout.");
      return;
    }

    if (generatingBarcode) {
      return;
    }

    setGeneratingBarcode(true);
    try {
      const response = await generateProductBarcode({
        name: form.name.trim() || null,
        sku: form.sku.trim() || null,
      });

      const generated = response.barcode?.trim() || "";
      if (!generated) {
        toast.error("Barcode generator did not return a value.");
        return;
      }

      setForm((prev) => ({ ...prev, barcode: generated }));
      setBarcodeValidationMessage("Generated EAN-13 barcode is ready.");
      setBarcodeValidationTone("success");
      toast.success("Barcode generated.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to generate barcode.");
    } finally {
      setGeneratingBarcode(false);
    }
  };

  const handleBarcodeBlur = async () => {
    if (!isBarcodeFeatureEnabled) {
      setBarcodeValidationMessage("");
      setBarcodeValidationTone("neutral");
      return;
    }

    const barcode = form.barcode.trim();
    if (!barcode) {
      setBarcodeValidationMessage("");
      setBarcodeValidationTone("neutral");
      return;
    }

    setValidatingBarcode(true);
    try {
      const response = await validateProductBarcode({
        barcode,
        check_existing: true,
      });

      if (!response.is_valid) {
        setBarcodeValidationMessage(response.message || "Barcode format is invalid.");
        setBarcodeValidationTone("error");
        return;
      }

      if (response.exists) {
        setBarcodeValidationMessage("Barcode already exists in another product.");
        setBarcodeValidationTone("error");
        return;
      }

      setBarcodeValidationMessage(`Barcode is valid (${response.format}).`);
      setBarcodeValidationTone("success");
    } catch (error) {
      console.error(error);
      setBarcodeValidationMessage(error instanceof Error ? error.message : "Failed to validate barcode.");
      setBarcodeValidationTone("error");
    } finally {
      setValidatingBarcode(false);
    }
  };

  const handleAnalyzeFromImage = async () => {
    if (aiAnalyzingFromImage) {
      return;
    }

    const imageSource = imageAiSource;
    const imageHint = effectiveImageHint;
    if (!imageSource && !imageHint) {
      toast.error("Add or capture an image first.");
      return;
    }

    const unitPrice = Number(form.unitPrice);
    const costPrice = Number(form.costPrice);

    setAiAnalyzingFromImage(true);
    try {
      const response = await generateProductFromImageSuggestions({
        image_url: imageSource || null,
        image_hint: imageHint || null,
        name: form.name.trim() || null,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        category_name: selectedCategoryName || null,
        category_options: categoryOptions.map((category) => category.name),
        unit_price: Number.isFinite(unitPrice) ? unitPrice : null,
        cost_price: Number.isFinite(costPrice) ? costPrice : null,
      });

      const suggestedName = response.name?.trim() || "";
      const suggestedSku = response.sku?.trim() || "";
      const suggestedBarcode = response.barcode?.trim() || "";
      const suggestedCategory = response.category?.trim() || "";
      const isLocalFallback = (response.source || "").toLowerCase() === "local";

      setForm((prev) => ({
        ...prev,
        name: suggestedName || prev.name,
        sku: suggestedSku || prev.sku,
        barcode: suggestedBarcode || prev.barcode,
      }));

      let categoryApplied = false;
      if (suggestedCategory) {
        const result = applyCategorySuggestion(suggestedCategory, true);
        categoryApplied = !!result.matched;
      }

      const filledFields = [
        suggestedName && "name",
        suggestedSku && "SKU",
        suggestedBarcode && "barcode",
        suggestedCategory && categoryApplied && "category",
      ].filter(Boolean);

      if (filledFields.length === 0) {
        toast.info("Image analyzed, but no fields could be confidently suggested.");
      } else {
        toast.success(`Image analyzed. Suggested: ${filledFields.join(", ")}.`);
      }

      if (isLocalFallback && imageHint) {
        toast.info("Vision service unavailable. Suggestions were generated from item name/image hint.");
      }
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to analyze image.");
    } finally {
      setAiAnalyzingFromImage(false);
    }
  };

  const handleUseExistingCategory = (category: CategoryOption, silent = false) => {
    setForm((prev) => ({ ...prev, categoryId: category.category_id }));
    if (!silent) {
      toast.success(`Selected existing category "${category.name}".`);
    }
  };

  const handleCreateCategory = async () => {
    if (creatingCategory) {
      return;
    }

    const resolvedName = toCollapsedWhitespace(categoryCreateName || categoryCreateSuggestion);
    if (!resolvedName) {
      toast.error("Enter a category name first.");
      return;
    }

    const normalized = normalizeCategoryName(resolvedName);
    const existing = allCategoriesByNormalizedName.get(normalized);
    if (existing) {
      if (!existing.is_active) {
        toast.error(`"${existing.name}" already exists but is inactive. Reactivate it from category management.`);
        return;
      }
      handleUseExistingCategory(existing);
      return;
    }

    setCreatingCategory(true);
    try {
      const created = await createCategory({
        name: resolvedName,
        description: null,
        is_active: true,
      });

      setCategories((prev) => {
        const next = [...prev, created];
        next.sort((left, right) => left.name.localeCompare(right.name));
        return next;
      });
      setForm((prev) => ({ ...prev, categoryId: created.category_id }));
      setCategoryCreateName("");
      setCategoryCreateDirty(false);
      toast.success(`Category "${created.name}" created and selected.`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Failed to create category.";

      if (/already exists/i.test(message)) {
        const refreshed = await loadCategories();
        const duplicate = refreshed.find(
          (category) => normalizeCategoryName(category.name) === normalized
        );
        if (duplicate) {
          if (!duplicate.is_active) {
            toast.error(`"${duplicate.name}" already exists but is inactive. Reactivate it from category management.`);
            return;
          }
          handleUseExistingCategory(duplicate);
          return;
        }
      }

      toast.error(message);
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleSelectExistingImage = (option: ExistingImageOption) => {
    setUploadedImageDataUrl("");
    setUploadedImageHint(option.imageHint);
    setUploadedImageFileNameHint(option.productName);
    setForm((prev) => ({ ...prev, imageUrl: option.url }));
    setImagePickerOpen(false);
    setImagePickerQuery("");
    toast.success("Image selected from existing uploads.");
  };

  const toRawFileNameHint = (fileName: string) => {
    const normalized = toCollapsedWhitespace(
      fileName
        .replace(/\.[a-z0-9]+$/i, "")
        .replace(/[_-]+/g, " ")
        .trim()
    );

    if (!normalized) {
      return "";
    }

    if (/^(pic|img|dsc|pxl|photo)\s*\d+$/i.test(normalized)) {
      return "";
    }

    return normalized.slice(0, 80);
  };

  const toImageHint = (fileName: string) => {
    const normalized = fileName
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) {
      return "";
    }

    const cleanTokens = normalized
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .filter((token) => token.length > 1)
      .filter((token) => /[a-z]/.test(token))
      .filter((token) => !/^(pic|img|dsc|pxl|photo)\d+$/i.test(token))
      .filter((token) => !isHashLikeImageToken(token))
      .filter((token) => !GENERIC_IMAGE_HINT_TOKENS.has(token));

    if (cleanTokens.length === 0) {
      return "";
    }

    return toTitleCase(cleanTokens.slice(0, 4).join(" "));
  };

  const handleLocalImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }

    if (file.size > IMAGE_UPLOAD_LIMIT_BYTES) {
      toast.error("Image must be 5MB or smaller.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        toast.error("Failed to read the selected image.");
        return;
      }

      setUploadedImageDataUrl(result);
      setUploadedImageHint(toImageHint(file.name));
      setUploadedImageFileNameHint(toRawFileNameHint(file.name));
      toast.success("Image captured/uploaded from device.");
    };
    reader.onerror = () => {
      toast.error("Failed to read the selected image.");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = form.name.trim();
    const unitPrice = Number(form.unitPrice);
    const costPrice = Number(form.costPrice);
    const initialStockQuantity = Number(form.initialStockQuantity);
    const reorderLevel = Number(form.reorderLevel);
    const safetyStock = Number(form.safetyStock);
    const targetStockLevel = Number(form.targetStockLevel);

    if (!name) {
      toast.error("Item name is required.");
      return;
    }

    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      toast.error("Enter a valid unit price.");
      return;
    }

    if (!Number.isFinite(costPrice) || costPrice < 0) {
      toast.error("Enter a valid cost price.");
      return;
    }

    if (!Number.isFinite(initialStockQuantity) || initialStockQuantity < 0) {
      toast.error("Enter a valid starting stock quantity.");
      return;
    }

    if (!Number.isFinite(reorderLevel) || reorderLevel < 0) {
      toast.error("Enter a valid reorder level.");
      return;
    }

    if (!Number.isFinite(safetyStock) || safetyStock < 0) {
      toast.error("Enter a valid safety stock value.");
      return;
    }

    if (!Number.isFinite(targetStockLevel) || targetStockLevel < 0) {
      toast.error("Enter a valid target stock level.");
      return;
    }

    setSubmitting(true);
    try {
      const imageSource = uploadedImageDataUrl || form.imageUrl.trim();
      const createdProduct = await createProduct({
        name,
        sku: form.sku.trim() || null,
        barcode: form.barcode.trim() || null,
        image_url: imageSource || null,
        category_id: form.categoryId || null,
        brand_id: form.brandId || null,
        unit_price: unitPrice,
        cost_price: costPrice,
        initial_stock_quantity: initialStockQuantity,
        reorder_level: reorderLevel,
        safety_stock: safetyStock,
        target_stock_level: targetStockLevel,
        allow_negative_stock: form.allowNegativeStock,
        is_active: form.isActive,
      });

      if (form.preferredSupplierId) {
        try {
          const preferredSupplier = suppliers.find((supplier) => supplier.id === form.preferredSupplierId);
          await upsertProductSupplier(createdProduct.id, {
            supplier_id: form.preferredSupplierId,
            supplier_sku: form.sku.trim() || null,
            supplier_item_name: name,
            is_preferred: true,
            is_active: true,
            last_purchase_price: costPrice,
          });
          if (preferredSupplier) {
            toast.success(`Linked preferred supplier "${preferredSupplier.name}".`);
          }
        } catch (supplierError) {
          console.error(supplierError);
          toast.warning("Item saved, but supplier link could not be saved.");
        }
      }

      toast.success("New item added.");
      onOpenChange(false);
      await onCreated?.();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Failed to add item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[96vh] w-[96vw] max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-[#f7f8fa] p-0 shadow-2xl">
        <div className="border-b border-slate-300 bg-transparent px-5 py-4">
          <DialogHeader className="space-y-1 text-left sm:text-left">
            <DialogTitle className="text-[1.8rem] font-semibold tracking-tight text-slate-800">
              Add New Item
            </DialogTitle>
            <DialogDescription className="max-w-2xl text-sm text-slate-500">
              Create products in the same visual tone as the checkout flow.
            </DialogDescription>
          </DialogHeader>
        </div>

        <form className="flex min-h-0 flex-1 flex-col px-5 py-4" onSubmit={handleSubmit}>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="space-y-4 rounded-2xl border border-slate-300 bg-white p-3">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="imageUrl" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Item image URL
                  </Label>
                  <input
                    ref={captureInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={handleLocalImageChange}
                  />
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleLocalImageChange}
                  />
                  <div className="flex items-center gap-2">
                    <Input
                      id="imageUrl"
                      type="url"
                      value={form.imageUrl}
                      onChange={(event) => {
                        setUploadedImageDataUrl("");
                        setUploadedImageHint("");
                        setUploadedImageFileNameHint("");
                        setForm((prev) => ({ ...prev, imageUrl: event.target.value }));
                      }}
                      placeholder="https://..."
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl border-slate-300 bg-white px-4 text-sm font-semibold"
                      size="default"
                      onClick={() => void handleAnalyzeFromImage()}
                      disabled={aiAnalyzingFromImage}
                    >
                      {aiAnalyzingFromImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      Identify fields from image
                    </Button>
                  </div>
                  <p className="text-[11px] leading-4 text-muted-foreground">
                    Select from uploaded images, paste URL, or use camera/upload. AI can suggest fields from image context.
                  </p>
                  {effectiveImageHint && <p className="text-xs text-muted-foreground">Image hint: {effectiveImageHint}</p>}
                  {uploadedImageDataUrl && (
                    <p className="text-xs text-primary">Using captured/uploaded image from this device.</p>
                  )}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Item name
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="name"
                      value={form.name}
                      onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="e.g. Ceylon Tea 100g"
                      autoFocus
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl border-slate-300 bg-white"
                      onClick={() => void handleAiSuggestion("name")}
                      title="AI suggest item name"
                      disabled={!!aiSuggestingTarget}
                    >
                      {aiSuggestingTarget === "name" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sku" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    SKU
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="sku"
                      value={form.sku}
                      onChange={(event) => setForm((prev) => ({ ...prev, sku: event.target.value }))}
                      placeholder="Optional SKU"
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl border-slate-300 bg-white"
                      onClick={() => void handleAiSuggestion("sku")}
                      title="AI suggest SKU"
                      disabled={!!aiSuggestingTarget}
                    >
                      {aiSuggestingTarget === "sku" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="barcode" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Barcode
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="barcode"
                      value={form.barcode}
                      onChange={(event) => {
                        setForm((prev) => ({ ...prev, barcode: event.target.value }));
                        setBarcodeValidationMessage("");
                        setBarcodeValidationTone("neutral");
                      }}
                      onBlur={() => void handleBarcodeBlur()}
                      placeholder="Optional barcode"
                      className="h-10 rounded-xl border-slate-300 bg-white"
                    />
                    {isBarcodeFeatureEnabled ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 rounded-xl border-slate-300 bg-white px-3 text-xs font-semibold uppercase tracking-[0.08em]"
                          onClick={() => void handleGenerateBarcode()}
                          title="Generate EAN-13 barcode"
                          disabled={generatingBarcode || validatingBarcode || submitting}
                        >
                          {generatingBarcode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Gen"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-xl border-slate-300 bg-white"
                          onClick={() => void handleAiSuggestion("barcode")}
                          title="AI suggest barcode"
                          disabled={!!aiSuggestingTarget || generatingBarcode || validatingBarcode}
                        >
                          {aiSuggestingTarget === "barcode" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        </Button>
                      </>
                    ) : null}
                  </div>
                  {validatingBarcode ? (
                    <p className="text-[11px] text-slate-500">Validating barcode...</p>
                  ) : barcodeValidationMessage ? (
                    <p
                      className={`text-[11px] ${
                        barcodeValidationTone === "success" ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {barcodeValidationMessage}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Category</Label>
                  <div className="flex items-center gap-2">
                    <Select
                      value={form.categoryId}
                      onValueChange={(value) =>
                        setForm((prev) => ({ ...prev, categoryId: value === "__none__" ? "" : value }))
                      }
                    >
                      <SelectTrigger className="h-10 flex-1 rounded-xl border-slate-300 bg-white">
                        <SelectValue
                          placeholder={loadingCategories ? "Loading categories..." : "Select category (optional)"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No category</SelectItem>
                        {categoryOptions.map((category) => (
                          <SelectItem key={category.category_id} value={category.category_id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-xl border-slate-300 bg-white"
                      onClick={() => void handleAiSuggestion("category")}
                      title="AI suggest category"
                      disabled={!!aiSuggestingTarget}
                    >
                      {aiSuggestingTarget === "category" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                  </div>
                  {categorySuggestions.length > 0 && (
                    <div className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-3 py-1.5">
                      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Sparkles className="h-3.5 w-3.5" />
                        Category suggestions
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {categorySuggestions.map((category) => (
                          <Button
                            key={category.category_id}
                            type="button"
                            size="sm"
                            variant={form.categoryId === category.category_id ? "default" : "outline"}
                            onClick={() => setForm((prev) => ({ ...prev, categoryId: category.category_id }))}
                            className="h-7 rounded-full px-3 text-[0.85rem]"
                          >
                            {category.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  {shouldShowCreateCategory && (
                    <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5">
                      <p className="text-[11px] text-muted-foreground">
                        No suitable category found. Create a new one for this item.
                      </p>
                      <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
                        <Input
                          value={categoryCreateName}
                          onChange={(event) => {
                            setCategoryCreateDirty(true);
                            setCategoryCreateName(event.target.value);
                          }}
                          placeholder={categoryCreateSuggestion || "e.g. Beverages"}
                          className="h-10 rounded-xl border-slate-300 bg-white sm:flex-1"
                        />
                        <Button
                          type="button"
                          onClick={() => void handleCreateCategory()}
                          disabled={creatingCategory || !normalizedCategoryCreateName}
                        >
                          {creatingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Create category
                        </Button>
                      </div>
                      {duplicateCategoryMatch && duplicateCategoryMatch.is_active && (
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>"{duplicateCategoryMatch.name}" already exists.</span>
                          <Button
                            type="button"
                            variant="link"
                            className="h-auto p-0 text-xs"
                            onClick={() => handleUseExistingCategory(duplicateCategoryMatch)}
                          >
                            Use existing
                          </Button>
                        </div>
                      )}
                      {duplicateCategoryMatch && !duplicateCategoryMatch.is_active && (
                        <p className="mt-2 text-xs text-amber-700">
                          "{duplicateCategoryMatch.name}" already exists but is inactive. Reactivate it from category management.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Brand</Label>
                  <Select
                    value={form.brandId || "__none__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, brandId: value === "__none__" ? "" : value }))
                    }
                  >
                    <SelectTrigger aria-label="Brand" className="h-10 rounded-xl border-slate-300 bg-white">
                      <SelectValue
                        placeholder={loadingBrands ? "Loading brands..." : "Select brand (optional)"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No brand</SelectItem>
                      {brands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Preferred supplier
                  </Label>
                  <Select
                    value={form.preferredSupplierId || "__none__"}
                    onValueChange={(value) =>
                      setForm((prev) => ({ ...prev, preferredSupplierId: value === "__none__" ? "" : value }))
                    }
                  >
                    <SelectTrigger aria-label="Preferred supplier" className="h-10 rounded-xl border-slate-300 bg-white">
                      <SelectValue
                        placeholder={loadingSuppliers ? "Loading suppliers..." : "Select supplier (optional)"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No supplier</SelectItem>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="unitPrice" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Unit price
                  </Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.unitPrice}
                    onChange={(event) => setForm((prev) => ({ ...prev, unitPrice: event.target.value }))}
                    className="h-10 rounded-xl border-slate-300 bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="costPrice" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Cost price
                  </Label>
                  <Input
                    id="costPrice"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costPrice}
                    onChange={(event) => setForm((prev) => ({ ...prev, costPrice: event.target.value }))}
                    className="h-10 rounded-xl border-slate-300 bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="initialStockQuantity" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Initial stock
                  </Label>
                  <Input
                    id="initialStockQuantity"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.initialStockQuantity}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, initialStockQuantity: event.target.value }))
                    }
                    className="h-10 rounded-xl border-slate-300 bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reorderLevel" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Reorder level
                  </Label>
                  <Input
                    id="reorderLevel"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.reorderLevel}
                    onChange={(event) => setForm((prev) => ({ ...prev, reorderLevel: event.target.value }))}
                    className="h-10 rounded-xl border-slate-300 bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="safetyStock" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Safety stock
                  </Label>
                  <Input
                    id="safetyStock"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.safetyStock}
                    onChange={(event) => setForm((prev) => ({ ...prev, safetyStock: event.target.value }))}
                    className="h-10 rounded-xl border-slate-300 bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetStockLevel" className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Target stock
                  </Label>
                  <Input
                    id="targetStockLevel"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.targetStockLevel}
                    onChange={(event) => setForm((prev) => ({ ...prev, targetStockLevel: event.target.value }))}
                    className="h-10 rounded-xl border-slate-300 bg-white"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-transparent px-4 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
                    Live Preview
                  </p>
                </div>
                <div className="space-y-2.5 p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <PackagePlus className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[1.15rem] font-semibold">
                        {form.name.trim() || "Item name"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {form.categoryId
                          ? categoryOptions.find((category) => category.category_id === form.categoryId)?.name ||
                            "Selected category"
                          : "Groceries"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedBrandName || "No brand"}
                        {selectedSupplierName ? ` | ${selectedSupplierName}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-1 rounded-xl border border-slate-200 bg-[#f9fafb] p-2.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-emerald-700">Unit price</span>
                      <span className="font-semibold text-slate-800">Rs. {Number(form.unitPrice || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-emerald-700">Cost price</span>
                      <span className="font-semibold text-slate-800">Rs. {Number(form.costPrice || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Initial stock</span>
                      <span className="font-semibold text-slate-800">{Number(form.initialStockQuantity || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Reorder level</span>
                      <span className="font-semibold text-slate-800">{Number(form.reorderLevel || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Safety stock</span>
                      <span className="font-semibold text-slate-800">{Number(form.safetyStock || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Target stock</span>
                      <span className="font-semibold text-slate-800">{Number(form.targetStockLevel || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
                <div className="p-3">
                  {imagePreviewUrl ? (
                    <div className="overflow-hidden rounded-xl border border-border bg-muted">
                      <img
                        src={imagePreviewUrl}
                        alt="Item preview"
                        className="h-36 w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="grid h-36 place-items-center rounded-xl border border-dashed border-slate-300 bg-[#f9fafb] text-center">
                      <div className="space-y-1 px-6">
                        <Images className="mx-auto h-10 w-10 text-slate-300" />
                        <p className="text-sm font-medium text-slate-600">Catalog visual preview</p>
                      </div>
                    </div>
                  )}
                  <div className="mt-2.5 flex items-center justify-end gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-lg border-slate-300 bg-white"
                      onClick={() => uploadInputRef.current?.click()}
                      title="Upload image"
                    >
                      <UploadCloud className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-lg border-slate-300 bg-white"
                      onClick={() => captureInputRef.current?.click()}
                      title="Capture photo"
                    >
                      <Camera className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-lg border-slate-300 bg-white"
                      onClick={() => void handleAiSuggestion("image_url")}
                      title="AI suggest image URL"
                      disabled={!!aiSuggestingTarget}
                    >
                      {aiSuggestingTarget === "image_url" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    </Button>
                    <Popover open={imagePickerOpen} onOpenChange={setImagePickerOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="icon" className="h-9 w-9 rounded-lg border-slate-300 bg-white" title="Select from uploaded images">
                          <Images className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-[360px] p-0">
                        <div className="space-y-2 border-b border-border px-3 py-2">
                          <p className="text-sm font-medium">Existing uploaded images</p>
                          <p className="text-xs text-muted-foreground">Choose an image already used in catalog items.</p>
                          <Input
                            value={imagePickerQuery}
                            onChange={(event) => setImagePickerQuery(event.target.value)}
                            placeholder="Search by product name..."
                            className="h-8 text-xs"
                          />
                        </div>
                        <ScrollArea className="h-72">
                          <div className="grid grid-cols-2 gap-2 p-3">
                            {loadingExistingImages && (
                              <p className="col-span-2 text-xs text-muted-foreground">Loading images...</p>
                            )}
                            {!loadingExistingImages && existingImages.length === 0 && (
                              <p className="col-span-2 text-xs text-muted-foreground">No uploaded images found yet.</p>
                            )}
                            {!loadingExistingImages && existingImages.length > 0 && filteredExistingImages.length === 0 && (
                              <p className="col-span-2 text-xs text-muted-foreground">No matching images found.</p>
                            )}
                            {!loadingExistingImages &&
                              filteredExistingImages.map((option) => (
                                <button
                                  key={`${option.productId}-${option.url}`}
                                  type="button"
                                  className="group overflow-hidden rounded-md border border-border text-left transition-colors hover:border-primary/50"
                                  onClick={() => handleSelectExistingImage(option)}
                                >
                                  <img src={option.url} alt={option.productName} className="h-24 w-full object-cover" />
                                  <div className="p-2">
                                    <p className="truncate text-xs font-medium">{option.productName}</p>
                                  </div>
                                </button>
                              ))}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-300 bg-white p-4">
                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-300 bg-[#f9fafb] px-4 py-2.5">
                  <p className="text-sm font-medium leading-none">Allow negative stock</p>
                  <Switch
                    checked={form.allowNegativeStock}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, allowNegativeStock: checked }))
                    }
                  />
                </label>

                <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-300 bg-[#f9fafb] px-4 py-2.5">
                  <p className="text-sm font-medium leading-none">Active item</p>
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
                  />
                </label>
              </div>
            </div>
            </div>
          </div>

          <DialogFooter className="gap-2 border-t border-slate-300 bg-slate-100 px-5 py-3 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="h-10 rounded-xl border-slate-300 bg-white px-6 text-[1rem] font-semibold"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} className="h-10 rounded-xl px-6 text-[1rem] font-semibold">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Item
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewItemDialog;
