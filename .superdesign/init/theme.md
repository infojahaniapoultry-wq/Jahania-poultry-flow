# PoultryFlow Design Tokens

## Compact token summary

- Backgrounds: primary `#fffdf9`, secondary `#f6f4ef`, card `#ffffff`, muted `#f1eee7`
- Sidebar: `#17261f`, hover `#23382d`, active `#d9eadb`
- Accent: green `#547b5a`, strong green `#38633f`, amber `#d7923e`, terracotta `#c86f51`, red `#c8544f`, blue `#457a88`
- Text: primary `#17231d`, secondary `#55635a`, muted `#89958c`
- Borders: `#e5e2da` and light `#efede7`
- Shadows: `0 8px 22px rgba(48,57,48,.06)`, large `0 20px 50px rgba(48,57,48,.12)`, soft `0 2px 5px rgba(48,57,48,.035), 0 14px 34px rgba(48,57,48,.07)`
- Radius: default `1rem`, small `.7rem`; controls use rounded-xl/2xl
- Font: Inter/system sans; headings are bold/black with tight tracking; labels are 10–11px uppercase with letter spacing

## Source

Source: `client/src/app/globals.css`. Tailwind utility classes are used throughout; use the existing CSS variables rather than inventing new colors.
