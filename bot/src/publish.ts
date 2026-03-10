import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { ANALYSIS_DIR } from "./constants.ts";

export interface PublishResult {
  slug: string;
  filePath: string;
  url: string;
}

function truncateAtSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const chunk = text.slice(0, maxLen);
  const lastSentence = chunk.search(/[.!?]\s[^.!?]*$/);
  return lastSentence !== -1 ? chunk.slice(0, lastSentence + 1) : chunk;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractTitle(markdown: string): string {
  // "Title: Foo" or "**Title: Foo**" or "**Title:** Foo"
  const titleMatch = markdown.match(/^\*{0,2}Title:\*{0,2}\s*(.+?)(?:\*{0,2})$/m);
  if (titleMatch) return titleMatch[1].trim().replace(/\*+$/, "").trim();

  // Fallback: first heading
  const headingMatch = markdown.match(/^#{1,3}\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();

  return "untitled-analysis";
}

/**
 * Extract detected technique tags from the analysis.
 * Pulls bold principle names from bullet lists.
 */
function extractTags(markdown: string): string[] {
  const tags: string[] = [];

  const principleMatches = markdown.matchAll(
    /^-\s+\*\*(\w[\w\s/]+?)\*\*/gm
  );
  for (const match of principleMatches) {
    tags.push(slugify(match[1].trim()));
  }

  return [...new Set(tags)].slice(0, 10);
}

/**
 * Build a complete markdown file with YAML frontmatter,
 * commit it to the repo, and push to main.
 */
export async function publishAnalysis(
  analysisMarkdown: string,
  originalPost: string,
  repoPath: string,
  siteUrl: string
): Promise<PublishResult> {
  const title = extractTitle(analysisMarkdown);
  const tags = extractTags(analysisMarkdown);
  const date = new Date().toISOString().split("T")[0];
  const shortSlug = slugify(title).slice(0, 60);
  const slug = `${date}-${shortSlug}`;
  const filename = `${slug}.md`;
  const filePath = join(repoPath, ANALYSIS_DIR, filename);

  // Use the provided originalPost, or fall back to Source Text from the analysis (image OCR)
  let postText = originalPost.trim();
  if (!postText) {
    const sourceMatch = analysisMarkdown.match(
      /^Source Text:\s*\n?([\s\S]*?)(?=\n##\s|\n\*{0,2}Title:)/m
    );
    if (!sourceMatch) {
      // Try single-line Source Text:
      const singleLine = analysisMarkdown.match(/^Source Text:\s*(.+)$/m);
      if (singleLine) postText = singleLine[1].trim();
    } else {
      postText = sourceMatch[1].trim();
    }
  }

  const hasOriginalPost = postText.length > 0;
  const escapedPost = hasOriginalPost
    ? postText
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n")
    : "";

  const quickReadMatch = analysisMarkdown.match(
    /## Quick Read\s*\n+([\s\S]*?)(?=\n##\s)/
  );
  const description = quickReadMatch
    ? truncateAtSentence(quickReadMatch[1].trim().replace(/\n/g, " "), 200)
    : title;

  const tagsYaml =
    tags.length > 0
      ? tags.map((t) => `  - ${t}`).join("\n")
      : '  - "analysis"';

  const originalPostYaml = hasOriginalPost
    ? `\noriginalPost: |\n${escapedPost}`
    : "";

  const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${date}
description: "${description.replace(/"/g, '\\"')}"
tags:
${tagsYaml}${originalPostYaml}
---`;

  // Clean the body:
  // 1. Strip any Title: line (plain or bold markdown)
  // 2. Remove preamble before ## Quick Read (Claude thinking noise)
  // 3. Remove standalone horizontal rules (---) that clutter the layout
  let body = analysisMarkdown
    .replace(/^\*{0,2}Title:\*{0,2}\s*.+\n*/m, "")
    .replace(/^Source Text:\s*\n?[\s\S]*?(?=\n##\s)/m, "")
    .replace(/^Source Text:\s*.+\n*/m, "")
    .trimStart();

  const quickReadIdx = body.indexOf("## Quick Read");
  if (quickReadIdx > 0) {
    body = body.slice(quickReadIdx);
  }

  // Strip Facebook Teaser — it's for Discord, not the published site
  body = body.replace(/## Facebook Teaser\s*\n+[\s\S]*?(?=\n##\s|\n\*\*Sources|\n---\s*$|$)/, "");

  body = body.replace(/^---\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

  const fullContent = `${frontmatter}\n\n${body}\n`;

  await writeFile(filePath, fullContent, "utf-8");

  // Git operations
  const git = simpleGit(repoPath);
  const relPath = join(ANALYSIS_DIR, filename);
  await git.add(relPath);
  await git.commit(`analysis: ${title}`);
  const branch = (await git.branch()).current;
  await git.push("origin", branch);

  const url = `${siteUrl}/analysis/${slug}/`;
  return { slug, filePath, url };
}
