# Vercel Deployment Checklist

## Prerequisites
- ✅ Code is committed and pushed to GitHub
- ✅ Vercel account connected to GitHub repository

## Step 1: Import Project to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository: `DCauldy/AiM-Prompts`
4. Vercel will auto-detect Next.js framework

## Step 2: Configure Environment Variables

Add the following environment variables in Vercel Dashboard → Project Settings → Environment Variables:

### Required Environment Variables:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_public_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
OPENAI_API_KEY=sk-your-openai-api-key-here
OPENAI_MODEL=gpt-4-turbo
```

### Optional Environment Variables:

```
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

**Important Notes:**
- Get Supabase credentials from: Supabase Dashboard → Settings → API
- Get OpenAI API key from: https://platform.openai.com/api-keys
- Make sure to add these for **Production**, **Preview**, and **Development** environments
- `SUPABASE_SERVICE_ROLE_KEY` is optional but recommended for admin operations

## Step 3: Configure Build Settings

Vercel should auto-detect Next.js, but verify:
- **Framework Preset:** Next.js
- **Build Command:** `npm run build` (default)
- **Output Directory:** `.next` (default)
- **Install Command:** `npm install` (default)

## Step 4: Database Setup

### Run Supabase Migrations

1. Connect to your Supabase project
2. Go to SQL Editor
3. Run the following migrations in order:
   - `supabase-migration.sql` (if not already run)
   - `supabase-library-migration.sql` (for library features)

### Verify Database Schema

Ensure these tables exist:
- `profiles`
- `threads`
- `messages` (with columns: `is_public`, `title`, `description`)
- `prompt_upvotes`
- `saved_prompts`

## Step 5: Configure Supabase Auth Redirect URLs

In Supabase Dashboard → Authentication → URL Configuration:

**Site URL:**
```
https://your-app.vercel.app
```

**Redirect URLs (add all):**
```
https://your-app.vercel.app/**
https://your-app.vercel.app/auth/callback
http://localhost:3000/**
http://localhost:3000/auth/callback
```

## Step 6: Deploy

1. Click "Deploy" in Vercel
2. Wait for build to complete
3. Check build logs for any errors

## Step 7: Post-Deployment Verification

### Test These Features:
- [ ] User authentication (sign up, login, logout)
- [ ] Create new chat conversation
- [ ] Send messages and receive AI responses
- [ ] Share prompt to library ("Share to Library" button)
- [ ] View Community Prompts library
- [ ] Save/bookmark prompts
- [ ] View saved prompts
- [ ] Profile settings page
- [ ] Sidebar navigation

### Check Console for Errors:
- Open browser DevTools → Console
- Look for any authentication or API errors

## Step 8: Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

## Troubleshooting

### Build Fails
- Check environment variables are set correctly
- Verify all dependencies are in `package.json`
- Check build logs for specific errors

### Authentication Issues
- Verify Supabase redirect URLs include your Vercel domain
- Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are correct

### API Errors
- Verify `OPENAI_API_KEY` is valid and has credits
- Check Supabase RLS policies are set correctly
- Verify database migrations have been run

### Database Connection Issues
- Ensure Supabase project is active
- Check service role key is correct (if using admin operations)
- Verify network access in Supabase settings

## Environment Variables Reference

| Variable | Required | Description | Where to Get |
|----------|----------|-------------|--------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Supabase service role key | Supabase Dashboard → Settings → API |
| `OPENAI_API_KEY` | Yes | OpenAI API key | https://platform.openai.com/api-keys |
| `OPENAI_MODEL` | No | OpenAI model (default: gpt-4-turbo) | - |
| `NEXT_PUBLIC_APP_URL` | No | App URL for redirects | Your Vercel domain |

## Next Steps After Deployment

1. Set up monitoring (Vercel Analytics)
2. Configure error tracking (Sentry, etc.)
3. Set up CI/CD for automatic deployments
4. Configure preview deployments for PRs
5. Set up staging environment if needed

