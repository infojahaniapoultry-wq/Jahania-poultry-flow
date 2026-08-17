# Shared Layouts

## App shell

Source: `client/src/components/AppLayout.tsx`

The authenticated shell uses a dark green sidebar, sticky translucent top header, breadcrumb, theme toggle, user identity, and a responsive content container. It routes unauthenticated users to `/login` and protects admin-only routes.

## Sidebar

Source: `client/src/components/Sidebar.tsx`

The sidebar groups navigation into Overview, Operations, Parties, Finance, and Admin. It uses lucide icons, active-route highlighting, responsive mobile close behavior, and the PoultryFlow/Jahania Poultry brand lockup.

## Visual language

Use the existing shell: warm off-white page background, dark forest sidebar, mint active navigation, green primary actions, amber secondary accents, rounded 1rem cards, and restrained shadows.
