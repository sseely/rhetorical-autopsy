# rhetorical-autopsy — Project Kickoff Prompt

Use this prompt to bootstrap the project in Claude Code or a new Claude session.

---

## The Prompt

You are helping me build **rhetorical-autopsy**, a media literacy tool. I see divisive content on Facebook, analyze it through an academic framework, and publish the analysis as a permanent linkable page I can drop into comments.

### The Pipeline

1. I copy a Facebook post
2. Paste it into a Discord bot in a dedicated channel
3. Bot calls the Anthropic API with `CLAUDE.md` as the system prompt
4. Bot posts the analysis back as a preview in a thread
5. I can reply in the thread to request changes ("emphasize the FUD pattern more," "check if that institute is real") — bot re-runs with feedback
6. I approve via emoji reaction (specific emoji TBD)
7. On approval: bot generates a markdown file with frontmatter, commits to the GitHub repo, pushes to main
8. Auto-deploy publishes the page
9. I grab the URL, reply to the original Facebook post

**Target: under 90 seconds from copy to published link.**

### Architecture Decisions (Already Made)

- **Static site:** Eleventy (11ty). I've built Eleventy sites before — skip the basics.
- **Content format:** Markdown files with YAML frontmatter in a content directory (e.g., `src/analysis/`).
- **Slug pattern:** `rhetorical-autopsy.com/analysis/YYYY-MM-DD-short-descriptor` — self-documenting URLs that build trust before the click.
- **Hosting:** Auto-deploys from `main` branch. Netlify, Vercel, or Cloudflare Pages — I'll pick.
- **Bot:** Discord bot. Listens in a single dedicated channel. Calls Anthropic API. Posts preview. Waits for approval. On approval: writes markdown, git commits, pushes.
- **Analysis engine:** The Anthropic API with `CLAUDE.md` as the system prompt. That file contains the full three-tier analysis framework with academic citations. It's already written — it lives in the repo root.
- **Approval gate is non-negotiable.** My credibility is the product. One bad analysis and people stop clicking. The bot never auto-publishes.

### What the Markdown Output Needs to Look Like

The API response needs to be a complete markdown file ready to drop into the Eleventy content folder. That means:

- YAML frontmatter with: title, date, tags (detected techniques), a short description/excerpt for social previews and Open Graph meta
- A "Quick Read" section at the top (1-2 sentences) — this is what shows up in link previews and is the hook for Facebook friends
- The original post text (quoted/blockquoted) so the analysis has context
- The analysis body following the output format in CLAUDE.md
- A "What to Ask Yourself" closing section — 2-3 questions for the reader. This is the inoculation.

### Design Direction for the Site

- **Tone:** Clinical, not preachy. This is an examination table, not a pulpit.
- **Layout:** The original post should be visible alongside or above the analysis so readers can cross-reference. Side-by-side on desktop, stacked on mobile.
- **Typography:** Readable. This is long-form analytical content — optimize for that.
- **Branding:** Minimal. The name "Rhetorical Autopsy" does the work. Maybe a subtle scalpel or magnifying glass motif. Don't overdesign it.
- **The analysis should feel authoritative but accessible.** Academic citations are present but not overwhelming. Framework names are linked or footnoted, not inline jargon.
- **Each published analysis should have good Open Graph / social meta** so the link preview in Facebook looks intentional and trustworthy when I paste it.

### The CLAUDE.md Framework (Reference, Don't Duplicate)

The analysis framework is in `CLAUDE.md` at the repo root. It contains:
- Three-tier analysis: Surface (always runs), Deep (on request or for sophisticated content), Systemic (multi-post patterns)
- Grounded in: Cialdini (influence), Kahneman & Tversky (framing/bias), Nabi & Green (emotional flow), Green & Brock (narrative transportation), Lifton (thought-terminating clichés), Haidt (moral foundations), Sherman & Cohen (identity threat / self-affirmation), RAND/Paul & Matthews (firehose of falsehood), McGuire / van der Linden (inoculation theory)
- Output format spec with Quick Read, Emotional Architecture, Influence Principles, Source Check, Thought-Terminating Clichés, Deeper Patterns, and What to Ask Yourself sections
- Rules of engagement: analyze structure not truth, stay politically neutral, flag uncertainty, respect the reader's intelligence

### What I Need You to Build

1. **Eleventy project scaffolding** — config, layouts, content collection for analyses, proper Open Graph meta in the head, RSS feed
2. **A base template** for individual analysis pages — blockquoted original post, analysis body, citations/references footer
3. **The Discord bot** — listener, API integration with CLAUDE.md as system prompt, thread-based preview and revision, emoji-gated approval, git commit and push on approval
4. **A sample analysis** — take the watermelon example from the CLAUDE.md development process and publish it as the first post so I can see the full rendered output

### My Technical Context

- I know Eleventy, git, markdown, and deployment pipelines. Don't hand-hold on those.
- I'll handle Discord bot hosting (probably a small VPS or Railway).
- I'll handle domain registration and DNS.
- I have an Anthropic API key.

### What I Don't Want

- No React, no SPA, no client-side JS framework. This is a static site that serves markdown-rendered HTML. Eleventy's whole job.
- No database. Content is markdown files in git. That's the database.
- No user accounts or auth on the site. It's a public read-only publication.
- No comments section. Discussion happens on Facebook where the link is posted.
- Don't duplicate the CLAUDE.md analysis framework inline — reference it from the file.
