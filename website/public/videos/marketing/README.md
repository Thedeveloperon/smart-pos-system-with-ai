# Marketing Video Assets

Store landing page videos here.

## Folder structure

- `hero/` - hero background/demo videos
- `features/` - per-feature short clips
- `how-it-works/` - step-by-step videos
- `pricing/` - pricing explainer clips
- `shared/` - reusable videos used across sections

## Recommended naming

- `hero-main.mp4`
- `feature-inventory.mp4`
- `how-it-works-step-1.mp4`
- `pricing-overview.mp4`

Use lowercase kebab-case names.

## Recommended format

- Primary: `mp4` (H.264 video + AAC audio)
- Optional fallback: `webm`
- Include a poster image (in `website/public/images/marketing/...`) for faster perceived loading.

## How to reference in code

- `/videos/marketing/hero/hero-main.mp4`
- `/videos/marketing/features/feature-inventory.mp4`

These can be used with a native `<video>` element in Next.js components.
