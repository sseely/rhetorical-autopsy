import { execFile } from "node:child_process";
import { join } from "node:path";

export interface AnalysisResult {
  markdown: string;
}

/**
 * Run the analysis framework via the Claude CLI.
 * Uses `claude -p` (print mode): single prompt in, markdown out, process exits.
 * System prompt is CLAUDE.md at the repo root. Auth uses the CLI's own credentials.
 */
export async function analyzeContent(
  content: string,
  repoPath: string,
  feedback?: string
): Promise<AnalysisResult> {
  const systemPromptFile = join(repoPath, "CLAUDE.md");

  const userMessage = feedback
    ? `Here is the content to analyze:\n\n${content}\n\nAdditional feedback on the analysis:\n${feedback}`
    : `Here is the content to analyze:\n\n${content}`;

  const args = [
    "-p", userMessage,
    "--system-prompt-file", systemPromptFile,
    "--output-format", "text",
    "--allowedTools", "WebSearch,WebFetch",
  ];

  const markdown = await runClaude(args);
  return { markdown };
}

function runClaude(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile("claude", args, {
      maxBuffer: 1024 * 1024, // 1MB — analyses can be long
      timeout: 120_000,       // 2 minutes
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`claude CLI failed: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}
