---
name: The Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#444653'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#757684'
  outline-variant: '#c4c5d5'
  surface-tint: '#3755c3'
  primary: '#00288e'
  on-primary: '#ffffff'
  primary-container: '#1e40af'
  on-primary-container: '#a8b8ff'
  inverse-primary: '#b8c4ff'
  secondary: '#855300'
  on-secondary: '#ffffff'
  secondary-container: '#fea619'
  on-secondary-container: '#684000'
  tertiary: '#6a0045'
  on-tertiary: '#ffffff'
  tertiary-container: '#8b1a5e'
  on-tertiary-container: '#ff9dcc'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dde1ff'
  primary-fixed-dim: '#b8c4ff'
  on-primary-fixed: '#001453'
  on-primary-fixed-variant: '#173bab'
  secondary-fixed: '#ffddb8'
  secondary-fixed-dim: '#ffb95f'
  on-secondary-fixed: '#2a1700'
  on-secondary-fixed-variant: '#653e00'
  tertiary-fixed: '#ffd8e7'
  tertiary-fixed-dim: '#ffafd3'
  on-tertiary-fixed: '#3d0026'
  on-tertiary-fixed-variant: '#85145a'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1280px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
---

## Brand & Style
The design system is rooted in **Corporate Modernism**, prioritizing clarity, efficiency, and a high degree of perceived reliability. It serves two distinct audiences: the casual buyer seeking a seamless shopping experience and the store owner requiring a robust, data-dense management interface.

The aesthetic is characterized by expansive white space, a disciplined use of color to guide intent, and a rigorous structural grid. The emotional goal is to evoke a sense of security and professional excellence. While the consumer-facing side uses softer transitions and lifestyle imagery, the store owner side shifts toward a "utility-first" density, utilizing tighter spacing and data-driven visualizations without sacrificing the overall clean aesthetic.

## Colors
This design system utilizes a primary palette of **Trustworthy Blue (#1E40AF)** to anchor the brand in stability. The accent palette features **Gold (#F59E0B)** for high-priority CTAs and 'sale' indicators, providing a sophisticated contrast that feels premium rather than aggressive. 

**Slate Grays** (ranging from #0F172A for headings to #64748B for body text) are used to establish a clear typographic hierarchy. For the store owner dashboard, a secondary **Soft Coral (#F472B6)** may be used sparingly for specific alerts or secondary promotional highlights. The background remains predominantly white (#FFFFFF) or light slate (#F8FAFC) to maintain a sterile, professional environment for data-heavy tasks.

## Typography
The system exclusively uses **Inter** for its exceptional legibility and neutral, systematic appearance. 

- **Hierarchy:** High-level headers use bold weights and tighter letter spacing for a punchy, editorial feel. 
- **Readability:** Body text is set with generous line heights to facilitate easy scanning of product descriptions.
- **Store Owner Density:** In dashboard views, `body-sm` and `data-mono` are prioritized to maximize information density in tables and analytics widgets. 
- **Responsive adjustments:** Large display titles scale down significantly on mobile to prevent awkward line breaks in product titles.

## Layout & Spacing
The system follows an **8px linear scale** for all padding, margins, and component heights. 

- **Buyer Interface:** Employs a 12-column fixed grid (1280px max-width) with generous 24px gutters to allow product imagery to breathe. 
- **Store Owner Interface:** Transitions to a fluid-width sidebar layout. The main content area expands to fill the viewport, utilizing "compact" variants of the spacing scale (4px/8px) to accommodate complex data grids.
- **Responsive Behavior:** On mobile, margins reduce to 16px. The header remains sticky, and the search bar transitions from a standard input to a full-screen overlay once focused, ensuring the keyboard interaction does not obscure the search results.

## Elevation & Depth
Elevation is achieved through **low-contrast outlines** and **ambient shadows**. We avoid heavy dropshadows to maintain a clean, flat aesthetic.

- **Level 0 (Flat):** Used for the main background.
- **Level 1 (Bordered):** Primary containers and cards use a 1px border (#E2E8F0) with no shadow.
- **Level 2 (Lifted):** Hover states on product cards and active dropdowns use an extra-diffused shadow (0px 4px 20px rgba(30, 64, 175, 0.08)) to indicate interactivity.
- **Level 3 (Overlay):** Modals, full-page search, and the persistent chatbot icon use a deeper shadow (0px 10px 30px rgba(15, 23, 42, 0.12)) to sit clearly above the interface.
- **Glassmorphism:** The sticky header and chatbot base utilize a subtle backdrop-blur (8px) with 95% opacity to maintain context of the content beneath.

## Shapes
A consistent **8px (0.5rem)** radius is applied to all primary UI elements, including buttons, input fields, product cards, and modal containers. This "Rounded" setting strikes a balance between professional rigidity and modern softness.

Smaller elements like checkboxes or tags maintain the 4px (rounded-sm) radius for precision. Buttons used for "Add to Cart" or "Primary CTA" may optionally use the `rounded-xl` (24px) style if a more friendly, consumer-oriented look is required for specific landing pages.

## Components
- **Buttons:** Primary buttons are Solid Trustworthy Blue with white text. Secondary buttons are outlined in Slate-300. CTAs use the Gold accent. All feature a 150ms ease-in-out transition on hover, darkening the background by 10%.
- **Search Bar:** In the header, the search bar starts as a subtle input. Upon focus, it expands to cover the page with a white overlay, displaying "Trending Searches" and "Recent History."
- **Cards:** Product cards use a minimal border (#E2E8F0). On hover, the border color shifts to the Primary Blue and the image subtly scales (1.02x).
- **Data Tables (Store Owner):** Features alternating row stripes in #F8FAFC, sticky headers, and condensed typography. Action icons (edit/delete) only appear on row hover to reduce visual noise.
- **Chatbot:** A persistent circular button in the bottom right (#1E40AF) with a white icon. When active, it opens a card with a header in the Primary Blue and a simple, message-based interface.
- **Input Fields:** Use a 1px border with #64748B (Slate) text. On focus, the border changes to Primary Blue with a 2px outer glow (ring) of the same color at 10% opacity.