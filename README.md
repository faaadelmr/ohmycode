# ohmycode

Modern, Playful, Colorful Interactive Website.

Built with:
- **Framework:** SvelteKit (Svelte 5)
- **Language:** TypeScript
- **Styling:** Tailwind CSS 4 + DaisyUI 5
- **Icons/Assets:** Custom SVG

## Features
- **Dynamic Theming:** Over 30 colorful themes to choose from.
- **Interactive UI:** Smooth transitions and playful elements using Svelte's animation system.
- **Responsive Design:** Optimized for all screen sizes.

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Theme Switching
Themes are managed via a Svelte store in `src/lib/theme.ts` and persisted in `localStorage`.
You can toggle themes using the dropdown in the navigation bar.
