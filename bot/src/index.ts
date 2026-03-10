import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  Message,
  MessageReaction,
  PartialMessageReaction,
  User,
  PartialUser,
  ThreadChannel,
} from "discord.js";
import { analyzeContent, downloadToTemp, cleanupTempFiles } from "./analyze.js";
import { publishAnalysis } from "./publish.js";
import { APPROVAL_EMOJI } from "./constants.js";
import { loadState, getThread, setThread, updateThread } from "./state.js";
import type { AnalysisState } from "./state.js";

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

// ── Discord client ───────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [
    Partials.Message,
    Partials.Reaction,
    Partials.Channel,
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
    console.log(`[Reaction] Received reaction event: emoji=${reaction.emoji.name}, user=${user.id}, bot=${user.bot}`);

    if (user.bot) return;

    // Fetch partial if needed
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch (err) {
        console.error("[Reaction] Failed to fetch partial reaction:", err);
        return;
      }
    }

    console.log(`[Reaction] Emoji: "${reaction.emoji.name}" vs APPROVAL_EMOJI: "${APPROVAL_EMOJI}"`);
    if (reaction.emoji.name !== APPROVAL_EMOJI) return;

    const channel = reaction.message.channel;
    console.log(`[Reaction] Channel isThread: ${channel.isThread()}`);
    if (!channel.isThread()) return;
    console.log(`[Reaction] parentId: ${channel.parentId} vs DISCORD_CHANNEL_ID: ${DISCORD_CHANNEL_ID}`);
    if (channel.parentId !== DISCORD_CHANNEL_ID) return;

    const state = getThread(channel.id);
    console.log(`[Reaction] Thread state exists: ${!!state}, threadId: ${channel.id}`);
    if (!state) return;
    console.log(`[Reaction] published: ${state.published}`);
    if (state.published) return;

    console.log("[Reaction] All checks passed — calling handleApproval");
    await handleApproval(channel, state);
  }
);

// ── Handlers ─────────────────────────────────────

async function handleNewPost(message: Message): Promise<void> {
  const content = message.content.trim();
  const imageAttachments = [...message.attachments.values()].filter(
    a => a.contentType?.startsWith("image/")
  );

  if (!content && imageAttachments.length === 0) return;

  const threadName = content
    ? `Analysis: ${content.slice(0, 80)}...`
    : `Analysis: [image post]`;

  const thread = await message.startThread({ name: threadName });

  // Download images to temp files
  const imagePaths: string[] = [];
  if (imageAttachments.length > 0) {
    await thread.send(
      `Downloading ${imageAttachments.length} image(s) and running analysis...`
    );
    for (const att of imageAttachments) {
      try {
        const ext = att.name?.split(".").pop() ?? "png";
        const tempPath = await downloadToTemp(
          att.url,
          REPO_PATH,
          `${att.id}.${ext}`
        );
        imagePaths.push(tempPath);
      } catch (err) {
        console.error(`Failed to download attachment ${att.id}:`, err);
      }
    }
  } else {
    await thread.send("Running analysis...");
  }

  try {
    const result = await analyzeContent(
      content,
      REPO_PATH,
      undefined,
      imagePaths.length > 0 ? imagePaths : undefined
    );

    const preview = formatPreview(result.markdown);
    await thread.send(preview);

    await setThread(thread.id, {
      originalPost: content,
      originalImagePaths: imagePaths,
      currentAnalysis: result.markdown,
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
  const state = getThread(thread.id);

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
      feedback,
      state.originalImagePaths.length > 0 ? state.originalImagePaths : undefined
    );

    const preview = formatPreview(result.markdown);
    await thread.send(preview);

    state.currentAnalysis = result.markdown;
    await updateThread(thread.id);

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
  await updateThread(thread.id);
  await thread.send("Publishing...");

  try {
    const result = await publishAnalysis(
      state.currentAnalysis,
      state.originalPost,
      REPO_PATH,
      SITE_URL
    );

    await cleanupTempFiles(state.originalImagePaths);
    await thread.send(
      `Published. URL (after deploy): ${result.url}`
    );
  } catch (err) {
    state.published = false;
    await updateThread(thread.id);
    console.error("Publish failed:", err);
    await thread.send(
      `Publish failed: ${err instanceof Error ? err.message : "unknown error"}. You can try again.`
    );
  }
}

// ── Helpers ──────────────────────────────────────

function formatPreview(markdown: string): string {
  const maxLen = 1900;
  if (markdown.length <= maxLen) return markdown;

  // Cut at last sentence-ending punctuation before the limit
  const chunk = markdown.slice(0, maxLen);
  const lastSentence = chunk.search(/[.!?]\s[^.!?]*$/);
  const cutPoint = lastSentence !== -1 ? lastSentence + 1 : maxLen;

  return markdown.slice(0, cutPoint) + "\n\n*[truncated — full analysis will be in the published page]*";
}

// ── Start ────────────────────────────────────────
await loadState();
client.login(DISCORD_TOKEN);
