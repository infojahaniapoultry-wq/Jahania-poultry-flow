# Theme token summary

| Token | Value |
|---|---|
| `--bg-primary` | `#fffdf9` |
| `--bg-secondary` | `#f6f4ef` |
| `--bg-card` | `#ffffff` |
| `--bg-muted` | `#f1eee7` |
| `--sidebar-bg` | `#17261f` |
| `--accent-green-strong` | `#38633f` |
| `--accent-green` | `#547b5a` |
| `--accent-amber` | `#d7923e` |
| `--text-primary` | `#17231d` |
| `--text-secondary` | `#55635a` |
| `--text-muted` | `#89958c` |
| `--border` | `#e5e2da` |
| `--radius` | `1rem` |
| `--shadow` | `0 8px 22px rgba(48, 57, 48, 0.06)` |

Typography is system sans / Inter-like with 800–900 weight headings and 10–11px uppercase metadata. Tailwind v4 is imported in `src/app/globals.css`; the app also uses Lucide, Recharts, and React DatePicker.

```css
@import "tailwindcss";
:root { --bg-primary:#fffdf9; --bg-secondary:#f6f4ef; --bg-card:#fff; --bg-muted:#f1eee7; --sidebar-bg:#17261f; --accent-green:#547b5a; --accent-green-strong:#38633f; --accent-amber:#d7923e; --text-primary:#17231d; --text-secondary:#55635a; --text-muted:#89958c; --border:#e5e2da; --radius:1rem; --shadow:0 8px 22px rgba(48,57,48,.06); }
```
