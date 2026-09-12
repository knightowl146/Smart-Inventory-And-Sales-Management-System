# Smart Inventory & Sales Management - Frontend

A React (Vite) single-page app for the Smart Inventory & Sales Management System. It provides the UI for products, customers, suppliers, sales, purchases, inventory, stock movements, an executive dashboard, analytics, AI-powered stock recommendations, and reporting with CSV/XLSX/PDF export.

This app is the frontend half of the project - it talks to the Node/Express/MongoDB backend in the repository root. The backend must be running for this app to load any data.

## Prerequisites

- Node.js (v18 or higher recommended)
- The backend API running (see the root [README](../README.md) for setup, including the MongoDB replica-set requirement)

## Setup

```bash
npm install
```

Configure the API base URL in `.env` (already present with a sensible local default):

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

## Development

```bash
npm run dev
```

Starts the Vite dev server with hot module reload, by default at `http://localhost:5173`.

## Build

```bash
npm run build
```

Produces a production build in `dist/`. Preview it locally with:

```bash
npm run preview
```

## Lint

```bash
npm run lint
```

## Project structure

```
src/
  api/          Axios client and per-resource API functions
  components/    Shared UI building blocks (Button, Modal, DataTable, Tabs, forms, etc.)
  layout/        App shell: Sidebar, Topbar, AppLayout
  pages/         One file per route (Dashboard, Products, Sales, Analytics, Reports, ...)
  pages/analytics/  Individual tabs rendered inside the Analytics page
  pages/reports/    Individual tabs rendered inside the Reports page
```

## Tech stack

- React 19 + Vite
- React Router for client-side routing
- Recharts for charts
- Axios for API calls
- Plain CSS with design tokens in `src/index.css` (no CSS framework)

## Responsive behavior

Below 860px the sidebar collapses into an off-canvas drawer, opened via the menu button in the top bar. Tables scroll horizontally rather than clipping content on narrow screens.
