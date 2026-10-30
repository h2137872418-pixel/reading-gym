import { chunkRanges, tokenSpans } from "./text";
import type { LocalSentence, SkeletonRow } from "../types";

export function defaultTokens(sentence: LocalSentence, chunkIndex: number | null): number[] {
  const tokens = tokenSpans(sentence.text);
  const ranges = chunkRanges(sentence.text, sentence.chunk_cuts);

  if (chunkIndex !== null) {
    const range = ranges[chunkIndex];
    if (!range) return tokens.map((_, index) => index);
    return tokens
      .map((token, index) => ({ token, index }))
      .filter(({ token }) => token.start >= range.start && token.start < range.end)
      .map(({ index }) => index);
  }

  const tagged = Object.keys(sentence.chunk_tags).map(Number);
  const clauseRanges = tagged.map((index) => ranges[index]).filter(Boolean);

  return tokens
    .map((token, index) => ({ token, index }))
    .filter(
      ({ token }) =>
        !clauseRanges.some((range) => token.start >= range.start && token.start < range.end),
    )
    .map(({ index }) => index);
}

export function joinTokens(text: string, indices: number[] | undefined): string {
  if (!indices || indices.length === 0) return "";
  const tokens = tokenSpans(text);
  const ordered = [...indices].sort((a, b) => a - b);
  return ordered
    .map((index) => tokens[index]?.text ?? "")
    .filter(Boolean)
    .join(" ");
}

export function visibleSkeletonRows(sentence: LocalSentence): SkeletonRow[] {
  const rows = sentence.skeleton_rows;
  const clauses = rows.filter((row) => row.chunkIndex !== null);
  const main = rows.find((row) => row.chunkIndex === null);
  if (!main) return clauses;

  const chunkCount = chunkRanges(sentence.text, sentence.chunk_cuts).length;
  const taggedCount = Object.keys(sentence.chunk_tags).length;
  const allChunksAreClauses = taggedCount >= chunkCount;
  const mainEmpty = (main.tokens?.length ?? 0) === 0 && main.text.trim().length === 0;

  if (clauses.length > 0 && (allChunksAreClauses || mainEmpty)) return clauses;
  return rows;
}
