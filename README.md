# Zenhub

Github notifications but chill.

# 🧘🏻

https://zenhub.quick.shopify.io

## Features

- 📊 **Smart Grouping**: Notifications grouped by issue/PR
- ⭐ **Priority Management**: Your own content and mentions appear first
- 🔔 **Web Notifications**: Get browser notifications for important updates
- 🔄 **Auto-refresh**: Polls for new notifications every minute

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run development server:

   ```bash
   npm run dev
   ```

3. Build for production:

   ```bash
   npm run build -- --watch
   ```

4. Run tests:
   ```bash
   npm test
   ```

## Development Workflow

### Post-Change Checklist ✅

After making any code changes, run:

```bash
npm run check    # Runs tests and type checking
npm run deploy   # Deploys to Quick
```

> **For AI Agents**: See [`AGENTS.md`](./AGENTS.md) for the complete post-change checklist that must be followed after every code change.

## Testing

The project uses Vitest with Preact Testing Library. Tests are located in `src/**/*.test.tsx` files.

Key test features:

- **Unit tests** for component logic
- **Mocked hooks** for isolated component testing
- **Real-world data scenarios** based on actual GitHub notification patterns

Test commands:

```bash
npm test              # Run tests in watch mode
npm run test:run      # Run tests once
npm run test:ui       # Run tests with UI
```

## Type Checking

```bash
npm run typecheck     # Run TypeScript compiler checks
```

## Deployment

To deploy to Quick:

```bash
./deploy.sh
```
