dont run npm run build or npm run dev
vist http://localhost:6060 with agents browser if you need to qa
if you add or change supabase migrations, run them locally before saying the work is done
we use vitest for tests; do not pass --runInBand because that flag is jest-only
If you encounter an app-related file over 1,000 lines, follow docs/codebase-cleanliness.md before finishing.
