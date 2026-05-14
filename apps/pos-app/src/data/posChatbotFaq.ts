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
};

const tamilTemplateFallbacks: Record<string, string> = {
  "What is the current stock count of {item_name}?": "{item_name} இன் தற்போதைய சரக்கு அளவு என்ன?",
  "How many units of {item_name} are available right now?": "இப்போது {item_name} எத்தனை அலகுகள் கிடைக்கின்றன?",
  "Which items are currently low in stock?": "தற்போது குறைந்த சரக்கில் உள்ள பொருட்கள் எவை?",
  "What are the low stock items of {brand}?": "{brand} பிராண்டின் குறைந்த சரக்கு பொருட்கள் எவை?",
  "What are the low stock items of {supplier}?": "{supplier} வழங்குநரின் குறைந்த சரக்கு பொருட்கள் எவை?",
  "Which items are out of stock?": "சரக்கு முடிந்த பொருட்கள் எவை?",
  "Which items will run out soon?": "விரைவில் சரக்கு முடிவடைய உள்ள பொருட்கள் எவை?",
  "What are the overstocked items?": "அதிக சரக்கில் உள்ள பொருட்கள் எவை?",
  "Which products have not been restocked recently?": "சமீபத்தில் மறுசரக்கு செய்யப்படாத பொருட்கள் எவை?",
  "Which items were restocked today?": "இன்று மறுசரக்கு செய்யப்பட்ட பொருட்கள் எவை?",
  "What is the stock value of {item_name}?": "{item_name} இன் சரக்கு மதிப்பு என்ன?",
  "What is the total stock value of {brand}?": "{brand} பிராண்டின் மொத்த சரக்கு மதிப்பு என்ன?",
  "Show me stock movement for {item_name}.": "{item_name} க்கான சரக்கு நகர்வைக் காட்டு.",
  "Which items have zero sales but still have stock?": "விற்பனை இல்லாவிட்டும் இன்னும் சரக்கு உள்ள பொருட்கள் எவை?",
  "Which items are expiring soon?": "விரைவில் காலாவதியாக உள்ள பொருட்கள் எவை?",
  "Which expired items are still in stock?": "காலாவதியானும் இன்னும் சரக்கில் உள்ள பொருட்கள் எவை?",
  "What are the best-selling items today?": "இன்று அதிகம் விற்ற பொருட்கள் எவை?",
  "What are the best-selling items this week?": "இந்த வாரம் அதிகம் விற்ற பொருட்கள் எவை?",
  "What are the worst-selling items this month?": "இந்த மாதம் குறைவாக விற்ற பொருட்கள் எவை?",
  "How many units of {item_name} were sold today?": "இன்று {item_name} எத்தனை அலகுகள் விற்கப்பட்டன?",
  "What were the sales of {brand} today?": "இன்று {brand} பிராண்டின் விற்பனை எவ்வளவு?",
  "What were the sales of {category} this week?": "இந்த வாரம் {category} வகையின் விற்பனை எவ்வளவு?",
  "Which items had no sales today?": "இன்று விற்பனை ஆகாத பொருட்கள் எவை?",
  "What is the total sales amount today?": "இன்றைய மொத்த விற்பனை தொகை என்ன?",
  "What is the average bill value today?": "இன்றைய சராசரி பில் மதிப்பு என்ன?",
  "How many transactions were made today?": "இன்று எத்தனை பரிவர்த்தனைகள் நடந்தன?",
  "Which cashier made the highest sales today?": "இன்று அதிக விற்பனை செய்த காசாளர் யார்?",
  "What were the busiest sales hours today?": "இன்று மிக அதிக பரபரப்பான விற்பனை நேரங்கள் எவை?",
  "Compare today's sales with yesterday.": "இன்றைய விற்பனையை நேற்றுைய விற்பனையுடன் ஒப்பிடு.",
  "Compare this week's sales with last week.": "இந்த வார விற்பனையை கடந்த வாரத்துடன் ஒப்பிடு.",
  "Which products generate the highest revenue?": "அதிக வருமானம் உருவாக்கும் பொருட்கள் எவை?",
  "Which items should I reorder now?": "இப்போது நான் மறுஆர்டர் செய்ய வேண்டிய பொருட்கள் எவை?",
  "What are the low stock items from {supplier}?": "{supplier} வழங்குநரிடமிருந்து வரும் குறைந்த சரக்கு பொருட்கள் எவை?",
  "Which supplier provides {item_name}?": "{item_name} ஐ வழங்கும் வழங்குநர் யார்?",
  "What was the last purchase date of {item_name}?": "{item_name} இன் கடைசி கொள்முதல் தேதி என்ன?",
  "What was the last purchase price of {item_name}?": "{item_name} இன் கடைசி கொள்முதல் விலை என்ன?",
  "Which supplier orders are still pending?": "இன்னும் நிலுவையில் உள்ள வழங்குநர் ஆர்டர்கள் எவை?",
  "Which items have not been purchased recently?": "சமீபத்தில் கொள்முதல் செய்யப்படாத பொருட்கள் எவை?",
  "What items did we buy from {supplier} this month?": "இந்த மாதம் {supplier} இலிருந்து நாம் வாங்கிய பொருட்கள் எவை?",
  "Which suppliers have the highest purchase value?": "அதிக கொள்முதல் மதிப்பு கொண்ட வழங்குநர்கள் எவை?",
  "Show recent purchase history for {item_name}.": "{item_name} க்கான சமீபத்திய கொள்முதல் வரலாற்றைக் காட்டு.",
  "What is the selling price of {item_name}?": "{item_name} இன் விற்பனை விலை என்ன?",
  "What is the cost price of {item_name}?": "{item_name} இன் கொள்முதல் செலவு விலை என்ன?",
  "What is the profit margin of {item_name}?": "{item_name} இன் லாப விகிதம் என்ன?",
  "Which items have the highest profit margin?": "அதிக லாப விகிதம் கொண்ட பொருட்கள் எவை?",
  "Which items have the lowest profit margin?": "குறைந்த லாப விகிதம் கொண்ட பொருட்கள் எவை?",
  "Which products are being sold below expected margin?": "எதிர்பார்க்கப்பட்ட லாப விகிதத்திற்குக் கீழே விற்கப்படும் பொருட்கள் எவை?",
  "Show me discounted items today.": "இன்றைய தள்ளுபடி செய்யப்பட்ட பொருட்களைக் காட்டு.",
  "Which items had price changes recently?": "சமீபத்தில் விலை மாற்றம் ஏற்பட்ட பொருட்கள் எவை?",
  "What is the profit earned today?": "இன்று சம்பாதிக்கப்பட்ட லாபம் என்ன?",
  "What is the profit from {brand} this month?": "இந்த மாதம் {brand} பிராண்டிலிருந்து கிடைத்த லாபம் என்ன?",
  "Who opened the cashier session today?": "இன்று காசாளர் அமர்வைத் தொடங்கியது யார்?",
  "Is the cashier session currently open?": "காசாளர் அமர்வு தற்போது திறந்திருக்கிறதா?",
  "What is the current cash balance in the drawer?": "ட்ராயரில் தற்போதைய பண இருப்பு என்ன?",
  "What were the total cash sales today?": "இன்றைய மொத்த பண விற்பனை எவ்வளவு?",
  "What were the total card sales today?": "இன்றைய மொத்த அட்டை விற்பனை எவ்வளவு?",
  "Were there any refunds today?": "இன்று பணத்தீர்வுகள் ஏதேனும் இருந்தனவா?",
  "Which items were refunded today?": "இன்று பணத்தீர்வு செய்யப்பட்ட பொருட்கள் எவை?",
  "Which cashier handled the most transactions today?": "இன்று அதிக பரிவர்த்தனைகளை கையாள்ந்த காசாளர் யார்?",
  "Show voided bills from today.": "இன்றைய ரத்து செய்யப்பட்ட பில்களைக் காட்டு.",
  "Were there any suspicious discounts today?": "இன்று சந்தேகத்திற்கிடமான தள்ளுபடிகள் இருந்தனவா?",
  "Give me a summary of today's sales.": "இன்றைய விற்பனையின் சுருக்கத்தை கொடு.",
  "Give me a summary of today's stock changes.": "இன்றைய சரக்கு மாற்றங்களின் சுருக்கத்தை கொடு.",
  "Show me today's business performance.": "இன்றைய வணிக செயல்திறனை காட்டு.",
  "What are the key insights for this week?": "இந்த வாரத்தின் முக்கிய உள்ளடக்கங்கள் என்ன?",
  "What should I restock based on recent sales?": "சமீபத்திய விற்பனையின் அடிப்படையில் நான் எதை மறுசரக்கு செய்ய வேண்டும்?",
  "Which products need attention today?": "இன்று கவனம் தேவைப்படும் பொருட்கள் எவை?",
  "What are the top issues in inventory right now?": "தற்போது இன்வெண்டரியில் உள்ள முக்கிய பிரச்சினைகள் எவை?",
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

function resolveLocalizedTemplate(value: LocalizedValue, language: ShopProfileLanguage): string {
  if (language !== "tamil") {
    return resolveLocalizedValue(value, language);
  }

  return value.tamil ?? tamilTemplateFallbacks[value.english] ?? value.english;
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
        const localizedTemplate = resolveLocalizedTemplate(template, language);
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
