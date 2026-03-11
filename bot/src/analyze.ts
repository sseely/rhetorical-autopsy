import { execFile } from "node:child_process";
import { join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";

export interface AnalysisResult {
  markdown: string;
  sourceText: string;
}

/**
 * Run the analysis framework via the Claude CLI.
 * Uses `claude -p` (print mode): single prompt in, markdown out, process exits.
 * System prompt is CLAUDE.md at the repo root. Auth uses the CLI's own credentials.
 */
export async function analyzeContent(
  content: string,
  repoPath: string,
  feedback?: string,
  imagePaths?: string[]
): Promise<AnalysisResult> {
  const systemPromptFile = join(repoPath, "CLAUDE.md");

  let userMessage: string;

  if (imagePaths?.length && content) {
    const imageRefs = imagePaths.map(p => `Read the image at: ${p}`).join("\n");
    userMessage = `Here is the content to analyze:\n\n${content}\n\nThe post also includes these images — read and incorporate them into your analysis:\n${imageRefs}`;
  } else if (imagePaths?.length) {
    const imageRefs = imagePaths.map(p => `Read the image at: ${p}`).join("\n");
    userMessage = `The following images are the content to analyze. Read each image, transcribe any text you find, describe the visual content, then run your full analysis.\n\nIMPORTANT: You MUST include the "Source Text:" section in your output with the full transcription of all text from the image(s). This is required for the published page layout.\n\n${imageRefs}`;
  } else {
    userMessage = `Here is the content to analyze:\n\n${content}`;
  }

  if (feedback) {
    userMessage += `\n\nAdditional feedback on the analysis:\n${feedback}`;
  }

  const args = [
    "-p",
    "--system-prompt-file", systemPromptFile,
    "--output-format", "text",
    "--allowedTools", "Read,WebSearch,WebFetch",
  ];

  console.log("Running claude with args:", args);
  console.log(`Prompt length: ${userMessage.length} chars`);
  const markdown = await runClaude(args, repoPath, userMessage);
  console.log(`Claude returned ${markdown.length} chars`);
  const sourceText = extractSourceText(markdown);
  return { markdown, sourceText };
}

/**
 * Download a URL to a temp file in the repo directory.
 * Returns the absolute path. Caller is responsible for cleanup.
 */
export async function downloadToTemp(
  url: string,
  repoPath: string,
  filename: string
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = join(repoPath, `.tmp-${filename}`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

export async function cleanupTempFiles(paths: string[]): Promise<void> {
  for (const p of paths) {
    try { await unlink(p); } catch { /* ignore */ }
  }
}

function extractSourceText(markdown: string): string {
  // Multi-line: Source Text: followed by content until next ## heading
  const multi = markdown.match(/^Source Text:\s*\n([\s\S]*?)(?=\n##\s)/m);
  if (multi) return multi[1].trim();

  // Single-line: Source Text: content on same line
  const single = markdown.match(/^Source Text:\s*(.+)$/m);
  if (single) return single[1].trim();

  return "";
}

function runClaude(args: string[], cwd?: string, stdinData?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile("claude", args, {
      maxBuffer: 10 * 1024 * 1024, // 10MB — analyses with web search can be long
      timeout: 300_000,             // 5 minutes
      cwd,
    }, (error, stdout, stderr) => {
      if (error) {
        console.error("claude stderr:", stderr);
        console.error("claude error:", error.message);
        reject(new Error(`claude CLI failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });

    if (stdinData && proc.stdin) {
      proc.stdin.write(stdinData);
      proc.stdin.end();
    }
  });
}
