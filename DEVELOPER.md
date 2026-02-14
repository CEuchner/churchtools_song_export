# Developer Guide

This document explains the architecture, data flow, and development workflow for the Song Export Extension.

## Purpose

The extension provides a configurable PDF export for ChurchTools songs. It focuses on flexible filtering, per-column formatting, and reusable export settings.

## Tech Stack

- TypeScript
- Vite
- pdfmake
- ChurchTools API

## Project Structure

```
.
├── src/
│   ├── main.ts            // UI, state, event handlers
│   ├── vite-env.d.ts      // Vite type definitions
│   └── utils/
│       ├── ct-types.d.ts  // ChurchTools API types
│       ├── kv-store.ts    // Key-value storage helper
│       ├── pdfExport.ts   // PDF generation logic
│       └── reset.css      // CSS reset
├── index.html
├── vite.config.ts
└── package.json
```

Key entry points:

- UI, state, and event handlers: [src/main.ts](src/main.ts)
- PDF generator: [src/utils/pdfExport.ts](src/utils/pdfExport.ts)
- KV store helper: [src/utils/kv-store.ts](src/utils/kv-store.ts)
- Dev proxy and build config: [vite.config.ts](vite.config.ts)

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create `.env` from `.env-example` and set your values.

3. Start the dev server:
   ```bash
   npm run dev
   ```

If the API calls are blocked by CORS, allow your local dev origin in ChurchTools
Admin -> System Settings -> Integrations -> API -> CORS.

## ChurchTools API Integration

### Endpoints

- `GET /tags/song`
- `GET /event/masterdata`
- `GET /songs?include=tags&limit=200&page=N`

### Pagination

Songs are fetched in pages of 200 until no more data is returned. This keeps
loading predictable and avoids large payloads.

## State Management

The UI state is kept in plain structures to simplify import/export and
re-rendering.

- `Set` for selections (categories, tags, details)
- `Map` for per-detail formatting and per-context grouping
- `Array` for drag-and-drop ordering of tags and details

These are serialized into JSON for settings export, using `Array.from()` for
Maps and Sets.

Settings export/import is implemented in [src/main.ts](src/main.ts).

## PDF Export Flow

1. Filter songs by category.
2. Build sections based on tag ordering and the "All Songs" option.
3. Sort per section if alphabetical grouping is enabled.
4. Convert songs to rows using the selected details.
5. Render a pdfmake table for each section, with a styled header.

The PDF generator lives in [src/utils/pdfExport.ts](src/utils/pdfExport.ts).

## Default Arrangement Logic

Songs can have multiple arrangements. The logic is:

- Prefer the arrangement with `isDefault === true`.
- Fallback to the first arrangement if none are marked default.

This ensures consistent values for fields like `key`, `tempo`, and
`sourceReference`.

## Settings Export/Import

Settings are exported as JSON and include:

- Selected categories, tags, and details
- Tag/detail ordering
- Per-detail formatting
- Per-context alphabetical grouping
- Header style options

Import validates JSON format and ignores missing tags/details. After import, the
UI is fully re-rendered so the state matches the saved configuration.

## Drag-and-Drop Ordering

Tags and details are draggable. The UI updates both the DOM order and the
backing arrays (`orderedTags`, `orderedDetails`) so PDF generation follows the
visible order.

Drag-and-drop handlers live in [src/main.ts](src/main.ts).

## Build and Deploy

- `npm run build` compiles TypeScript and builds with Vite.
- `npm run deploy` packages the build output into a ZIP file in `releases/`.

The package script is configured in [package.json](package.json).

## Testing Strategy (Planned)

- Unit tests for `getDefaultArrangement()` and `getDetailValue()`
- Integration tests for settings export/import
- Optional E2E tests for UI flows

## Troubleshooting

- CORS errors: add your local dev origin in ChurchTools CORS settings.
- Login issues in Safari: use a Vite proxy and consider HTTPS for local dev.
- Missing song data: verify the `/songs` endpoint and pagination.

## Extension Configuration

- Extension key: `VITE_KEY` in `.env`
- Menu name: configured in ChurchTools Admin UI (not in code)
