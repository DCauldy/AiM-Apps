# Quick Start Checklist

## What You Need

### 1. API Keys & Credentials

#### Supabase (3 values needed)
- [ ] **Project URL**: `https://xxxxx.supabase.co`
  - Location: Supabase Dashboard → Settings → API → Project URL
- [ ] **Anon Key**: `eyJhbGc...` (long string)
  - Location: Supabase Dashboard → Settings → API → Project API keys → `anon` `public`
- [ ] **Service Role Key**: `eyJhbGc...` (long string, keep secret!)
  - Location: Supabase Dashboard → Settings → API → Project API keys → `service_role` `secret`

#### OpenAI (1 value needed)
- [ ] **API Key**: `sk-...`
  - Location: https://platform.openai.com/api-keys → Create new secret key

### 2. Database Setup

Run these SQL files in Supabase SQL Editor (in order):

1. [ ] Run `supabase-migration.sql` 
   - Creates: profiles, threads, messages tables + RLS policies
2. [ ] Run `supabase-library-migration.sql`
   - Creates: prompt_upvotes, saved_prompts tables + library features

### 3. Environment File

Create `.env.local` in project root:

```bash
cp env.example .env.local
```

Then fill in all the values from step 1 above.

### 4. Install & Run

```bash
npm install
npm run dev
```

Visit: http://localhost:3000

## Quick Test

1. Sign up for a new account
2. Create a chat conversation
3. Send a message
4. Click "Make Public" on the AI response
5. Visit `/library` to see your prompt
6. Try upvoting and saving prompts

## Troubleshooting

**"Unauthorized" errors?**
→ Check Supabase credentials in `.env.local`

**Database errors?**
→ Verify migrations ran successfully in Supabase SQL Editor

**OpenAI errors?**
→ Check API key and billing/credits on OpenAI account

**Port 3000 in use?**
→ Use `PORT=3001 npm run dev`

For detailed setup, see [SETUP.md](./SETUP.md)

