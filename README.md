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

## License

ISC

