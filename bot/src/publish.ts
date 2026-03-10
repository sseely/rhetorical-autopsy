import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import { ANALYSIS_DIR } from "./constants.js";

export interface PublishResult {
  slug: string;
  filePath: string;
  url: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Extract a short title from the analysis markdown.
 * Looks for "## Quick Read" content to derive a slug.
 */
function extractTitle(markdown: string): string {
  const quickReadMatch = markdown.match(
    /## Quick Read\s*\n+(.+?)(?:\n|\.)/
  );
  if (quickReadMatch) {
    return quickReadMatch[1].trim().split(/\s+/).slice(0, 8).join(" ");
  }

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

  const escapedPost = originalPost
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");

  const quickReadMatch = analysisMarkdown.match(
    /## Quick Read\s*\n+([\s\S]*?)(?=\n##\s)/
  );
  const description = quickReadMatch
    ? quickReadMatch[1].trim().replace(/\n/g, " ").slice(0, 200)
    : title;

  const tagsYaml =
    tags.length > 0
      ? tags.map((t) => `  - ${t}`).join("\n")
      : '  - "analysis"';

  const frontmatter = `---
title: "${title.replace(/"/g, '\\"')}"
date: ${date}
description: "${description.replace(/"/g, '\\"')}"
tags:
${tagsYaml}
originalPost: |
${escapedPost}
---`;

  const fullContent = `${frontmatter}\n\n${analysisMarkdown}\n`;

  await writeFile(filePath, fullContent, "utf-8");

  // Git operations
  const git = simpleGit(repoPath);
  const relPath = join(ANALYSIS_DIR, filename);
  await git.add(relPath);
  await git.commit(`analysis: ${title}`);
  await git.push("origin", "main");

  const url = `${siteUrl}/analysis/${slug}/`;
  return { slug, filePath, url };
}
