# Dubbing Vote App

A simple realtime voting system for a live dubbing competition.

## Pages

- `/admin` Teacher/admin control page
- `/screen` Big screen display page
- `/vote` Student voting page, used by the fixed QR code

## Features

- 10 groups prepared by default
- Group names can be edited in admin
- Admin chooses the current group on the day of the competition
- Fixed QR code, always points to `/vote`
- 2-minute voting flow: 1 minute canvassing + 1 minute final voting
- Big screen has no control buttons
- Student device token is saved in localStorage
- Same device/browser can only vote once per group
- Final ranking can be pushed to the big screen from admin

## Local Run

```bash
npm install
cp .env.example .env
npm start
```

Then open:

- Big screen: `http://localhost:3000/screen`
- Admin: `http://localhost:3000/admin`
- Vote: `http://localhost:3000/vote`

Default admin password:

```text
123456
```

Change it in `.env` before deployment.

## Tencent Cloud Deployment Sketch

```bash
git clone YOUR_REPO_URL
cd dubbing-vote-app
npm install
cp .env.example .env
nano .env
npm install -g pm2
pm2 start server.js --name dubbing-vote
pm2 save
```

In `.env`, set:

```text
PORT=3000
ADMIN_PASSWORD=your_real_password
PUBLIC_BASE_URL=http://your-server-ip:3000
```

If you use a domain and Nginx reverse proxy, set `PUBLIC_BASE_URL` to your domain, for example:

```text
PUBLIC_BASE_URL=https://vote.example.com
```

## Notes

This prototype uses SQLite. The database file will be created at:

```text
db/database.sqlite
```

Do not delete it after the competition unless you have exported or saved the result.
