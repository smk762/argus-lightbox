import type { ListPhoto } from "./types";

/** Which caption text a word cloud counts. */
export type WordField = "caption" | "tags";

export interface WordCount {
  word: string;
  count: number;
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "was",
  "were",
  "been",
  "being",
  "into",
  "over",
  "under",
  "than",
  "then",
  "her",
  "his",
  "she",
  "they",
  "their",
  "its",
  "also",
  "very",
  "just",
]);

/** Tokens of a written caption. Short words and function words are dropped. */
export function captionWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP.has(word));
}

/** Comma-separated tagger output, one phrase per tag. */
export function tagPhrases(raw: string): string[] {
  return raw
    .split(",")
    .map((tag) => tag.trim().toLowerCase().replace(/_/g, " "))
    .filter((tag) => tag.length > 0);
}

/** Word counts for *photos*, most frequent first. */
export function wordHistogram(photos: ListPhoto[], field: WordField): WordCount[] {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    const tokens = field === "tags" ? tagPhrases(photo.caption.raw_tags) : captionWords(photo.caption.final_caption);
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Histogram as CSV: word, count, and that word's share of all counted tokens. */
export function histogramCsv(rows: WordCount[]): string {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const lines = ["word,count,share"];
  for (const row of rows) {
    const share = total === 0 ? "0" : (row.count / total).toFixed(4);
    lines.push(`${csvCell(row.word)},${row.count},${share}`);
  }
  return `${lines.join("\n")}\n`;
}
