import type { ShopProfileLanguage } from "@/lib/api";

export type PosChatbotFaqPlaceholder = {
  key: string;
  label: string;
};

export type PosChatbotFaqQuestion = {
  id: string;
  text: string;
  template: string;
  placeholders: PosChatbotFaqPlaceholder[];
};

export type PosChatbotFaqCategory = {
  id: string;
  label: string;
  questions: PosChatbotFaqQuestion[];
};

type LocalizedValue = {
  english: string;
  sinhala?: string;
  tamil?: string;
};

const v1SupportedCategoryIds = new Set([
  "stock_inventory",
  "sales",
  "purchasing_suppliers",
  "pricing_profit",
  "cashier_operations",
  "reports_summaries",
]);

const placeholderLabels: Record<string, LocalizedValue> = {
  item_name: {
    english: "item name",
    sinhala: "භාණ්ඩ නම",
    tamil: "பொருள் பெயர்",
  },
  brand: {
    english: "brand",
    sinhala: "වෙළඳ නාමය",
    tamil: "பிராண்ட்",
  },
  supplier: {
    english: "supplier",
    sinhala: "සැපයුම්කරු",
    tamil: "விநியோகஸ்தர்",
  },
  category: {
    english: "category",
    sinhala: "කාණ්ඩය",
    tamil: "வகை",
  },
  customer_name: {
    english: "customer name",
    sinhala: "පාරිභෝගික නම",
    tamil: "வாடிக்கையாளர் பெயர்",
  },
};

const rawCategories: ReadonlyArray<{
  id: string;
  label: LocalizedValue;
  templates: ReadonlyArray<LocalizedValue>;
}> = [
  {
    id: "stock_inventory",
    label: {
      english: "Stock & Inventory",
      sinhala: "තොග සහ ඉන්වෙන්ටරි",
      tamil: "சரக்கு மற்றும் இன்வெண்டரி",
    },
    templates: [
      {
        english: "What is the current stock count of {item_name}?",
        sinhala: "{item_name} හි වත්මන් තොග ගණන කීයද?",
      },
      {
        english: "How many units of {item_name} are available right now?",
        sinhala: "දැනට {item_name} හි පවතින ඒකක ගණන කීයද?",
      },
      {
        english: "Which items are currently low in stock?",
        sinhala: "දැනට තොග අඩු භාණ්ඩ මොනවාද?",
      },
      {
        english: "What are the low stock items of {brand}?",
        sinhala: "{brand} වෙළඳ නාමයේ තොග අඩු භාණ්ඩ මොනවාද?",
      },
      {
        english: "What are the low stock items of {supplier}?",
        sinhala: "{supplier} සැපයුම්කරුගේ තොග අඩු භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which items are out of stock?",
        sinhala: "තොග අවසන් වූ භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which items will run out soon?",
        sinhala: "ඉක්මනින් තොග අවසන් වීමට යන භාණ්ඩ මොනවාද?",
      },
      {
        english: "What are the overstocked items?",
        sinhala: "අධික තොග ඇති භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which products have not been restocked recently?",
        sinhala: "පසුකාලීනව නැවත තොග කරන නොලද භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which items were restocked today?",
        sinhala: "අද නැවත තොග කරන ලද භාණ්ඩ මොනවාද?",
      },
      {
        english: "What is the stock value of {item_name}?",
        sinhala: "{item_name} හි තොග වටිනාකම කීයද?",
      },
      {
        english: "What is the total stock value of {brand}?",
        sinhala: "{brand} වෙළඳ නාමයේ සමස්ත තොග වටිනාකම කීයද?",
      },
      {
        english: "Show me stock movement for {item_name}.",
        sinhala: "{item_name} සඳහා තොග චලනය පෙන්වන්න.",
      },
      {
        english: "Which items have zero sales but still have stock?",
        sinhala: "විකුණුම් ශූන්‍ය නමුත් තොග තිබෙන භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which items are expiring soon?",
        sinhala: "ඉක්මනින් කල් ඉකුත් වීමට යන භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which expired items are still in stock?",
        sinhala: "කල් ඉකුත් වූවත් තවමත් තොගයේ තිබෙන භාණ්ඩ මොනවාද?",
      },
    ],
  },
  {
    id: "sales",
    label: {
      english: "Sales",
      sinhala: "විකුණුම්",
      tamil: "விற்பனை",
    },
    templates: [
      {
        english: "What are the best-selling items today?",
        sinhala: "අද වැඩිපුරම විකුණුම් වූ භාණ්ඩ මොනවාද?",
      },
      {
        english: "What are the best-selling items this week?",
        sinhala: "මෙම සතියේ වැඩිපුරම විකුණුම් වූ භාණ්ඩ මොනවාද?",
      },
      {
        english: "What are the worst-selling items this month?",
        sinhala: "මෙම මාසයේ අඩුවෙන්ම විකුණුම් වූ භාණ්ඩ මොනවාද?",
      },
      {
        english: "How many units of {item_name} were sold today?",
        sinhala: "අද {item_name} හි විකුණුම් ඒකක ගණන කීයද?",
      },
      {
        english: "What were the sales of {brand} today?",
        sinhala: "අද {brand} වෙළඳ නාමයේ විකුණුම් කොපමණද?",
      },
      {
        english: "What were the sales of {category} this week?",
        sinhala: "මෙම සතියේ {category} කාණ්ඩයේ විකුණුම් කොපමණද?",
      },
      {
        english: "Which items had no sales today?",
        sinhala: "අද විකුණුම් නොවූ භාණ්ඩ මොනවාද?",
      },
      {
        english: "What is the total sales amount today?",
        sinhala: "අද සමස්ත විකුණුම් මුදල කීයද?",
      },
      {
        english: "What is the average bill value today?",
        sinhala: "අද සාමාන්‍ය බිල් වටිනාකම කීයද?",
      },
      {
        english: "How many transactions were made today?",
        sinhala: "අද සිදු වූ ගනුදෙනු ගණන කීයද?",
      },
      {
        english: "Which cashier made the highest sales today?",
        sinhala: "අද වැඩිම විකුණුම් කළ කැෂියර් කවුද?",
      },
      {
        english: "What were the busiest sales hours today?",
        sinhala: "අද වැඩිපුරම විකුණුම් වූ පැය මොනවාද?",
      },
      {
        english: "Compare today's sales with yesterday.",
        sinhala: "අද විකුණුම් ඊයේ විකුණුම් සමඟ සසඳන්න.",
      },
      {
        english: "Compare this week's sales with last week.",
        sinhala: "මෙම සතියේ විකුණුම් පසුගිය සතිය සමඟ සසඳන්න.",
      },
      {
        english: "Which products generate the highest revenue?",
        sinhala: "වැඩිම ආදායම ලබාදෙන භාණ්ඩ මොනවාද?",
      },
    ],
  },
  {
    id: "purchasing_suppliers",
    label: {
      english: "Purchasing & Suppliers",
      sinhala: "මිලදී ගැනීම් සහ සැපයුම්කරුවන්",
      tamil: "கொள்முதல் மற்றும் விநியோகஸ்தர்கள்",
    },
    templates: [
      {
        english: "Which items should I reorder now?",
        sinhala: "දැන් නැවත ඇණවුම් කළ යුතු භාණ්ඩ මොනවාද?",
      },
      {
        english: "What are the low stock items from {supplier}?",
        sinhala: "{supplier} වෙතින් ලැබෙන තොග අඩු භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which supplier provides {item_name}?",
        sinhala: "{item_name} සපයන සැපයුම්කරු කවුද?",
      },
      {
        english: "What was the last purchase date of {item_name}?",
        sinhala: "{item_name} හි අවසන් මිලදී ගත් දිනය කවදාද?",
      },
      {
        english: "What was the last purchase price of {item_name}?",
        sinhala: "{item_name} හි අවසන් මිලදී ගැනීමේ මිල කීයද?",
      },
      {
        english: "Which supplier orders are still pending?",
        sinhala: "තවමත් ඉතිරිව ඇති සැපයුම්කරු ඇණවුම් මොනවාද?",
      },
      {
        english: "Which items have not been purchased recently?",
        sinhala: "පසුකාලීනව මිලදී නොගත් භාණ්ඩ මොනවාද?",
      },
      {
        english: "What items did we buy from {supplier} this month?",
        sinhala: "මෙම මාසයේ {supplier} වෙතින් මිලදී ගත් භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which suppliers have the highest purchase value?",
        sinhala: "වැඩිම මිලදී ගැනීමේ වටිනාකම ඇති සැපයුම්කරුවන් මොනවාද?",
      },
      {
        english: "Show recent purchase history for {item_name}.",
        sinhala: "{item_name} සඳහා මෑත මිලදී ගැනීමේ ඉතිහාසය පෙන්වන්න.",
      },
    ],
  },
  {
    id: "pricing_profit",
    label: {
      english: "Pricing & Profit",
      sinhala: "මිල සහ ලාභ",
      tamil: "விலை மற்றும் லாபம்",
    },
    templates: [
      {
        english: "What is the selling price of {item_name}?",
        sinhala: "{item_name} හි විකිණීමේ මිල කීයද?",
      },
      {
        english: "What is the cost price of {item_name}?",
        sinhala: "{item_name} හි පිරිවැය මිල කීයද?",
      },
      {
        english: "What is the profit margin of {item_name}?",
        sinhala: "{item_name} හි ලාභ අනුපාතය කීයද?",
      },
      {
        english: "Which items have the highest profit margin?",
        sinhala: "ඉහළම ලාභ අනුපාතය ඇති භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which items have the lowest profit margin?",
        sinhala: "අඩුම ලාභ අනුපාතය ඇති භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which products are being sold below expected margin?",
        sinhala: "අපේක්ෂිත ලාභ අනුපාතයට වඩා අඩුවෙන් විකුණන භාණ්ඩ මොනවාද?",
      },
      {
        english: "Show me discounted items today.",
        sinhala: "අද වට්ටම් දී ඇති භාණ්ඩ පෙන්වන්න.",
      },
      {
        english: "Which items had price changes recently?",
        sinhala: "පසුකාලීනව මිල වෙනස් වූ භාණ්ඩ මොනවාද?",
      },
      {
        english: "What is the profit earned today?",
        sinhala: "අද උපයාගත් ලාභය කීයද?",
      },
      {
        english: "What is the profit from {brand} this month?",
        sinhala: "මෙම මාසයේ {brand} වෙළඳ නාමයෙන් ලැබුණු ලාභය කීයද?",
      },
    ],
  },
  {
    id: "customers",
    label: {
      english: "Customers",
      sinhala: "පාරිභෝගිකයින්",
      tamil: "வாடிக்கையாளர்கள்",
    },
    templates: [
      {
        english: "Which customers bought {item_name} recently?",
        sinhala: "පසුකාලීනව {item_name} මිලදී ගත් පාරිභෝගිකයින් කවුද?",
      },
      {
        english: "Who are the top customers this month?",
        sinhala: "මෙම මාසයේ ප්‍රමුඛ පාරිභෝගිකයින් කවුද?",
      },
      {
        english: "Which customers have not purchased recently?",
        sinhala: "පසුකාලීනව මිලදී නොගත් පාරිභෝගිකයින් කවුද?",
      },
      {
        english: "What did {customer_name} buy last time?",
        sinhala: "{customer_name} අවසන් වරට මිලදී ගත්තේ මොනවාද?",
      },
      {
        english: "How much has {customer_name} spent this month?",
        sinhala: "මෙම මාසයේ {customer_name} වියදම් කළ මුදල කොපමණද?",
      },
      {
        english: "Which items are most popular among customers?",
        sinhala: "පාරිභෝගිකයින් අතර වැඩිපුර ජනප්‍රිය භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which customers have pending payments?",
        sinhala: "ගෙවීමට ඉතිරි මුදල් ඇති පාරිභෝගිකයින් කවුද?",
      },
      {
        english: "Show recent sales for {customer_name}.",
        sinhala: "{customer_name} සඳහා මෑත විකුණුම් පෙන්වන්න.",
      },
    ],
  },
  {
    id: "cashier_operations",
    label: {
      english: "Cashier & Operations",
      sinhala: "කැෂියර් සහ මෙහෙයුම්",
      tamil: "காசாளர் மற்றும் செயல்பாடுகள்",
    },
    templates: [
      {
        english: "Who opened the cashier session today?",
        sinhala: "අද කැෂියර් සැසිය ආරම්භ කළේ කවුද?",
      },
      {
        english: "Is the cashier session currently open?",
        sinhala: "දැනට කැෂියර් සැසිය විවෘතද?",
      },
      {
        english: "What is the current cash balance in the drawer?",
        sinhala: "ඩ්‍රෝවර් එකේ වත්මන් නගද ශේෂය කීයද?",
      },
      {
        english: "What were the total cash sales today?",
        sinhala: "අද සමස්ත මුදල් විකුණුම් කොපමණද?",
      },
      {
        english: "What were the total card sales today?",
        sinhala: "අද සමස්ත කාඩ් විකුණුම් කොපමණද?",
      },
      {
        english: "Were there any refunds today?",
        sinhala: "අද ආපසු ගෙවීම් තිබුණාද?",
      },
      {
        english: "Which items were refunded today?",
        sinhala: "අද ආපසු ගෙවූ භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which cashier handled the most transactions today?",
        sinhala: "අද වැඩිම ගනුදෙනු සිදු කළ කැෂියර් කවුද?",
      },
      {
        english: "Show voided bills from today.",
        sinhala: "අද අවලංගු කළ බිල් පෙන්වන්න.",
      },
      {
        english: "Were there any suspicious discounts today?",
        sinhala: "අද සැකසහිත වට්ටම් තිබුණාද?",
      },
    ],
  },
  {
    id: "alerts_exceptions",
    label: {
      english: "Alerts & Exceptions",
      sinhala: "අවවාද සහ විශේෂත්ව",
      tamil: "அலர்ட்கள் மற்றும் விதிவிலக்குகள்",
    },
    templates: [
      {
        english: "Show me items that need immediate restocking.",
        sinhala: "තාක්ෂණිකවම තොග කළ යුතු භාණ්ඩ පෙන්වන්න.",
      },
      {
        english: "Which items are below minimum stock level?",
        sinhala: "අවම තොග මට්ටමට පහළ භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which items are selling unusually fast today?",
        sinhala: "අද අසාමාන්‍ය ලෙස වේගයෙන් විකුණන භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which items are not selling at all this week?",
        sinhala: "මෙම සතියේ කිසිසේත්ම විකුණන නොවන භාණ්ඩ මොනවාද?",
      },
      {
        english: "Are there any stock mismatches for {item_name}?",
        sinhala: "{item_name} සඳහා තොග නොගැළපීම් තිබේද?",
      },
      {
        english: "Which products have negative stock?",
        sinhala: "ඍණ තොග ඇති භාණ්ඩ මොනවාද?",
      },
      {
        english: "Which items were manually adjusted today?",
        sinhala: "අද අතින් සංශෝධනය කළ භාණ්ඩ මොනවාද?",
      },
      {
        english: "Show unusual sales activity today.",
        sinhala: "අද අසාමාන්‍ය විකුණුම් ක්‍රියාකාරකම් පෙන්වන්න.",
      },
      {
        english: "Which items have frequent returns?",
        sinhala: "නිතර ආපසු එන භාණ්ඩ මොනවාද?",
      },
    ],
  },
  {
    id: "reports_summaries",
    label: {
      english: "Reports & Summaries",
      sinhala: "වාර්තා සහ සාරාංශ",
      tamil: "அறிக்கைகள் மற்றும் சுருக்கங்கள்",
    },
    templates: [
      {
        english: "Give me a summary of today's sales.",
        sinhala: "අද විකුණුම් පිළිබඳ සාරාංශයක් දෙන්න.",
      },
      {
        english: "Give me a summary of today's stock changes.",
        sinhala: "අද තොග වෙනස්කම් පිළිබඳ සාරාංශයක් දෙන්න.",
      },
      {
        english: "Show me today's business performance.",
        sinhala: "අද ව්‍යාපාර කාර්යසාධනය පෙන්වන්න.",
      },
      {
        english: "What are the key insights for this week?",
        sinhala: "මෙම සතියේ ප්‍රධාන අවබෝධ මොනවාද?",
      },
      {
        english: "What should I restock based on recent sales?",
        sinhala: "මෑත විකුණුම් අනුව නැවත තොග කළ යුතු දේ මොනවාද?",
      },
      {
        english: "Which products need attention today?",
        sinhala: "අද අවධානය අවශ්‍ය භාණ්ඩ මොනවාද?",
      },
      {
        english: "What are the top issues in inventory right now?",
        sinhala: "දැනට ඉන්වෙන්ටරියේ ප්‍රධාන ගැටලු මොනවාද?",
      },
    ],
  },
];

function extractPlaceholders(text: string): string[] {
  return Array.from(text.matchAll(/\{([^}]+)\}/g), (match) => match[1]?.trim() ?? "").filter(Boolean);
}

function resolveLocalizedValue(value: LocalizedValue, language: ShopProfileLanguage): string {
  if (language === "sinhala") {
    return value.sinhala ?? value.english;
  }

  if (language === "tamil") {
    return value.tamil ?? value.english;
  }

  return value.english;
}

function resolvePlaceholderLabel(key: string, language: ShopProfileLanguage): string {
  const labels = placeholderLabels[key];
  if (!labels) {
    return key.replaceAll("_", " ");
  }

  return resolveLocalizedValue(labels, language);
}

function toDisplayText(template: string, placeholders: PosChatbotFaqPlaceholder[]): string {
  let text = template;
  placeholders.forEach((placeholder) => {
    text = text.replaceAll(`{${placeholder.key}}`, `{${placeholder.label}}`);
  });

  return text;
}

export function getPosChatbotFaqCategories(language: ShopProfileLanguage = "english"): PosChatbotFaqCategory[] {
  return rawCategories
    .filter((category) => v1SupportedCategoryIds.has(category.id))
    .map((category) => ({
      id: category.id,
      label: resolveLocalizedValue(category.label, language),
      questions: category.templates.map((template, index) => {
        const localizedTemplate = resolveLocalizedValue(template, language);
        const placeholderKeys = extractPlaceholders(localizedTemplate);
        const placeholders = placeholderKeys.map((key) => ({
          key,
          label: resolvePlaceholderLabel(key, language),
        }));

        return {
          id: `${category.id}_${index + 1}`,
          text: toDisplayText(localizedTemplate, placeholders),
          template: localizedTemplate,
          placeholders,
        };
      }),
    }));
}
