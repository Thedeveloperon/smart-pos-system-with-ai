# Marketing Image Assets

Store landing page images here.

## Folder structure

- `hero/` - main hero visual(s)
- `features/` - images for features cards/section
- `how-it-works/` - step illustrations
- `pricing/` - pricing-related visuals
- `shared/` - reusable images used in multiple sections

## Recommended naming

- `hero-main.webp`
- `feature-inventory.webp`
- `feature-ai-insights.webp`
- `how-it-works-step-1.webp`
- `pricing-banner.webp`

Use lowercase kebab-case names and prefer `.webp` for optimized loading.

## How to reference in code

In Next.js components, use paths from `/public` root:

- `/images/marketing/hero/hero-main.webp`
- `/images/marketing/features/feature-inventory.webp`

These can be used with `next/image` (`<Image />`) for optimized delivery.
