# Dubbing Vote Static Supabase Version

This version is designed for static hosting, such as Tencent Cloud Build & Deploy.

## Files

- `admin.html`: teacher control page
- `screen.html`: big screen page
- `vote.html`: student voting page
- `config.js`: Supabase and site configuration
- `setup.sql`: Supabase database setup

## Setup

1. Create a Supabase project.
2. Open Supabase Dashboard -> SQL Editor.
3. Run everything in `setup.sql`.
4. Open `config.js` and fill:

```js
SUPABASE_URL: "https://xxxx.supabase.co",
SUPABASE_ANON_KEY: "xxxx",
ADMIN_CODE: "your admin code",
PUBLIC_BASE_URL: "https://your deployed domain"
```

5. Push these files to GitHub.
6. Deploy through Tencent Cloud Build & Deploy.

## URLs

- `/admin.html`: admin
- `/screen.html`: big screen
- `/vote.html`: student voting page

## Important Security Note

This is a static frontend version. It is convenient, but not strongly secure because admin actions are performed from the browser. For a school competition, this is usually acceptable. For serious voting or public use, add a backend or Supabase Edge Functions for admin-only actions.
