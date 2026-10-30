export type Token = { start: number; end: number; text: string };
export type Unit = { start: number; end: number; text: string };
export type Range = { start: number; end: number };

export function tokenSpans(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    tokens.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
  }
  return tokens;
}

export function gapPositions(text: string): number[] {
  const positions = new Set<number>();
  const tokens = tokenSpans(text);
  for (let i = 1; i < tokens.length; i += 1) positions.add(tokens[i].start);

  for (let p = 1; p < text.length; p += 1) {
    const prev = text[p - 1];
    const next = text[p];
    if (/\s/.test(prev) || /\s/.test(next)) continue;
    if (/[.!?;:,]/.test(prev) && /[A-Za-z0-9"'\u201c(]/.test(next)) positions.add(p);
    if (/["\u201d)\]}]/.test(prev) && /[A-Za-z0-9]/.test(next)) positions.add(p);
  }

  return Array.from(positions).sort((a, b) => a - b);
}

export function isWideGap(text: string, at: number): boolean {
  return at > 0 && /\s/.test(text[at - 1]);
}

export function unitsOf(text: string): Unit[] {
  const gaps = gapPositions(text);
  const units: Unit[] = [];
  let prev = 0;
  for (const gap of gaps) {
    if (gap <= prev) continue;
    units.push({ start: prev, end: gap, text: text.slice(prev, gap) });
    prev = gap;
  }
  if (prev < text.length) units.push({ start: prev, end: text.length, text: text.slice(prev) });
  return units;
}

export function normalizeCuts(cuts: number[], length: number): number[] {
  const unique = Array.from(new Set(cuts)).filter((c) => c > 0 && c < length);
  unique.sort((a, b) => a - b);
  return unique;
}

export function chunkRanges(text: string, cuts: number[]): Range[] {
  const valid = normalizeCuts(cuts, text.length);
  const ranges: Range[] = [];
  let prev = 0;
  for (const cut of valid) {
    ranges.push({ start: prev, end: cut });
    prev = cut;
  }
  ranges.push({ start: prev, end: text.length });
  return ranges;
}

export function chunksOf(text: string, cuts: number[]): string[] {
  return chunkRanges(text, cuts).map((range) => text.slice(range.start, range.end));
}

export function toggleCut(cuts: number[], at: number, length: number): number[] {
  const next = cuts.includes(at) ? cuts.filter((cut) => cut !== at) : [...cuts, at];
  return normalizeCuts(next, length);
}

export function wordBoundaries(text: string): number[] {
  return gapPositions(text);
}

export type HighlightPart = { text: string; hit: boolean };

export function highlightWords(text: string, words: string[]): HighlightPart[] {
  const targets = words.filter(Boolean).map(escapeRegExp);
  if (targets.length === 0) return [{ text, hit: false }];
  const re = new RegExp(`\\b(${targets.join("|")})\\w{0,3}\\b`, "gi");
  const parts: HighlightPart[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), hit: false });
    parts.push({ text: match[0], hit: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wordCount(text: string): number {
  return (text.match(/[A-Za-z][A-Za-z'\u2019-]*/g) ?? []).length;
}

export function normalizeProse(raw: string): string {
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\ufeff]/g, " ");

  return cleaned
    .split(/\n\s*\n+/)
    .map((block) =>
      block
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean)
    .join("\n\n");
}
