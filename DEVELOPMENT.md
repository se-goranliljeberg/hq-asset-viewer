# Development Guide

A step-by-step guide to cloning **hq-asset-viewer** to your local machine and running it as a web app.

---

## Prerequisites

Before you begin, make sure you have the following installed:

| Tool | Version | Download |
|------|---------|----------|
| **Git** | Any recent version | https://git-scm.com/downloads |
| **Node.js** | v18 or later | https://nodejs.org |
| **Bun** | Latest | https://bun.sh |

> **Why Bun?** This project uses Bun as its package manager (a `bun.lock` file is present). You can use `npm` as a fallback, but Bun is recommended for consistency.

To verify your installs, run:

```bash
git --version
node --version
bun --version
```

---

## Step 1 — Clone the Repository

Open a terminal and run:

```bash
git clone https://github.com/georgeflower/hq-asset-viewer.git
```

Then navigate into the project folder:

```bash
cd hq-asset-viewer
```

---

## Step 2 — Install Dependencies

Install all required packages using Bun:

```bash
bun install
```

This reads `package.json` and installs everything into a local `node_modules/` folder. It should only take a few seconds.

---

## Step 3 — Start the Development Server

Run the local dev server with hot-module reloading (HMR):

```bash
bun run dev
```

Vite will start and output something like:

```
  VITE vX.X.X  ready in Xms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

Open **http://localhost:5173** in your browser to view the app. Changes you make to source files will automatically refresh the page.

---

## Step 4 — Build for Production

When you're ready to create an optimised production build, run:

```bash
bun run build
```

The compiled output will be placed in the `dist/` folder. These are the static files you would deploy to a web server or hosting service.

To preview the production build locally before deploying:

```bash
bun run preview
```

This serves the `dist/` folder at **http://localhost:4173** so you can verify it looks and behaves correctly.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start local dev server with HMR |
| `bun run build` | Build optimised production bundle to `dist/` |
| `bun run build:dev` | Build in development mode (unminified) |
| `bun run preview` | Serve the production build locally |
| `bun run lint` | Run ESLint across all source files |
| `bun run format` | Auto-format code with Prettier |

---

## Troubleshooting

**Port 5173 is already in use**
Vite will automatically try the next available port. Alternatively, specify a port manually:
```bash
bun run dev -- --port 3000
```

**`bun` command not found**
Install Bun by running:
```bash
curl -fsSL https://bun.sh/install | bash
```
Then restart your terminal.

**Node version mismatch errors**
Ensure you are running Node.js v18 or later. Use [nvm](https://github.com/nvm-sh/nvm) to manage multiple Node versions:
```bash
nvm install 18
nvm use 18
```