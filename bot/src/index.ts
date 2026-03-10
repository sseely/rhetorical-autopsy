import {
  Client,
  Events,
  GatewayIntentBits,
  Message,
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
  ThreadChannel,
} from "discord.js";
import { analyzeContent } from "./analyze.js";
import { publishAnalysis } from "./publish.js";
import { APPROVAL_EMOJI } from "./constants.js";

// ── Config from environment ──────────────────────
const DISCORD_TOKEN = requiredEnv("DISCORD_TOKEN");
const DISCORD_CHANNEL_ID = requiredEnv("DISCORD_CHANNEL_ID");
const REPO_PATH = requiredEnv("REPO_PATH");
const SITE_URL = process.env.SITE_URL ?? "https://rhetorical-autopsy.com";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

// ── In-memory state per analysis thread ──────────
interface AnalysisState {
  originalPost: string;
  currentAnalysis: string;
  previewMessageId: string;
  published: boolean;
}

const threadState = new Map<string, AnalysisState>();

// ── Discord client ───────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
});

client.once(Events.ClientReady, (c) => {
  console.log(`Bot online as ${c.user.tag}`);
});

// ── New message in the watched channel ───────────
client.on(Events.MessageCreate, async (message: Message) => {
  if (message.author.bot) return;

  // Top-level message in the designated channel → new analysis
  if (
    message.channelId === DISCORD_CHANNEL_ID &&
    !message.channel.isThread()
  ) {
    await handleNewPost(message);
    return;
  }

  // Message inside an analysis thread → revision feedback
  if (
    message.channel.isThread() &&
    message.channel.parentId === DISCORD_CHANNEL_ID
  ) {
    await handleRevision(message);
    return;
  }
});

// ── Reaction on a preview message → approval gate ─
client.on(
  Events.MessageReactionAdd,
  async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ) => {
    if (user.bot) return;

    // Fetch partial if needed
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }

    if (reaction.emoji.name !== APPROVAL_EMOJI) return;

    const channel = reaction.message.channel;
    if (!channel.isThread()) return;
    if (channel.parentId !== DISCORD_CHANNEL_ID) return;

    const state = threadState.get(channel.id);
    if (!state) return;
    if (state.published) return;
    if (reaction.message.id !== state.previewMessageId) return;

    await handleApproval(channel, state);
  }
);

// ── Handlers ─────────────────────────────────────

async function handleNewPost(message: Message): Promise<void> {
  const content = message.content.trim();
  if (!content) return;

  // Create a thread for this analysis
  const thread = await message.startThread({
    name: `Analysis: ${content.slice(0, 80)}...`,
  });

  await thread.send("Running analysis...");

  try {
    const result = await analyzeContent(content, REPO_PATH);

    // Post preview — truncate if over Discord's 2000-char limit
    const preview = formatPreview(result.markdown);
    const previewMsg = await thread.send(preview);

    threadState.set(thread.id, {
      originalPost: content,
      currentAnalysis: result.markdown,
      previewMessageId: previewMsg.id,
      published: false,
    });

    await thread.send(
      `React with ${APPROVAL_EMOJI} on the preview above to publish.\nReply in this thread to request changes.`
    );
  } catch (err) {
    console.error("Analysis failed:", err);
    await thread.send(
      `Analysis failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }
}

async function handleRevision(message: Message): Promise<void> {
  const thread = message.channel as ThreadChannel;
  const state = threadState.get(thread.id);

  if (!state) {
    await thread.send(
      "No active analysis in this thread. Paste content in the main channel to start."
    );
    return;
  }

  if (state.published) {
    await thread.send("This analysis has already been published.");
    return;
  }

  const feedback = message.content.trim();
  if (!feedback) return;

  await thread.send("Re-running analysis with feedback...");

  try {
    const result = await analyzeContent(
      state.originalPost,
      REPO_PATH,
      feedback
    );

    const preview = formatPreview(result.markdown);
    const previewMsg = await thread.send(preview);

    state.currentAnalysis = result.markdown;
    state.previewMessageId = previewMsg.id;

    await thread.send(
      `Updated preview posted. React with ${APPROVAL_EMOJI} to publish, or reply with more feedback.`
    );
  } catch (err) {
    console.error("Revision failed:", err);
    await thread.send(
      `Revision failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }
}

async function handleApproval(
  thread: ThreadChannel,
  state: AnalysisState
): Promise<void> {
  state.published = true;
  await thread.send("Publishing...");

  try {
    const result = await publishAnalysis(
      state.currentAnalysis,
      state.originalPost,
      REPO_PATH,
      SITE_URL
    );

    await thread.send(
      `Published. URL (after deploy): ${result.url}`
    );
  } catch (err) {
    state.published = false;
    console.error("Publish failed:", err);
    await thread.send(
      `Publish failed: ${err instanceof Error ? err.message : "unknown error"}. You can try again.`
    );
  }
}

// ── Helpers ──────────────────────────────────────

function formatPreview(markdown: string): string {
  const maxLen = 1900; // Leave room for formatting
  if (markdown.length <= maxLen) return markdown;
  return markdown.slice(0, maxLen) + "\n\n*[truncated — full analysis will be in the published page]*";
}

// ── Start ────────────────────────────────────────
client.login(DISCORD_TOKEN);
