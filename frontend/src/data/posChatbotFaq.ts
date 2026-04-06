export type PosChatbotFaqQuestion = {
  id: string;
  text: string;
  placeholders: string[];
};

export type PosChatbotFaqCategory = {
  id: string;
  label: string;
  questions: PosChatbotFaqQuestion[];
};

const rawCategories: ReadonlyArray<{
  id: string;
  label: string;
  templates: ReadonlyArray<string>;
}> = [
  {
    id: "stock_inventory",
    label: "Stock & Inventory",
    templates: [
      "What is the current stock count of {item name}?",
      "How many units of {item name} are available right now?",
      "Which items are currently low in stock?",
      "What are the low stock items of {brand}?",
      "What are the low stock items of {supplier}?",
      "Which items are out of stock?",
      "Which items will run out soon?",
      "What are the overstocked items?",
      "Which products have not been restocked recently?",
      "Which items were restocked today?",
      "What is the stock value of {item name}?",
      "What is the total stock value of {brand}?",
      "Show me stock movement for {item name}.",
      "Which items have zero sales but still have stock?",
      "Which items are expiring soon?",
      "Which expired items are still in stock?",
    ],
  },
  {
    id: "sales",
    label: "Sales",
    templates: [
      "What are the best-selling items today?",
      "What are the best-selling items this week?",
      "What are the worst-selling items this month?",
      "How many units of {item name} were sold today?",
      "What were the sales of {brand} today?",
      "What were the sales of {category} this week?",
      "Which items had no sales today?",
      "What is the total sales amount today?",
      "What is the average bill value today?",
      "How many transactions were made today?",
      "Which cashier made the highest sales today?",
      "What were the busiest sales hours today?",
      "Compare today's sales with yesterday.",
      "Compare this week's sales with last week.",
      "Which products generate the highest revenue?",
    ],
  },
  {
    id: "purchasing_suppliers",
    label: "Purchasing & Suppliers",
    templates: [
      "Which items should I reorder now?",
      "What are the low stock items from {supplier}?",
      "Which supplier provides {item name}?",
      "What was the last purchase date of {item name}?",
      "What was the last purchase price of {item name}?",
      "Which supplier orders are still pending?",
      "Which items have not been purchased recently?",
      "What items did we buy from {supplier} this month?",
      "Which suppliers have the highest purchase value?",
      "Show recent purchase history for {item name}.",
    ],
  },
  {
    id: "pricing_profit",
    label: "Pricing & Profit",
    templates: [
      "What is the selling price of {item name}?",
      "What is the cost price of {item name}?",
      "What is the profit margin of {item name}?",
      "Which items have the highest profit margin?",
      "Which items have the lowest profit margin?",
      "Which products are being sold below expected margin?",
      "Show me discounted items today.",
      "Which items had price changes recently?",
      "What is the profit earned today?",
      "What is the profit from {brand} this month?",
    ],
  },
  {
    id: "customers",
    label: "Customers",
    templates: [
      "Which customers bought {item name} recently?",
      "Who are the top customers this month?",
      "Which customers have not purchased recently?",
      "What did {customer name} buy last time?",
      "How much has {customer name} spent this month?",
      "Which items are most popular among customers?",
      "Which customers have pending payments?",
      "Show recent sales for {customer name}.",
    ],
  },
  {
    id: "cashier_operations",
    label: "Cashier & Operations",
    templates: [
      "Who opened the cashier session today?",
      "Is the cashier session currently open?",
      "What is the current cash balance in the drawer?",
      "What were the total cash sales today?",
      "What were the total card sales today?",
      "Were there any refunds today?",
      "Which items were refunded today?",
      "Which cashier handled the most transactions today?",
      "Show voided bills from today.",
      "Were there any suspicious discounts today?",
    ],
  },
  {
    id: "alerts_exceptions",
    label: "Alerts & Exceptions",
    templates: [
      "Show me items that need immediate restocking.",
      "Which items are below minimum stock level?",
      "Which items are selling unusually fast today?",
      "Which items are not selling at all this week?",
      "Are there any stock mismatches for {item name}?",
      "Which products have negative stock?",
      "Which items were manually adjusted today?",
      "Show unusual sales activity today.",
      "Which items have frequent returns?",
    ],
  },
  {
    id: "reports_summaries",
    label: "Reports & Summaries",
    templates: [
      "Give me a summary of today's sales.",
      "Give me a summary of today's stock changes.",
      "Show me today's business performance.",
      "What are the key insights for this week?",
      "What should I restock based on recent sales?",
      "Which products need attention today?",
      "What are the top issues in inventory right now?",
    ],
  },
];

function extractPlaceholders(text: string): string[] {
  return Array.from(text.matchAll(/\{([^}]+)\}/g), (match) => match[1]?.trim() ?? "").filter(Boolean);
}

export const posChatbotFaqCategories: PosChatbotFaqCategory[] = rawCategories.map((category) => ({
  id: category.id,
  label: category.label,
  questions: category.templates.map((template, index) => ({
    id: `${category.id}_${index + 1}`,
    text: template,
    placeholders: extractPlaceholders(template),
  })),
}));
