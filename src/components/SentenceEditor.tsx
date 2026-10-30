import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChunkLine from "./ChunkLine";
import ClauseBar from "./ClauseBar";
import ReviewCard from "./ReviewCard";
import { depthOf, labelOf, optionsFor, type TreeNode } from "../lib/taxonomy";
import { chunkRanges, gapPositions, tokenSpans } from "../lib/text";
import { defaultTokens, joinTokens, visibleSkeletonRows } from "../lib/skeleton";
import { reconcileSkeleton } from "../lib/session";
import {
  FUNCTION_OPTIONS,
  type AssignedClauseType,
  type LocalSentence,
  type ReviewSentence,
} from "../types";

export type Phase = "segment" | "tag" | "skeleton";

type Props = {
  sentence: LocalSentence;
  siblings: LocalSentence[];
  mode: "simple" | "full";
  phase: Phase;
  onPhase: (phase: Phase) => void;
  review?: ReviewSentence;
  onChange: (patch: Partial<LocalSentence>) => void;
  onNext: () => void;
  onPrev: () => void;
  onSelectSentence: (sentenceId: string) => void;
};

export function initialPhase(sentence: LocalSentence): Phase {
  const hasTags = Object.keys(sentence.chunk_tags).length > 0;
  const hasSkeleton = sentence.skeleton_rows.some((row) => row.text.trim().length > 0);
  if (sentence.chunk_cuts.length === 0 && !hasTags) return "segment";
  if (hasTags || hasSkeleton) return "skeleton";
  return "tag";
}

export default function SentenceEditor({
  sentence,
  siblings,
  mode,
  phase,
  onPhase,
  review,
  onChange,
  onNext,
  onPrev,
  onSelectSentence,
}: Props) {
  const [caretIndex, setCaretIndex] = useState(0);
  const [activeChunk, setActiveChunk] = useState<number | null>(null);
  const [path, setPath] = useState<TreeNode[]>([]);
  const [showContext, setShowContext] = useState(true);
  const [caretVisible, setCaretVisible] = useState(false);
  const [activeRow, setActiveRow] = useState(0);
  const [ctxOverflow, setCtxOverflow] = useState(false);

  const boundaries = useMemo(() => gapPositions(sentence.text), [sentence.text]);
  const chunkCount = useMemo(
    () => chunkRanges(sentence.text, sentence.chunk_cuts).length,
    [sentence.text, sentence.chunk_cuts],
  );
  const chunks = useMemo(
    () => chunkRanges(sentence.text, sentence.chunk_cuts).map((range) => sentence.text.slice(range.start, range.end)),
    [sentence.text, sentence.chunk_cuts],
  );

  const rootRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCaretIndex(0);
    setActiveChunk(null);
    setPath([]);
    setCaretVisible(false);
    setActiveRow(0);
  }, [sentence.sentence_id]);

  useEffect(() => {
    if (phase !== "skeleton") return;
    const missing = sentence.skeleton_rows.some((row) => row.tokens === undefined);
    if (!missing) return;
    const rows = sentence.skeleton_rows.map((row) => {
      if (row.tokens !== undefined) return row;
      const tokens = defaultTokens(sentence, row.chunkIndex);
      return { ...row, tokens, text: joinTokens(sentence.text, tokens), tokensAuto: true };
    });
    onChange({ skeleton_rows: rows });
  }, [phase, sentence, onChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => rootRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [phase, sentence.sentence_id]);

  useEffect(() => {
    if (phase === "tag" && activeChunk === null) setActiveChunk(0);
  }, [phase, activeChunk]);

  useEffect(() => {
    const measure = () => {
      const element = contextRef.current;
      setCtxOverflow(Boolean(element && element.scrollHeight > element.clientHeight + 2));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [sentence.sentence_id, showContext]);

  useEffect(() => {
    if (!showContext) return;
    const container = contextRef.current;
    const current = container?.querySelector<HTMLElement>("[data-current='true']");
    if (!container || !current) return;
    const target = current.offsetTop - container.clientHeight / 2 + current.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [sentence.sentence_id, showContext]);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [phase]);

  const applyTags = useCallback(
    (tags: Record<string, AssignedClauseType>) => {
      const next: LocalSentence = { ...sentence, chunk_tags: tags };
      const rows = reconcileSkeleton(next).map((row) => {
        if (row.chunkIndex !== null || row.tokensAuto === false) return row;
        const tokens = defaultTokens({ ...next, skeleton_rows: [] }, null);
        return { ...row, tokens, text: joinTokens(next.text, tokens) };
      });
      onChange({ chunk_tags: tags, skeleton_rows: rows });
    },
    [onChange, sentence],
  );

  const assign = useCallback(
    (chunkIndex: number, key: AssignedClauseType) => {
      applyTags({ ...sentence.chunk_tags, [String(chunkIndex)]: key });
      setPath([]);
      if (chunkIndex + 1 < chunkCount) {
        setActiveChunk(chunkIndex + 1);
        onPhase("tag");
      } else {
        setActiveChunk(null);
        onPhase("skeleton");
      }
    },
    [applyTags, chunkCount, sentence.chunk_tags],
  );

  const clearChunk = useCallback(
    (chunkIndex: number) => {
      const tags = { ...sentence.chunk_tags };
      delete tags[String(chunkIndex)];
      applyTags(tags);
      setPath([]);
    },
    [applyTags, sentence.chunk_tags],
  );

  const toggleCut = useCallback(
    (at: number) => {
      const nextCuts = sentence.chunk_cuts.includes(at)
        ? sentence.chunk_cuts.filter((cut) => cut !== at)
        : [...sentence.chunk_cuts, at].sort((a, b) => a - b);

      const oldRanges = chunkRanges(sentence.text, sentence.chunk_cuts);
      const tagByStart = new Map<number, AssignedClauseType>();
      const rowByStart = new Map<number, (typeof sentence.skeleton_rows)[number]>();
      oldRanges.forEach((range, i) => {
        const tag = sentence.chunk_tags[String(i)];
        if (tag) tagByStart.set(range.start, tag);
        const row = sentence.skeleton_rows.find((item) => item.chunkIndex === i);
        if (row) rowByStart.set(range.start, row);
      });

      const nextRanges = chunkRanges(sentence.text, nextCuts);
      const tags: Record<string, AssignedClauseType> = {};
      nextRanges.forEach((range, i) => {
        const tag = tagByStart.get(range.start);
        if (tag) tags[String(i)] = tag;
      });

      const rows = [
        sentence.skeleton_rows.find((row) => row.chunkIndex === null) ?? {
          chunkIndex: null,
          role: "main",
          text: "",
        },
      ];
      nextRanges.forEach((range, i) => {
        const tag = tags[String(i)];
        if (!tag) return;
        const previous = rowByStart.get(range.start);
        rows.push({
          chunkIndex: i,
          role: tag,
          text: previous?.text ?? "",
          tokens: previous?.tokens,
          tokensAuto: previous?.tokensAuto,
        });
      });

      onChange({ chunk_cuts: nextCuts, chunk_tags: tags, skeleton_rows: rows });
      const landed = boundaries.indexOf(at);
      if (landed >= 0) setCaretIndex(landed);
      onPhase("segment");
      setActiveChunk(null);
      setPath([]);
    },
    [boundaries, onChange, sentence],
  );

  const pickNode = useCallback(
    (node: TreeNode) => {
      if (activeChunk === null) return;
      if (node.key) {
        assign(activeChunk, node.key);
        return;
      }
      setPath((current) => [...current.slice(0, depthOf(node, current)), node]);
    },
    [activeChunk, assign],
  );

  const moveChunk = useCallback(
    (delta: number) => {
      setActiveChunk((current) => Math.min(chunkCount - 1, Math.max(0, (current ?? 0) + delta)));
      setPath([]);
    },
    [chunkCount],
  );

  const handleRootKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;

      if (event.key === "Tab") {
        if (phase === "skeleton") {
          event.preventDefault();
          setActiveRow((current) =>
            Math.min(
              sentence.skeleton_rows.length - 1,
              Math.max(0, current + (event.shiftKey ? -1 : 1)),
            ),
          );
        }
        return;
      }

      if (phase === "skeleton") {
        if (event.key === "Enter") {
          event.preventDefault();
          onNext();
        }
        return;
      }

      if (phase === "segment") {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setCaretVisible(true);
          setCaretIndex((i) => Math.min(boundaries.length - 1, i + 1));
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setCaretVisible(true);
          setCaretIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          if (event.key === " " && boundaries[caretIndex] !== undefined) {
            setCaretVisible(true);
            toggleCut(boundaries[caretIndex]);
            return;
          }
          if (chunkCount > 0) {
            onPhase("tag");
            setActiveChunk(0);
            setPath([]);
          }
        }
        return;
      }

      if (phase === "tag") {
        if (event.key === "Escape") {
          event.preventDefault();
          if (path.length > 0) setPath((current) => current.slice(0, -1));
          else onPhase("segment");
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          setPath([]);
          onPhase("skeleton");
          return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === " ") {
          event.preventDefault();
          moveChunk(1);
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          moveChunk(-1);
          return;
        }
        if (event.key === "Backspace") {
          event.preventDefault();
          if (activeChunk !== null) clearChunk(activeChunk);
          return;
        }
        if (activeChunk === null) return;
        if (/^[1-9]$/.test(event.key)) {
          event.preventDefault();
          const option = optionsFor(path)[Number(event.key) - 1];
          if (!option) return;
          if (option.key) assign(activeChunk, option.key);
          else setPath((current) => [...current, option]);
        }
      }
    },
    [activeChunk, assign, boundaries, caretIndex, chunkCount, clearChunk, path, moveChunk, phase, toggleCut],
  );

  const toggleToken = (rowIndex: number, tokenIndex: number) => {
    const row = sentence.skeleton_rows[rowIndex];
    const current = row.tokens ?? [];
    const tokens = current.includes(tokenIndex)
      ? current.filter((index) => index !== tokenIndex)
      : [...current, tokenIndex].sort((a, b) => a - b);
    const rows = sentence.skeleton_rows.map((item, i) =>
      i === rowIndex
        ? { ...item, tokens, text: joinTokens(sentence.text, tokens), tokensAuto: false }
        : item,
    );
    onChange({ skeleton_rows: rows });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="context-wrap">
        <div className="row between">
          <span className="sub">全文（点任意一句可跳转）</span>
          <button type="button" className="btn ghost small" onClick={() => setShowContext((value) => !value)}>
            {showContext ? "收起" : "展开"}
          </button>
        </div>
        {showContext && (
          <div className={`context-scroll ${ctxOverflow ? "overflow" : ""}`}>
          <div className="context" ref={contextRef}>
            {siblings.map((item) => (
              <span
                key={item.sentence_id}
                data-current={item.sentence_id === sentence.sentence_id}
                className={`ctx ${item.sentence_id === sentence.sentence_id ? "current" : ""}`}
                onClick={() => onSelectSentence(item.sentence_id)}
              >
                {item.text}
              </span>
            ))}
          </div>
          </div>
        )}
      </div>

      <div ref={rootRef} tabIndex={0} className={`sentence phase-${phase}`} onKeyDown={handleRootKey}>
        <ChunkLine
          text={sentence.text}
          cuts={sentence.chunk_cuts}
          tags={sentence.chunk_tags}
          phase={phase}
          activeChunk={activeChunk}
          caret={phase === "segment" && caretVisible ? (boundaries[caretIndex] ?? null) : null}
          onToggleCut={toggleCut}
          onFocusChunk={(chunkIndex) => {
            setActiveChunk(chunkIndex);
            onPhase("tag");
            setPath([]);
          }}
          onOpenMenu={(chunkIndex) => {
            setActiveChunk(chunkIndex);
            onPhase("tag");
            setPath([]);
          }}
          showTags
          dimOthers={phase === "tag" && activeChunk !== null}
        />
      </div>

      <div className="hint">
        {phase === "segment" && "← → 移动切点，Space 切 / 取消，Enter 进入标类。这里只切句内意群，不会变成新句子——句子边界在冻结前确定。"}
        {phase === "tag" && "在下面的面板里点选，或按 1/2/3 逐级选。Space 跳过当前块，Enter 去写骨架。"}
        {phase === "skeleton" && "点词保留 / 去掉（灰色划线就是删掉的词）。Tab 换下一行，Enter 进入下一句。"}
      </div>

      {phase === "tag" && activeChunk !== null && (
        <ClauseBar
          path={path}
          chunkText={chunks[activeChunk] ?? ""}
          chunkIndex={activeChunk}
          current={sentence.chunk_tags[String(activeChunk)]}
          onPick={pickNode}
          onBack={() => setPath((current) => current.slice(0, -1))}
          onClear={() => clearChunk(activeChunk)}
        />
      )}

      <div className="skeleton">
        {visibleSkeletonRows(sentence).length < sentence.skeleton_rows.length && (
          <div className="sub" style={{ paddingLeft: 106 }}>
            每块都已标为从句，所以没有单独的「主句」行。
          </div>
        )}
        {visibleSkeletonRows(sentence).map((row, rowIndex) => {
          const active = phase === "skeleton" && activeRow === rowIndex;
          return (
            <div
              className={`skel-block ${active ? "on" : ""}`}
              key={`${row.chunkIndex ?? "main"}-${rowIndex}`}
            >
              <div className="skel-row">
                <span className="skel-role">
                  {row.chunkIndex === null ? "主句" : labelOf(row.role as AssignedClauseType)}
                </span>
                {active && <span className="spacer" />}
                {!active && (
                  <button
                    type="button"
                    className="skel-preview"
                    onClick={() => {
                      onPhase("skeleton");
                      setActiveRow(rowIndex);
                    }}
                  >
                    {row.text || (
                      <span className="sub">
                        {row.chunkIndex === null ? "主句的主语 + 谓语" : "这一块谁做什么"}
                      </span>
                    )}
                  </button>
                )}
              </div>

              {active && (
                <div className="token-picker">
                  {tokenSpans(sentence.text).map((token, tokenIndex) => {
                    const on = (row.tokens ?? []).includes(tokenIndex);
                    return (
                      <button
                        key={token.start}
                        type="button"
                        tabIndex={-1}
                        className={`pick ${on ? "" : "off"}`}
                        onClick={() => toggleToken(rowIndex, tokenIndex)}
                      >
                        {token.text}
                      </button>
                    );
                  })}
                </div>
              )}

            </div>
          );
        })}
      </div>

      {mode === "full" && (
        <div className="side">
          <div className="field">
            <label>句子功能</label>
            <div className="chips">
              {FUNCTION_OPTIONS.map((option) => {
                const on = sentence.functions[0] === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`chip ${on ? "on" : ""}`}
                    onClick={() => onChange({ functions: on ? [] : [option.key] })}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="field">
            <label>信心 1-5</label>
            <div className="chips">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`chip ${sentence.confidence === value ? "on" : ""}`}
                  onClick={() => onChange({ confidence: sentence.confidence === value ? null : value })}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>指代 / 连接</label>
            {sentence.references.map((reference, refIndex) => (
              <div className="row" key={refIndex}>
                <input
                  style={{ width: 92 }}
                  value={reference.pronoun}
                  placeholder="it"
                  onChange={(event) => {
                    const references = sentence.references.map((item, i) =>
                      i === refIndex ? { ...item, pronoun: event.target.value } : item,
                    );
                    onChange({ references });
                  }}
                />
                <span className="sub">→</span>
                <input
                  style={{ flex: 1 }}
                  value={reference.antecedent}
                  placeholder="指向什么"
                  onChange={(event) => {
                    const references = sentence.references.map((item, i) =>
                      i === refIndex ? { ...item, antecedent: event.target.value } : item,
                    );
                    onChange({ references });
                  }}
                />
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => onChange({ references: sentence.references.filter((_, i) => i !== refIndex) })}
                >
                  删
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn small"
              onClick={() => onChange({ references: [...sentence.references, { pronoun: "", antecedent: "" }] })}
            >
              加一条
            </button>
          </div>

          <div className="field">
            <label>依据 / 疑问</label>
            <textarea
              value={sentence.evidence}
              onChange={(event) => onChange({ evidence: event.target.value })}
              placeholder="为什么这么切 / 哪里不确定"
            />
          </div>
        </div>
      )}

      {review && (
        <ReviewCard sentence={sentence} review={review} onStateChange={(state) => onChange({ review_state: state })} />
      )}

      <div className="row">
        <button type="button" className="btn" onClick={onPrev}>
          上一句
        </button>
        <button type="button" className="btn primary" onClick={onNext}>
          下一句
        </button>
        <span className="spacer" />
        <span className="pill">{chunkCount} 块</span>
        <span className="pill">{Object.keys(sentence.chunk_tags).length} 已标</span>
      </div>
    </div>
  );
}
