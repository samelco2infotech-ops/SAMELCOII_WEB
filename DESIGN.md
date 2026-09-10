---
version: 1.0
name: SAMELCII-Web-System-Design
description: Design system for SAMELCII Web System - HR & Compliance Dashboard. Integrates design patterns from awesome-design-md-main collection.

# Design Source Reference
design-source: awesome-design-md-main/design-md/

# Available Design Patterns (Reference)
# Use these as templates when asking agents to design UI:
# - claude: Warm terracotta accent, clean editorial layout
# - linear: Ultra-minimal, precise, purple accent  
# - stripe: Signature purple gradients, weight-300 elegance
# - apple: Premium white space, SF Pro, cinematic imagery
# - figma: Vibrant multi-color, playful yet professional
# - supabase: Dark emerald theme, code-first

---

## Primary Design Theme

**Name**: SAMELCII Professional
**Aesthetic**: Clean, accessible, data-centric dashboard UI
**Mood**: Professional yet approachable, trust-focused
**Typography**: Modern sans-serif with hierarchical structure
**Base Pattern**: Linear (minimal, precise) mixed with Claude (warm accent)

---

## Color Palette & Roles

| Token | Hex | Role | Usage |
|-------|-----|------|-------|
| `primary` | `#6366f1` | Primary actions, key UI | Buttons, links, active states |
| `primary-hover` | `#4f46e5` | Hover state | Interactive elements |
| `primary-accent` | `#818cf8` | Accent highlights | Badges, icons, accents |
| `ink` | `#1f2937` | Text primary | Headlines, body text |
| `body` | `#374151` | Text secondary | Body, descriptions |
| `muted` | `#6b7280` | Text tertiary | Captions, hints |
| `canvas` | `#f9fafb` | Light background | Page canvas, cards |
| `surface-white` | `#ffffff` | Primary surface | Modals, overlays |
| `surface-elevated` | `#f3f4f6` | Elevated surface | Card backgrounds |
| `success` | `#10b981` | Success state | Confirmations, passes |
| `warning` | `#f59e0b` | Warning state | Alerts, caution |
| `error` | `#ef4444` | Error state | Errors, failures |
| `border` | `#e5e7eb` | Borders | Dividers, edges |
| `border-light` | `#f3f4f6` | Subtle borders | Faint dividers |

---

## Typography Rules

### Font Families
- **Display**: `Segoe UI`, `Tahoma`, `Arial`, sans-serif
- **Body**: `Segoe UI`, `Tahoma`, `Arial`, sans-serif
- **Monospace**: `Fira Code`, `Courier New`, monospace (for code/data)

### Type Scale

| Level | Font Size | Font Weight | Line Height | Usage |
|-------|-----------|------------|-------------|-------|
| `display-xl` | 32px | 700 | 1.1 | Page titles |
| `display-lg` | 28px | 700 | 1.15 | Section headers |
| `display-sm` | 24px | 600 | 1.2 | Subsections |
| `title-lg` | 20px | 600 | 1.3 | Card titles |
| `title-md` | 18px | 600 | 1.3 | Minor titles |
| `title-sm` | 16px | 600 | 1.4 | Small titles |
| `body-lg` | 16px | 400 | 1.55 | Primary body |
| `body-md` | 14px | 400 | 1.55 | Secondary body |
| `body-sm` | 13px | 400 | 1.5 | Tertiary body |
| `caption` | 12px | 500 | 1.4 | Captions |
| `code` | 13px | 400 | 1.6 | Code blocks |

---

## Component Stylings

### Buttons

#### Primary Button
- **Background**: `{colors.primary}`
- **Text Color**: `#ffffff`
- **Typography**: `body-md` weight 600
- **Padding**: 10px 16px
- **Rounded**: 6px
- **States**: 
  - Hover: `{colors.primary-hover}`
  - Active: darker shade
  - Disabled: `{colors.muted}` background, lighter text

#### Secondary Button
- **Background**: `{colors.surface-elevated}`
- **Text Color**: `{colors.ink}`
- **Typography**: `body-md` weight 600
- **Padding**: 10px 16px
- **Rounded**: 6px
- **Border**: 1px `{colors.border}`
- **States**: Hover adds light shadow

#### Text Button (Link)
- **Background**: transparent
- **Text Color**: `{colors.primary}`
- **Typography**: `body-md` weight 600
- **States**: Hover adds underline

### Form Elements

#### Input Field
- **Background**: `#ffffff`
- **Border**: 1px `{colors.border}`
- **Rounded**: 4px
- **Padding**: 8px 12px
- **Typography**: `body-md`
- **Focus**: Border becomes `{colors.primary}` with subtle shadow
- **Error**: Border becomes `{colors.error}`

#### Label
- **Typography**: `body-sm` weight 600
- **Color**: `{colors.ink}`
- **Margin Bottom**: 6px
- **Required**: Add red asterisk

#### Select Dropdown
- **Same as input field**
- **Icon**: Down arrow on right side
- **Placeholder**: `{colors.muted}`

### Cards

#### Standard Card
- **Background**: `#ffffff`
- **Border**: 1px `{colors.border}`
- **Rounded**: 8px
- **Padding**: 16px
- **Shadow**: `0 1px 3px rgba(0,0,0,0.1)`
- **Hover**: Shadow increases, slight lift

#### Elevated Card
- **Background**: `{colors.surface-elevated}`
- **Padding**: 20px
- **Border**: none
- **Rounded**: 8px
- **Shadow**: `0 4px 6px rgba(0,0,0,0.07)`

### Tables

#### Table Header
- **Background**: `{colors.surface-elevated}`
- **Typography**: `body-sm` weight 600
- **Color**: `{colors.ink}`
- **Padding**: 12px
- **Borders**: 1px `{colors.border}`

#### Table Row (Alternate)
- **Background**: Stripe even rows with `{colors.canvas}`
- **Padding**: 12px
- **Hover**: Light highlight with `{colors.surface-elevated}`

#### Table Cell
- **Typography**: `body-md`
- **Color**: `{colors.body}`
- **Borders**: 1px `{colors.border}`
- **Padding**: 12px

### Navigation

#### Top Navigation Bar
- **Background**: `#ffffff`
- **Height**: 56px
- **Border Bottom**: 1px `{colors.border}`
- **Items**: Flex center vertically
- **Link Active**: Color `{colors.primary}`, underline 2px

#### Sidebar Navigation (if used)
- **Background**: `{colors.canvas}`
- **Width**: 256px
- **Border Right**: 1px `{colors.border}`
- **Items**: Padding 12px
- **Active Item**: Background `{colors.surface-elevated}`, text `{colors.primary}`

---

## Layout Principles

### Spacing Scale

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Minimal spacing |
| `sm` | 8px | Tight spacing |
| `md` | 12px | Default padding |
| `lg` | 16px | Standard padding |
| `xl` | 24px | Large padding |
| `xxl` | 32px | Section spacing |
| `section` | 48px | Major sections |

### Grid
- **Base Grid**: 4px (all spacing uses multiples of 4px)
- **Column Layout**: 12-column responsive grid
- **Container Max Width**: 1280px
- **Side Margins**: 
  - Desktop: 24px
  - Tablet: 16px
  - Mobile: 12px

### Whitespace Philosophy
- Generous whitespace for clarity
- Breathing room around interactive elements
- Clear visual hierarchy through spacing

---

## Depth & Elevation

### Shadow System

| Level | Shadow | Usage |
|-------|--------|-------|
| None | none | Flat elements |
| 1 | `0 1px 2px rgba(0,0,0,0.05)` | Subtle elevation |
| 2 | `0 1px 3px rgba(0,0,0,0.1)` | Cards, dropdowns |
| 3 | `0 4px 6px rgba(0,0,0,0.1)` | Modals, elevated cards |
| 4 | `0 10px 15px rgba(0,0,0,0.1)` | High elevation, tooltips |

### Z-Index Scale

| Layer | Z-Index | Usage |
|-------|---------|-------|
| Base | 0 | Default content |
| Elevated | 10 | Cards, hover states |
| Overlay | 100 | Dropdowns, modals |
| Fixed | 1000 | Sticky headers, notifications |
| Modal | 2000 | Modal dialogs |
| Toast | 3000 | Toast notifications |

---

## Responsive Behavior

### Breakpoints

| Name | Width | Usage |
|------|-------|-------|
| Mobile | 320px - 639px | Phones |
| Tablet | 640px - 1023px | Tablets, large phones |
| Desktop | 1024px+ | Desktops, monitors |

### Mobile-First Approach
1. Design for mobile first
2. Expand to tablet at 640px
3. Expand to desktop at 1024px

### Responsive Rules
- **Typography**: Scales down 2px on mobile
- **Spacing**: Reduces by 25% on mobile
- **Navigation**: Collapses to hamburger menu below 640px
- **Tables**: Stack vertically on mobile (card view)
- **Modals**: Full height on mobile, centered on desktop
- **Grid**: 1 column mobile, 2 column tablet, 3+ desktop

---

## State Indicators

### Loading State
- **Spinner**: Indeterminate circular spinner
- **Overlay**: Subtle 20% overlay on content
- **Message**: "Loading..." or progress text below spinner

### Empty State
- **Icon**: Large (96px) icon in `{colors.muted}`
- **Title**: `{colors.ink}` in `display-sm`
- **Message**: `{colors.body}` in `body-md`
- **CTA**: Optional secondary button

### Error State
- **Color**: `{colors.error}`
- **Icon**: Error icon (⚠️ or 🚫)
- **Message**: Clear, actionable error text
- **Background**: Light red tint (optional)

### Success State
- **Color**: `{colors.success}`
- **Icon**: Checkmark icon (✓)
- **Message**: Confirmation message
- **Auto-dismiss**: After 4 seconds (optional)

---

## Accessibility Checklist

- ✅ Color contrast minimum 4.5:1 for text
- ✅ Focus states visible on all interactive elements
- ✅ All inputs labeled (explicit or aria-label)
- ✅ Keyboard navigation: Tab through all controls
- ✅ Alt text on all meaningful images
- ✅ Semantic HTML: use `<button>`, `<input>`, `<label>` properly
- ✅ Screen reader testing for complex widgets
- ✅ No color alone to convey information

---

## Do's and Don'ts

### DO
- ✅ Use the design tokens and spacing scale consistently
- ✅ Keep interactions simple and predictable
- ✅ Test on mobile, tablet, and desktop
- ✅ Provide clear feedback for every action
- ✅ Use whitespace generously
- ✅ Follow the typography hierarchy

### DON'T
- ❌ Hardcode colors—use CSS variables or design tokens
- ❌ Break the spacing scale (4px multiples)
- ❌ Use more than 2 font families
- ❌ Create new component variations without justification
- ❌ Rely on color alone for state indication
- ❌ Nest modals or create complex modal flows

---

## Integration with awesome-design-md-main

This design system is built on principles from awesome-design-md-main patterns:

| Pattern | Influence | How it's used |
|---------|-----------|---------------|
| Claude | Warm accent color for primary CTAs | Primary button color (#6366f1 derived from concept) |
| Linear | Minimal, precise design philosophy | Card structure, clean typography |
| Apple | Premium whitespace and typography | Generous spacing, readable body text |
| Figma | Vibrant yet professional | Color palette inspiration |

**To use patterns from awesome-design-md-main:**
- Copy the `DESIGN.md` from `awesome-design-md-main/design-md/{pattern}/DESIGN.md`
- Reference specific sections (colors, typography, components)
- Adapt token names and values to SAMELCII context

---

## Agent Reference

### For UI-UX Agent
- Use this DESIGN.md as the source of truth
- When building new screens, follow the component styles defined above
- Use the spacing scale and color tokens exactly
- Ensure all new components are documented in this file

### For Frontend Developer Agent
- Implement styles using CSS variables from this DESIGN.md
- Create a root CSS file with all design tokens
- Never hardcode colors or spacing values
- Validate that components match DESIGN.md specs

### For Design Review
- Compare built UI against DESIGN.md
- Ensure color contrast meets WCAG AA standards
- Verify responsive behavior at breakpoints
- Check that typography hierarchy is maintained

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-05-25 | Initial design system created, integrated awesome-design-md patterns |

---

## How to Update This File

1. **Adding New Colors**: Add to Color Palette section with hex and role
2. **Adding New Components**: Create new section under Component Stylings with full specs
3. **Changing Breakpoints**: Update Responsive Behavior section and test on devices
4. **Referencing awesome-design-md**: Link to specific pattern folder in comments
5. **After major changes**: Update version history and notify UI-UX agent
