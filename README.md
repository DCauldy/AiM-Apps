# AiM Prompt Engineer

An AI-powered prompt generation and optimization tool for AI Marketing Academy members.

## Features

- User authentication with Supabase
- Thread/conversation management
- Real-time streaming chat with OpenAI GPT-4
- Prompt optimization with intelligent clarification questions
- Copy-to-clipboard for generated prompts
- **Public Prompt Library** - Share and discover prompts from the community
- **Upvoting System** - Vote for your favorite prompts
- **Save/Bookmark Prompts** - Save prompts to your personal collection
- Mobile-responsive design

## Quick Start

For detailed setup instructions, see [SETUP.md](./SETUP.md)

### Quick Setup Checklist

1. **Install dependencies**: `npm install`
2. **Set up Supabase**:
   - Create project at https://supabase.com
   - Run `supabase-migration.sql` in SQL Editor
   - Run `supabase-library-migration.sql` in SQL Editor
   - Get API keys from Settings → API
3. **Get OpenAI API key** from https://platform.openai.com/api-keys
4. **Create `.env.local`** (copy from `env.example` and fill in values)
5. **Start dev server**: `npm run dev`

See [SETUP.md](./SETUP.md) for complete step-by-step instructions.

## Project Structure

```
├── app/
│   ├── (auth)/          # Authentication pages
│   ├── (dashboard)/     # Protected dashboard pages
│   ├── api/             # API routes
│   └── layout.tsx       # Root layout
├── components/
│   ├── auth/            # Auth components
│   ├── chat/            # Chat components
│   ├── layout/          # Layout components
│   ├── sidebar/         # Sidebar components
│   └── ui/              # shadcn/ui components
├── hooks/               # React hooks
├── lib/                 # Utilities and clients
├── types/               # TypeScript types
└── supabase-migration.sql  # Database schema
```

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **AI**: OpenAI GPT-4 Turbo
- **Icons**: Lucide React

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Supabase Migrations

When adding or changing Supabase migrations, run them against the local database before handing off the work:

```bash
supabase migration up
```

If the change is to schema that may already be applied locally, create a follow-up migration instead of editing only the old migration. Verify important functions, policies, or tables exist with `psql` when the app depends on them.

For production pushes and schema-drift repairs, use [Supabase Production Migrations](./docs/supabase-production-migrations.md). The helper script runs local migrations, dry-runs or applies the linked remote push, and can verify production RPC signatures:

```bash
scripts/supabase-production-migrations.sh --verify-function "public.delete_tour_scene(p_project_id uuid, p_scene_id uuid)"
```

## App UI Patterns

Before adding or refactoring app UI surfaces, read [App Surface Patterns](./docs/app-surface-patterns.md). Use the shared `components/app-shell` primitives for app shells, product headers, welcome screens, dashboard/page structure, upgrade dialogs, and onboarding chat presentation.

## Optimistic Sortable Lists

When building a persisted drag-and-drop or move-button list, use `hooks/useOptimisticSortableList.ts`.

This hook is the project pattern for snappy list reordering:

- Render from the hook's `items`, not stale server props.
- Pass the hook's `itemIds` to `SortableContext`.
- Call `reorderById(active.id, over?.id)` from dnd-kit `onDragEnd`.
- Call `moveItem(id, "up" | "down")` for keyboard/button reordering.
- Persist with `onPersistOrder(orderedIds)` and let the hook keep the new order visible while the network request runs.
- On failure, the hook rolls back to the previous order and exposes `error`.
- Provide `getSyncKey` when item content can change without item IDs changing.

Agents should use this hook for future persisted sortable lists instead of rebuilding optimistic reorder state by hand. Server APIs must still validate a complete ordered ID list before writing, so the optimistic UI is backed by a trustworthy mutation.

## License

ISC
