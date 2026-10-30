import { useMemo } from "react";
import { chunkRanges, gapPositions, isWideGap } from "../lib/text";
import { labelOf, TONE_OF } from "../lib/taxonomy";
import type { AssignedClauseType } from "../types";

type Props = {
  text: string;
  cuts: number[];
  tags: Record<string, AssignedClauseType>;
  phase: "segment" | "tag" | "skeleton";
  activeChunk: number | null;
  caret: number | null;
  onToggleCut: (at: number) => void;
  onFocusChunk: (index: number) => void;
  onOpenMenu: (index: number) => void;
  showTags: boolean;
  dimOthers?: boolean;
};

export default function ChunkLine({
  text,
  cuts,
  tags,
  phase,
  activeChunk,
  caret,
  onToggleCut,
  onFocusChunk,
  onOpenMenu,
  showTags,
  dimOthers = false,
}: Props) {
  const gaps = useMemo(() => gapPositions(text), [text]);
  const ranges = useMemo(() => chunkRanges(text, cuts), [text, cuts]);

  const pieces = useMemo(() => {
    return ranges.map((range) => {
      const inner = gaps.filter((gap) => gap > range.start && gap < range.end);
      const parts: { start: number; end: number; text: string }[] = [];
      let prev = range.start;
      for (const gap of inner) {
        parts.push({ start: prev, end: gap, text: text.slice(prev, gap) });
        prev = gap;
      }
      if (prev < range.end) parts.push({ start: prev, end: range.end, text: text.slice(prev, range.end) });
      return { range, parts };
    });
  }, [gaps, ranges, text]);

  return (
    <span className="chunkline">
      {pieces.map(({ range, parts }, index) => {
        const tag = tags[String(index)];
        const tone = tag ? TONE_OF[tag] : null;
        const isActive = phase === "tag" && activeChunk === index;
        const classes = ["chunk"];
        if (tag) classes.push("tagged");
        if (isActive) classes.push("active");
        if (dimOthers && !isActive) classes.push("dim");


        return (
          <span key={`${range.start}-${index}`}>
            <span
              className={classes.join(" ")}
              onMouseDown={(event) => {
                if (phase === "tag") {
                  event.preventDefault();
                  onFocusChunk(index);
                }
              }}
            >
              {parts.map((part, partIndex) => (
                <span key={part.start}>
                  {partIndex > 0 && (
                    <button
                      type="button"
                      tabIndex={-1}
                      className={`gap ${isWideGap(text, part.start) ? "wide" : "tight"} ${
                        phase === "segment" && caret === part.start ? "caret" : ""
                      }`}
                      aria-label="加入切点"
                      onMouseDown={(event) => {
                        if (phase === "tag") return;
                        event.preventDefault();
                        onToggleCut(part.start);
                      }}
                    />
                  )}
                  <span className="tok">{part.text.replace(/\s+$/, "")}</span>
                </span>
              ))}
              {showTags && tag && (
                <button
                  type="button"
                  className={`chunk-tag ${tone ? `tone-${tone}` : ""}`}
                  tabIndex={-1}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onOpenMenu(index);
                  }}
                >
                  {labelOf(tag)}
                </button>
              )}
            </span>
            {index < pieces.length - 1 && (
              <button
                type="button"
                tabIndex={-1}
                className={`gap cut ${isWideGap(text, range.end) ? "wide" : "tight"} ${
                  phase === "segment" && caret === range.end ? "caret" : ""
                }`}
                aria-label="移除切点"
                onMouseDown={(event) => {
                  if (phase === "tag") return;
                  event.preventDefault();
                  onToggleCut(range.end);
                }}
              >
                <span className="mark">/</span>
              </button>
            )}
          </span>
        );
      })}
    </span>
  );
}
