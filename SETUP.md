# Development Setup Guide

This guide will walk you through setting up the AiM Prompt Engineer application for local development.

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- A Supabase account (free tier works)
- An OpenAI API key

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase Project

#### 2.1 Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - **Name**: AiM Prompt Engineer (or your preferred name)
   - **Database Password**: Create a strong password (save this!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free tier is fine for development
5. Click "Create new project"
6. Wait for project to finish setting up (2-3 minutes)

#### 2.2 Get Supabase Credentials

Once your project is ready:

1. Go to **Settings** → **API** in your Supabase dashboard
2. You'll need these values:
   - **Project URL** (under "Project URL")
   - **anon/public key** (under "Project API keys" → "anon public")
   - **service_role key** (under "Project API keys" → "service_role" - keep this secret!)

#### 2.3 Run Database Migrations

1. In Supabase dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of `supabase-migration.sql`
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Verify success - you should see "Success. No rows returned"
6. Create a **New Query** again
7. Copy and paste the entire contents of `supabase-library-migration.sql`
8. Click **Run** again
9. Verify success

**Note**: The migrations create:
- `profiles` table (extends auth.users)
- `threads` table
- `messages` table
- `prompt_upvotes` table
- `saved_prompts` table
- All necessary indexes and RLS policies

### 3. Get OpenAI API Key

1. Go to [https://platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to **API Keys** section
4. Click **Create new secret key**
5. Give it a name (e.g., "AiM Prompt Engineer Dev")
6. Copy the key immediately (you won't see it again!)
7. Make sure you have credits/billing set up on your OpenAI account

### 4. Create Environment Variables File

Create a `.env.local` file in the root directory of the project:

```bash
touch .env.local
```

Add the following content (replace with your actual values):

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4-turbo

# App Configuration (optional)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Important**: 
- Never commit `.env.local` to git (it's already in `.gitignore`)
- Replace all placeholder values with your actual credentials
- The `SUPABASE_SERVICE_ROLE_KEY` should be kept secret and never exposed to the client

### 5. Verify Setup

#### 5.1 Check Environment Variables

Make sure all variables are set:

```bash
# On Mac/Linux
cat .env.local

# Verify no placeholder values remain
```

#### 5.2 Test Database Connection

You can verify your Supabase connection by checking:
- Supabase dashboard → **Table Editor** → You should see `profiles`, `threads`, `messages`, `prompt_upvotes`, `saved_prompts` tables

### 6. Start Development Server

```bash
npm run dev
```

You should see:
```
  ▲ Next.js 15.x.x
  - Local:        http://localhost:3000
  - Ready in Xs
```

### 7. Test the Application

1. Open [http://localhost:3000](http://localhost:3000)
2. You should be redirected to `/login`
3. Click "Sign up" to create a test account
4. After signing up, you'll be redirected to `/chat`
5. Try creating a new conversation and sending a message

## Troubleshooting

### Issue: "Unauthorized" errors

**Solution**: 
- Verify your Supabase credentials in `.env.local`
- Make sure you ran both migration SQL files
- Check that RLS policies were created (Supabase dashboard → Authentication → Policies)

### Issue: OpenAI API errors

**Solution**:
- Verify your OpenAI API key is correct
- Check you have credits/billing set up
- Try using `gpt-4` instead of `gpt-4-turbo` if you don't have access

### Issue: Database connection errors

**Solution**:
- Verify Supabase project is active (not paused)
- Check your `NEXT_PUBLIC_SUPABASE_URL` matches your project URL exactly
- Ensure migrations ran successfully (check SQL Editor history)

### Issue: Port 3000 already in use

**Solution**:
```bash
# Kill process on port 3000
# Mac/Linux:
lsof -ti:3000 | xargs kill -9

# Or use a different port:
PORT=3001 npm run dev
```

### Issue: Module not found errors

**Solution**:
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

## Quick Reference

### Environment Variables Checklist

- [ ] `NEXT_PUBLIC_SUPABASE_URL` - From Supabase Settings → API
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` - From Supabase Settings → API
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - From Supabase Settings → API
- [ ] `OPENAI_API_KEY` - From OpenAI Platform → API Keys
- [ ] `OPENAI_MODEL` - Optional (defaults to `gpt-4-turbo`)
- [ ] `NEXT_PUBLIC_APP_URL` - Optional (defaults to `http://localhost:3000`)

### Database Tables Checklist

After running migrations, verify these tables exist:
- [ ] `profiles`
- [ ] `threads`
- [ ] `messages`
- [ ] `prompt_upvotes`
- [ ] `saved_prompts`

### Common Commands

```bash
# Development
npm run dev          # Start dev server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run linter

# Database (if needed)
# View tables in Supabase dashboard → Table Editor
# Run SQL in Supabase dashboard → SQL Editor
```

## Next Steps

Once everything is running:

1. **Create a test account** - Sign up through the app
2. **Test chat functionality** - Create a conversation and send messages
3. **Test library features** - Make a prompt public, upvote, and save prompts
4. **Explore the UI** - Check out the sidebar, library, and saved prompts pages

## Need Help?

- Check the main [README.md](./README.md) for project overview
- Review Supabase docs: https://supabase.com/docs
- Review OpenAI docs: https://platform.openai.com/docs
- Check Next.js docs: https://nextjs.org/docs

