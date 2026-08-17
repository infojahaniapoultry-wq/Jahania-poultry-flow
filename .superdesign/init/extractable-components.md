# Extractable Components

## AppLayout
- Source: `client/src/components/AppLayout.tsx`
- Category: layout
- Description: Authenticated application shell with responsive sidebar and top header.
- Extractable props: `children`

## Sidebar
- Source: `client/src/components/Sidebar.tsx`
- Category: layout
- Description: Primary grouped navigation with active route state.
- Extractable props: `isOpen`, `onClose`, `isMobile`

## DataTable
- Source: `client/src/components/DataTable.tsx`
- Category: basic
- Description: Sortable, searchable, loading-aware data table.
- Extractable props: `columns`, `data`, `loading`, `emptyMessage`, `hideSearch`

## Modal
- Source: `client/src/components/Modal.tsx`
- Category: basic
- Description: Centered form dialog with title, content, and footer.
- Extractable props: `open`, `onClose`, `title`, `footer`, `size`
