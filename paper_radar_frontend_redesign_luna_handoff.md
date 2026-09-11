# Paper Radar Frontend Redesign — Luna Handoff

> **Goal:** Redesign the existing working Paper Radar frontend into a polished, reader-first MUI interface without changing backend behavior, data contracts, routing semantics, or recommender logic.

> **Important:** This is a UI/UX refactor, not a product rewrite. Preserve all working functionality. Do not change API contracts or database behavior unless a visual requirement cannot be implemented otherwise.

---

# 1. Design direction

## Product feel

The app should feel like a **calm research workstation**:

- dark-first
- proper light mode
- cold-toned palette
- reader-oriented
- comfortable-compact density
- restrained motion
- subtle borders instead of heavy shadows
- no glassmorphism
- no neon cyberpunk look
- no giant dashboard cards
- no landing-page gradients
- no “default MUI admin portal” aesthetic

Reference feel:
- Readwise Reader
- Linear
- Zotero
- IDE-like information density, but softer and more readable

The app should look designed for someone who may spend hours reading papers.

---

# 2. Theme philosophy

Support:

```text
Dark
Light
System
```

Default initial choice:

```text
Dark
```

Persist theme choice locally.

Dark is the primary design target. Light mode must be intentionally designed, not simple inversion.

---

# 3. Core color tokens

Create semantic tokens and avoid hardcoded hex values inside screens.

## Dark palette

```ts
export const darkTokens = {
  bg: {
    default: "#0B0F14",
    elevated: "#10161D",
    paper: "#141B23",
    hover: "#19222C",
    selected: "#10262B",
  },

  border: {
    subtle: "#222D38",
    default: "#2A3642",
    strong: "#3A4856",
  },

  text: {
    primary: "#E7EEF5",
    secondary: "#95A5B5",
    muted: "#718190",
    disabled: "#56616C",
  },

  accent: {
    primary: "#5BC8D9",
    hover: "#73D3E1",
    active: "#8ADCE7",
    muted: "rgba(91, 200, 217, 0.12)",
    faint: "rgba(91, 200, 217, 0.06)",
  },

  semantic: {
    success: "#63C7A6",
    warning: "#D3B66A",
    danger: "#D47A80",
    info: "#72A7D8",
  },
};
```

## Light palette

```ts
export const lightTokens = {
  bg: {
    default: "#F3F6F8",
    elevated: "#F8FAFB",
    paper: "#FFFFFF",
    hover: "#EEF3F5",
    selected: "#E7F5F7",
  },

  border: {
    subtle: "#E1E7EB",
    default: "#D4DEE4",
    strong: "#BCCAD2",
  },

  text: {
    primary: "#17212B",
    secondary: "#647686",
    muted: "#81909C",
    disabled: "#A2ADB5",
  },

  accent: {
    primary: "#168CA0",
    hover: "#117B8D",
    active: "#0D6A7A",
    muted: "rgba(22, 140, 160, 0.10)",
    faint: "rgba(22, 140, 160, 0.05)",
  },

  semantic: {
    success: "#2E8B6D",
    warning: "#9E7B28",
    danger: "#B04F57",
    info: "#3D78A8",
  },
};
```

The main UI must remain mostly graphite/slate. Cyan/teal is an interaction accent, not a fill color for large surfaces.

---

# 4. Feed identity colors

Each feed gets a persistent cold-tone color.

Use a constrained palette:

```ts
export const feedPalette = [
  "#5BC8D9", // cyan
  "#58B7C5", // teal-cyan
  "#5E9ECF", // blue
  "#708BCB", // periwinkle
  "#787BC4", // indigo
  "#8B78B9", // cool violet
  "#56AA9E", // muted teal
];
```

Rules:

- assign one when feed is created
- feed color is persisted
- feed color appears in badges, tiny indicators, and feed nav accents
- never recolor a whole page based on feed
- topic keywords remain neutral, not rainbow colored

---

# 5. Typography

Use **Inter** if already available. Otherwise use system UI fallback until it is added properly.

```ts
fontFamily:
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
```

Suggested scale:

```text
Page title       24px / 700
Section title    18px / 650
Paper title      17–19px / 650
Body             14–15px / 400
Abstract         14.5px / 400 / 1.55 line height
Metadata         12.5–13px / 400
Chip text        11.5–12px / 500
Button           13–14px / 600
```

Avoid giant 32–48px dashboard headings.

---

# 6. Spacing and density

Target: **comfortable-compact**.

Typical values:

```text
Page horizontal padding
 desktop: 24px
 tablet: 18px
 small: 14px

Paper card padding:
 16–18px

Gap between paper cards:
 14–16px

Sidebar row height:
 40px

Normal button height:
 36px

Toolbar height:
 44–48px
```

On a typical laptop viewport, aim for approximately 2.5–3 meaningful paper cards visible at once.

---

# 7. MUI theme structure

Create:

```text
apps/web/src/theme/
├── tokens.ts
├── darkPalette.ts
├── lightPalette.ts
├── typography.ts
├── components.ts
├── createAppTheme.ts
├── ThemeModeProvider.tsx
└── index.ts
```

Do not allow screens to introduce random one-off color values.

---

# 8. MUI component overrides

## MuiButton

- no pill-shaped buttons
- border radius: 8px
- min height: 36px
- text transform: none
- medium font weight
- primary = teal fill, no glow
- outlined = subtle border
- text = quiet by default, faint hover background

## MuiChip

- height around 24px
- compact label
- radius 6px
- feed chips may use muted feed color
- topic keyword chips stay neutral

## MuiPaper / MuiCard

- radius: 10px
- subtle 1px border
- almost no shadow
- background uses semantic paper token

## MuiDrawer

Desktop:
```text
expanded: 232px
collapsed: 64px
```

Use a subtle border, not a harsh divider.

## MuiTabs

- compact height
- avoid giant default Material underline
- use subtle accent line or muted selected background

## MuiTextField

- dense but not cramped
- radius 8px
- teal focus ring
- avoid bright white fields in dark mode

## MuiDialog

- radius 12px
- border + soft shadow
- no oversized padding

## MuiIconButton

- 34–36px control size
- subtle hover background
- visible focus state

---

# 9. App shell

## Desktop

Persistent and collapsible left sidebar.

Sidebar sections:

```text
Today
Queue
Reading
Library

Feeds
  VISTA
  AI4Math
  Security
  + New feed

Training
Rejected
Settings
```

Counts only where useful:
- Today
- Queue
- Reading

Active item:
- faint cyan background
- subtle left accent bar
- stronger icon/text contrast

Feed nav rows:
- tiny feed color dot
- feed name
- optional unread count

## Top utility bar

Minimal:
- global search
- theme toggle
- avatar / account menu

No giant app bar.

---

# 10. Responsive behavior

## Desktop

Suggested:
```text
>= 1200px
```

- expanded sidebar by default
- paper-list max width around 980–1100px
- reader can use full width
- split PDF/notebook reader

## Tablet landscape

Approx:
```text
800–1199px landscape
```

- persistent sidebar, optionally slimmer
- single-column paper list
- split reader
- reduced page padding

## Tablet portrait

Approx:
```text
600–899px portrait
```

- temporary drawer navigation
- Paper / Notes tabs in reader
- no squeezed split view
- stylus-friendly primary controls

Phone only needs a functional fallback.

---

# 11. Shared layout components

Create:

```text
apps/web/src/components/layout/
├── AppShell.tsx
├── Sidebar.tsx
├── SidebarItem.tsx
├── FeedNavItem.tsx
├── TopBar.tsx
├── PageContainer.tsx
├── PageHeader.tsx
└── ResponsiveDrawer.tsx
```

Shared UI primitives:

```text
apps/web/src/components/ui/
├── EmptyState.tsx
├── SectionHeader.tsx
├── StatusBadge.tsx
├── FeedBadge.tsx
├── TopicChip.tsx
├── ConfirmDialog.tsx
└── LoadingSkeleton.tsx
```

---

# 12. Paper card redesign

Create reusable components:

```text
apps/web/src/features/papers/components/
├── PaperCard.tsx
├── PaperMetadata.tsx
├── AbstractPreview.tsx
├── PaperActions.tsx
├── RecommendationBadge.tsx
└── TopicChips.tsx
```

Card shape:

```text
Paper title

Authors · Venue · Year

Abstract preview...

[VISTA] [Strong match]

Lean  formal verification  theorem proving  scientific ML  +2

Nope        Maybe        Relevant                    Open paper →
```

## Abstract behavior

Today:
- 5–7 line preview
- Expand / Collapse

Queue:
- 5–7 line preview

Training:
- full abstract by default

Library:
- more compact by default

## Recommendation labels

Do not show raw numeric probability.

Use:

```text
Strong match
Good match
Exploratory
Low confidence   // training/debug only
```

## Keywords

Show max 5 visible keywords, then `+N`.

Do not add a “Why recommended?” disclosure.

## Action hierarchy

`Nope`
- text/ghost

`Maybe`
- outlined

`Relevant`
- filled teal/cyan

`Open paper →`
- text action aligned right

## Animation

On classification:
- 120–180ms fade + slight upward motion
- respect `prefers-reduced-motion`

---

# 13. Today page

Structure:

```text
Today
Fresh papers across your feeds

[All] [VISTA] [AI4Math] [Security]

Sort: Recommended ▼

Paper cards...
```

Requirements:
- single-column
- readable max width
- no giant summary widgets
- lightweight sticky filter toolbar is fine
- feed filters may scroll horizontally on tablet
- global search stays in top bar

---

# 14. Feed page

Same visual language as Today.

Header:

```text
VISTA
Formal verification, scientific ML, theorem proving...

Edit feed
```

Optional tiny metadata:
```text
12 new · last updated 4h ago
```

Do not add giant analytics panels.

---

# 15. Training page

Functional, not gamified.

Header:

```text
Recommender calibration

████████████████░░░░

46 / 60 labeled

Relevant 18    Maybe 11    Rejected 17

Global model: Calibrating

[Fetch 25 more]
```

Requirements:
- calm progress indicator
- full abstracts by default
- same paper cards
- no XP, streaks, achievements, confetti

When ready:

```text
Ready for scheduled discovery

[Enable twice-daily discovery]
```

---

# 16. Queue page

Sort/group by:

```text
Relevant
Maybe
```

Actions:
- Start reading
- Change priority
- Reject
- Open paper

Use a subtle status marker, not huge section banners.

---

# 17. Reading page

Cards/rows should show:
- title
- authors
- last opened
- page position or approximate progress
- feed badges
- Continue action

Example:

```text
Paper title
Smith et al. · NeurIPS 2026

Last opened 2h ago · page 8 / 24

[VISTA]                           Continue →
```

---

# 18. Library page

Archive/search oriented.

Header controls:
- search
- feed filter
- year filter
- Zotero filter

Default to compact list/cards.

Do not introduce a complex MUI DataGrid unless the existing app already needs one.

---

# 19. Rejected page

Show:
- title
- authors
- rejected date
- feed(s)
- prior category if available

Actions:
- Undo rejection
- Move to Queue as Maybe
- Move to Queue as Relevant

Rejected items should look neutral, not danger-red.

---

# 20. Reader workspace

## Desktop / tablet landscape

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Back   Paper title                           Zotero   ⋯     │
├──────────────────────────────┬───────────────────────────────┤
│                              │                               │
│             PDF              │          Notebook             │
│                              │                               │
├──────────────────────────────┴───────────────────────────────┤
│ PDF controls                         Reading status controls │
└──────────────────────────────────────────────────────────────┘
```

Use a draggable divider.

The sidebar should collapse automatically or expose an obvious focus-mode control.

## Focus mode

One action should:
- hide sidebar
- hide unnecessary top chrome
- maximize PDF + notebook

Do not automatically browser-fullscreen.

## Tablet portrait

Use:

```text
[Paper] [Notes]
```

Do not squeeze both into narrow columns.

---

# 21. PDF reader styling

Minimal controls:
- source/version
- previous/next page
- page number
- zoom
- highlight mode
- Start reading / Mark read
- Zotero action

Group controls logically. Use tooltips for icon-only controls.

---

# 22. Notebook visual design

Default page:

```text
soft off-white paper
faint dot grid
dark ink
```

Suggested:

```ts
notebookPaper: "#F7F8F9"
notebookDot: "#D7DDE3"
notebookInk: "#18212A"
```

Even in dark mode, keep notebook paper light by default.

Notebook controls outside the page:

```text
Pen
Text
Select
Eraser
Undo
Redo
Page controls
```

No giant floating palette.

---

# 23. Empty/loading/error states

## Loading

Use card-shaped skeletons matching final content.

Do not use fullscreen spinner for list loading.

## Empty examples

Today:

```text
You're caught up.
No new recommendations right now.
```

Queue:

```text
Nothing queued yet.
Mark papers Relevant or Maybe to keep them here.
```

## Errors

Use compact inline banners.
Do not show raw stack traces.

---

# 24. Motion rules

Global:

```text
120–200ms
ease-out
```

Use for:
- hover
- focus
- drawer
- classification removal
- abstract expansion
- panel transition

Do not animate every card on first render.

Respect:

```css
@media (prefers-reduced-motion: reduce)
```

---

# 25. Accessibility

Required:
- visible keyboard focus rings
- semantic buttons
- tooltips for icon-only controls
- WCAG AA contrast where practical
- keyboard navigation for paper actions
- no color-only state indicators
- feed badges still contain text
- selected nav item changes shape/weight, not just color

---

# 26. Implementation order

## Task 1 — Theme system

Create:
```text
theme/tokens.ts
theme/darkPalette.ts
theme/lightPalette.ts
theme/typography.ts
theme/components.ts
theme/createAppTheme.ts
theme/ThemeModeProvider.tsx
```

Acceptance:
- dark/light/system work
- dark defaults initially
- theme persists
- existing pages still render
- no behavior changes

Commit:
```text
feat: add paper radar design system
```

---

## Task 2 — App shell

Build:
- persistent/collapsible sidebar
- responsive drawer
- top utility bar
- PageContainer
- PageHeader

Acceptance:
- desktop sidebar
- tablet landscape persistent
- tablet portrait drawer
- no route regression

Commit:
```text
feat: redesign application shell
```

---

## Task 3 — Shared paper components

Build reusable:
- PaperCard
- PaperMetadata
- AbstractPreview
- RecommendationBadge
- FeedBadge
- TopicChips
- PaperActions

Acceptance:
- Today, Training, Queue consume the same component family
- variants are prop-driven, not copy-pasted

Commit:
```text
feat: add reusable paper presentation components
```

---

## Task 4 — Today + Feed pages

Apply:
- single-column layout
- feed filters
- categorical labels
- 5–7 line abstracts
- action hierarchy
- classification transition

Acceptance:
- working triage actions preserved
- feed filtering preserved
- no numeric recommendation score visible

Commit:
```text
feat: redesign today and feed views
```

---

## Task 5 — Training page

Apply:
- compact calibration header
- full abstracts
- progress counts
- Fetch 25 more
- Stable-mode CTA

Acceptance:
- existing training actions work
- no backend changes
- no gamification

Commit:
```text
feat: redesign recommender training view
```

---

## Task 6 — Queue, Reading, Library, Rejected

Acceptance:
- Queue clearly distinguishes Relevant/Maybe
- Reading emphasizes Continue
- Library is compact and searchable
- Rejected remains recoverable

Commit:
```text
feat: redesign paper workflow views
```

---

## Task 7 — Reader workspace

Implement:
- low-chrome workspace
- collapsible shell
- draggable PDF/notebook divider
- portrait Paper/Notes tabs
- focus mode

Acceptance:
- existing PDF loading preserved
- notebook preserved
- responsive reader works at Android tablet widths

Commit:
```text
feat: redesign paper reader workspace
```

---

## Task 8 — Notebook styling

Apply:
- light dot-grid paper
- refined notebook toolbar
- stylus-friendly spacing
- consistent page chrome

Acceptance:
- handwriting behavior unchanged
- text blocks unchanged
- page controls remain functional

Commit:
```text
feat: refine notebook visual system
```

---

## Task 9 — Polish states

Add:
- card skeletons
- empty states
- error banners
- reduced-motion support
- focus/keyboard audit
- tooltip audit

Acceptance:
- every major screen has loading/empty/error states
- keyboard focus is visible
- no major layout shift

Commit:
```text
feat: polish frontend states and accessibility
```

---

# 27. Visual QA checklist

## Dark mode
- [ ] no giant pure-black surfaces
- [ ] text contrast is comfortable
- [ ] cyan is restrained
- [ ] cards do not glow
- [ ] borders are visible but subtle

## Light mode
- [ ] not simple inversion
- [ ] paper cards distinguish from background
- [ ] teal remains readable
- [ ] metadata is not too pale

## Today
- [ ] single-column
- [ ] abstracts readable
- [ ] 5–7 line preview
- [ ] actions clearly prioritized
- [ ] feed colors subtle

## Training
- [ ] full abstract visible
- [ ] calibration status readable
- [ ] no gamification clutter

## Sidebar
- [ ] expanded/collapsed states intentional
- [ ] feed colors visible
- [ ] active item obvious
- [ ] counts not noisy

## Reader
- [ ] PDF gets most available space
- [ ] notebook does not feel like another dashboard card
- [ ] focus mode is calm
- [ ] landscape split works
- [ ] portrait tabs work

## Notebook
- [ ] dot grid subtle
- [ ] ink contrast strong
- [ ] page feels like paper
- [ ] controls stylus-friendly

---

# 28. Hard constraints for Luna

Do not:

- replace MUI with another component library
- add Tailwind just for styling
- add Framer Motion unless an existing limitation genuinely requires it
- add gradients everywhere
- use glassmorphism
- use neon cyan glows
- add giant hero headers
- change backend behavior
- expose recommender percentages
- reintroduce “Why this?” UI
- make feeds into colored full-page themes
- turn Training into a gamified screen
- build a separate mobile app
- add offline mode
- change PDF or notebook persistence behavior during this frontend pass

Preserve existing working logic first.

---

# 29. Final implementation principle

The redesign should make Paper Radar feel:

```text
serious
calm
modern
readable
research-oriented
tablet-friendly
```

—not flashy.

The user should be able to spend hours inside the app without the interface demanding attention from the papers.
