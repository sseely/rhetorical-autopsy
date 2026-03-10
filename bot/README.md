# Rhetorical Autopsy Bot

Discord bot that runs the analysis pipeline: paste a post → Claude analyzes it → preview in a thread → revise via replies → approve with 👍 → publish to the site.

## Discord Application Setup

### 1. Create the Application

1. Go to https://discord.com/developers/applications
2. Click **New Application**, name it whatever you like (e.g., "Rhetorical Autopsy")
3. Note the **Application ID** on the General Information page

### 2. Create the Bot User

1. Go to the **Bot** tab in the left sidebar
2. Click **Reset Token** and copy the token — this is your `DISCORD_TOKEN`
3. Under **Privileged Gateway Intents**, enable all three:
   - **Presence Intent** — not strictly required, but enable it to avoid confusion
   - **Server Members Intent** — not strictly required, but enable it to avoid confusion
   - **Message Content Intent** — **required** (the bot reads message text to analyze posts)

### 3. Invite the Bot to Your Server

1. Go to the **OAuth2** tab
2. Under **OAuth2 URL Generator**, check the `bot` scope
3. Under **Bot Permissions**, check:
   - `Send Messages`
   - `Send Messages in Threads`
   - `Create Public Threads`
   - `Read Message History`
   - `Add Reactions`
   - `Use External Emojis`
4. Copy the generated URL, open it in your browser, and select your server

### 4. Get the Channel ID

1. In Discord, go to **User Settings → Advanced → Developer Mode** (toggle on)
2. Right-click the channel you want the bot to watch
3. Click **Copy Channel ID** — this is your `DISCORD_CHANNEL_ID`

## Environment Setup

```bash
cp .env.example .env
```

Fill in the values:

| Variable | Description |
|---|---|
| `DISCORD_TOKEN` | Bot token from step 2 above |
| `DISCORD_CHANNEL_ID` | Channel ID from step 4 above |
| `REPO_PATH` | Absolute path to the `rhetorical-autopsy` repo on this machine |
| `SITE_URL` | Base URL of the deployed site (default: `https://rhetorical-autopsy.com`) |

## Prerequisites

- **Node.js 18+**
- **Claude CLI** installed and authenticated (`claude --version` should work)
- The `rhetorical-autopsy` repo cloned locally (the bot writes markdown files and runs `git commit/push`)

## Running

```bash
# Install dependencies
npm install

# Development (uses tsx for live TypeScript execution)
npm run dev

# Production
npm run build
npm start
```

## How It Works

1. Paste a Facebook post (or any content) into the watched channel
2. The bot creates a thread and runs `claude -p` with the CLAUDE.md system prompt
3. Analysis preview appears in the thread
4. Reply in the thread to give feedback — the bot re-runs the analysis with your notes
5. React with 👍 on the preview to approve
6. The bot generates a markdown file with frontmatter, commits, and pushes to the repo
7. Cloudflare Pages auto-deploys the site
8. The bot posts the URL in the thread

## Architecture

```
Discord channel
  └─ new message → bot creates thread
       └─ claude -p (CLAUDE.md as system prompt, WebSearch+WebFetch enabled)
       └─ preview posted in thread
       └─ thread replies → re-run with feedback
       └─ 👍 reaction → publish
            └─ generate markdown + frontmatter
            └─ git add/commit/push
            └─ Cloudflare Pages auto-deploy
```
