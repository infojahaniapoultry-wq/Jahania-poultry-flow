# PoultryFlow design system

## Product context

PoultryFlow is the operations workspace for Jahania Poultry. Its core users are owners, administrators, and data-entry staff who need to move quickly between stock, purchasing, sales, ledgers, cash, and reports. The UI should feel calm, dependable, and operational rather than flashy.

## Visual direction

- Use a warm, paper-like canvas with deep pine navigation and a restrained harvest amber accent.
- Keep dense business data easy to scan using generous row height, strong labels, and short uppercase metadata.
- Prefer rounded 16–24px surfaces, subtle 1px borders, and soft layered shadows.
- Use emerald/pine for positive actions and healthy states, amber for attention and benchmark data, red only for risk or money owed.
- Use Lucide icons with consistent 18–20px stroke icons. Do not introduce decorative stock photography.

## Tokens

- Canvas: `#f6f4ef`; cards: `#fffdf9`; muted: `#f1eee7`
- Pine: `#17261f`; primary green: `#38633f`; sage: `#9bbf78`; amber: `#d7923e`
- Text: `#17231d`, secondary `#55635a`, muted `#89958c`; border `#e5e2da`
- Type: system sans / Inter-like; heavy display weight 800–900; metadata 10–11px uppercase with 0.16–0.22em tracking
- Radius: 12px controls, 16px cards, 24px hero surfaces
- Shadow: `0 8px 22px rgba(48, 57, 48, 0.06)`; elevated `0 20px 50px rgba(48, 57, 48, 0.12)`
- Motion: 180–300ms ease-out; hover surfaces lift 1–2px; use fade/slide on page entry only

## Layout

- Desktop: fixed 280px sidebar + sticky 72px header + centered max-width content.
- Dashboard: title/action row, four KPI cards, quick actions, then a wide chart paired with a dark daily summary and supporting insight panels.
- Mobile: collapse sidebar into a drawer, keep primary action visible, stack cards and charts.

## Accessibility

Maintain visible focus rings, 44px touch targets, semantic headings, adequate contrast, and never use color alone for financial status.
