# Design System Document: Urban Editorial Grit

## 1. Overview & Creative North Star
**Creative North Star: The Monolith & The Motion**

This design system is built to bridge the gap between high-fashion editorial layouts and raw, streetwear energy. We are moving away from the "templated" e-commerce look by embracing **High-Contrast Brutalism**. The goal is to make the digital experience feel as physical and impactful as a limited-edition sneaker drop or a heavy-stock lifestyle magazine.

We break the standard grid through **Intentional Asymmetry**. Large-scale typography should overlap product photography, and "badges" should feel like stickers slapped onto a physical surface. By utilizing stark shifts between deep blacks and vibrant label-driven accents, we create a rhythmic "pulse" through the scroll that commands attention and establishes authority in the supplement space.

---

## 2. Colors
Our palette is rooted in absolute contrast. We use a "High-Value" neutral base to allow product labels—the true stars—to pop with electric intensity.

### The Palette
- **Primary (Action):** `primary (#bc0100)` – Use for mission-critical CTAs.
- **Surface Foundations:** `surface (#f9f9f9)`, `surface-container-low (#f3f3f3)`, and `on-background (#1b1b1b)`.
- **Accents:** Electric Blue and Neon Pink (derived from product labels) should be used sparingly as "vibe" indicators or status badges.

### Strategic Rules
* **The "No-Line" Rule:** Standard 1px borders for sectioning are strictly prohibited. Layout boundaries must be defined by background color shifts—for example, moving from a `surface` hero area into a `surface-container-low` product grid.
* **Surface Hierarchy & Nesting:** Treat the UI as stacked sheets of industrial material. A product card (`surface-container-lowest`) should sit on a slightly darker track (`surface-container-low`) to create depth without relying on antiquated shadows.
* **The "Glass & Gradient" Rule:** To soften the brutalism, use **Glassmorphism** for floating navigation or sticky filters. Apply `surface` with 80% opacity and a `20px` backdrop-blur.
* **Signature Textures:** Use subtle gradients transitioning from `primary` to `primary-container` on high-impact buttons to give them a "machined" metallic finish.

---

## 3. Typography
Typography is our primary architectural tool. We use a combination of **Space Grotesk** for its technical, streetwear edge and **Inter** for its neutral, high-readability characteristics.

* **Display (Space Grotesk):** Set to `display-lg (3.5rem)` with tight letter-spacing. Use this for "Hero" headlines. It should feel loud, heavy, and occasionally cropped or overlapped by product imagery.
* **Headlines (Space Grotesk):** `headline-lg (2rem)`. Always uppercase for a "stamped" aesthetic.
* **Body (Inter):** `body-lg (1rem)`. This provides the necessary "breathing room" against the aggressive headlines.
* **Labels (Space Grotesk):** `label-md (0.75rem)`. Used for badges, technical specs, and "stamped" metadata.

---

## 4. Elevation & Depth
In this system, depth is a result of **Tonal Layering**, not structural artifice.

* **The Layering Principle:** Depth is achieved by "stacking." A `surface-container-lowest` (#FFFFFF) card placed on a `surface-container-low` (#F3F3F3) background creates a crisp, natural lift.
* **Ambient Shadows:** When an element must float (e.g., a modal or product hover), use an ultra-diffused shadow: `box-shadow: 0 20px 40px rgba(27, 27, 27, 0.06)`. This mimics soft gallery lighting rather than harsh digital shadows.
* **The "Ghost Border" Fallback:** If accessibility requires a container boundary, use a **Ghost Border**: `outline-variant (#ebbbb4)` at **15% opacity**. It should be felt, not seen.
* **Sharpness:** All corners must be `0px` (Square). This reinforces the "Modern Urban" aesthetic—nothing is rounded; everything is cut with precision.

---

## 5. Components

### Buttons
* **Primary:** Solid `on-background` (#1b1b1b) with `on-primary` (#ffffff) text. All caps. 0px border-radius.
* **Secondary:** `surface` background with a heavy 2px `on-background` border. This is the "Streetwear Badge" look.
* **Tertiary:** No background. Underlined `label-md` text with an arrow icon.

### Cards & Lists
* **No Dividers:** Forbid the use of horizontal lines. Use `spacing-8` (2rem) of white space or a subtle shift from `surface` to `surface-container-high` to separate content blocks.
* **Badges:** High-contrast blocks (e.g., Black background, White text) positioned at the top-left of images, slightly overlapping the edge to break the container.

### Input Fields
* **Styling:** Fields should not be boxes. Use a heavy 2px bottom-border only (`on-background`) to mimic a high-end form or architectural blueprint.
* **Focus State:** The bottom border transitions to `primary` (#bc0100).

### Signature Component: The "Hype-Badge"
A small, rotating or static circular element using `label-sm` typography that floats over product images to denote "Limited Edition" or "New Flavor." This adds "grit" and a "sticker" feel to the clean layout.

---

## 6. Do's and Don'ts

### Do:
* **Scale the Type:** Use massive typography scales to fill negative space.
* **Embrace Asymmetry:** Offset product images so they aren't perfectly centered in their containers.
* **Use High-Grit Photography:** Mix clean product renders with grainy, high-contrast lifestyle shots in the gym or urban environments.
* **Stack Surfaces:** Use the `surface-container` tiers to build a sense of physical construction.

### Don't:
* **Do Not use Border Radius:** Keep all corners at `0px`. Roundness kills the urban edge.
* **Do Not use Dividers:** Never use a 1px gray line to separate list items. Use space or tonal shifts.
* **Do Not use Generic Shadows:** Avoid "standard" drop shadows. If it doesn't look like ambient gallery lighting, remove it.
* **Do Not use Low Contrast:** Avoid light gray text on white. If it's worth saying, it's worth saying in `on-surface` (#1b1b1b).
