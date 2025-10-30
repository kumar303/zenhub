# GitHub Notifications Manager

A beautiful and functional web application for managing GitHub notifications with an 80s Olympics-inspired design.

## Features

- 🔐 **Secure Authentication**: Login with GitHub Personal Access Token
- 📊 **Smart Grouping**: Notifications grouped by issue/PR
- ⭐ **Priority Management**: Your own content and mentions appear first
- 🎨 **80s Olympics Theme**: Colorful gradients with accessible contrast
- 💾 **Persistent State**: Dismissed notifications saved to local storage
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
   npm run build
   ```

## Deployment

To deploy to Quick:

```bash
./deploy.sh
```

Or manually:

```bash
npm run build
quick deploy dist github-notifications
```

The app will be available at: https://github-notifications.quick.shopify.io

## GitHub Token

You'll need a GitHub Personal Access Token with the following scopes:

- `notifications` - Access your notifications
- `repo` - Access repository information

Create one at: https://github.com/settings/tokens/new

## Tech Stack

- **Preact**: Lightweight React alternative
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Vite**: Fast build tool

## Development

The project structure:

- `/src/components/` - React components
- `/src/hooks/` - Custom hooks
- `/src/api.ts` - GitHub API integration
- `/src/types.ts` - TypeScript type definitions
