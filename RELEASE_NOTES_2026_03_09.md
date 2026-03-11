# Release Notes -- 2026-03-09

**Databricks Forge v0.15.0**

---

## New Features

### Design System Overhaul
Complete visual redesign moving from scaffold defaults to a branded, intentional design language. The new "Precision Intelligence" aesthetic transforms every surface of the application from a developer workbench into a polished business tool.

### Typography
Replaced Geist (the Next.js default) with **Plus Jakarta Sans** for body/headings and **JetBrains Mono** for code, creating a distinctive typographic identity.

### Motion System
Installed `motion` (Framer Motion v11+) and created shared animation variants. The sidebar now uses spring-based collapse/expand, page transitions use fade+slide via `template.tsx`, and dashboard cards enter with staggered animations.

### Tile Dashboard Layout
Redesigned the home page with an atmospheric hero banner featuring a Databricks diamond texture pattern, an asymmetric tile layout with a hero use-case metric, quick-action cards, secondary KPI tiles, side-by-side recent runs and activity feed, and a refreshed empty state with branded onboarding.

---

## Improvements

### Sidebar Atmosphere
Replaced flat `bg-muted/30` with gradient background, stronger active states with left-border accent in Databricks Red, refined section labels, and animated brand text on collapse/expand.

### Header Refinement
Increased height from 48px to 56px, grouped right-side actions with a visual divider, strengthened page title weight, and added subtle bottom shadow for depth.

### Consistent Page Layouts
All 23 pages now use `max-w-[1400px]` content constraint, `space-y-8` section spacing, and standardized `PageHeader` component where applicable. New `PageShell` and `PageHeader` shared components enforce consistency.

### Component Refinements
- **Card**: Added hover transition support and tighter title tracking
- **Badge**: New `brand` variant using Databricks Red with subtle border
- **Button**: Primary buttons now have shadow, hover shadow, and active scale
- **Skeleton**: Brand-tinted shimmer instead of generic grey pulse

### Error & Status Pages
Refreshed 404 page with branded icon and atmospheric large-number background, refined error boundary with icon treatment and action buttons, and loading skeletons that mirror the new tile layout.

### Ask Forge
Updated layout margins for the new header height, refined persona toggle and conversation history backgrounds.

---

## Commits (4)

| Hash | Summary |
|---|---|
| `0591d98` | Design system overhaul: replace scaffold defaults with branded, intentional UI |
| `c51529c` | Add industry context handling in assistant context builder |
| `8bd4f19` | Enhance evaluation framework and persona handling in assistant |
| `1608d53` | Add resource prefix support for Unity Catalog resources and enable metric view generation |

**Uncommitted changes:** Version bump to 0.15.0, release notes file.
