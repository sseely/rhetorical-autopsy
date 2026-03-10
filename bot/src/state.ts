import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface AnalysisState {
  originalPost: string;
  originalImagePaths: string[];
  currentAnalysis: string;
  published: boolean;
}

const STATE_FILE = join(import.meta.dirname, "..", "thread-state.json");

const threads = new Map<string, AnalysisState>();

export async function loadState(): Promise<void> {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    const entries: [string, AnalysisState][] = JSON.parse(raw);
    for (const [k, v] of entries) {
      threads.set(k, v);
    }
    console.log(`Loaded ${threads.size} thread(s) from disk`);
  } catch {
    // No file yet or corrupt — start fresh
    console.log("No existing state file — starting fresh");
  }
}

async function saveState(): Promise<void> {
  const entries = [...threads.entries()];
  await writeFile(STATE_FILE, JSON.stringify(entries, null, 2));
}

export function getThread(threadId: string): AnalysisState | undefined {
  return threads.get(threadId);
}

export async function setThread(threadId: string, state: AnalysisState): Promise<void> {
  threads.set(threadId, state);
  await saveState();
}

export async function updateThread(threadId: string): Promise<void> {
  await saveState();
}
