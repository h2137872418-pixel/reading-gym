import type {
  AnswerDoc,
  AnswerSentence,
  LocalSentence,
  PassageState,
  SessionDoc,
  SkeletonRow,
  Task,
  TaskPassage,
} from "../types";
import { chunkRanges, chunksOf, normalizeCuts, tokenSpans } from "./text";
import { visibleSkeletonRows } from "./skeleton";

export function emptySentence(
  sentenceId: string,
  index: number,
  span: [number, number],
  text: string,
): LocalSentence {
  return {
    sentence_id: sentenceId,
    index,
    span,
    text,
    chunk_cuts: [],
    chunk_tags: {},
    skeleton_rows: [{ chunkIndex: null, role: "main", text: "" }],
    functions: [],
    references: [],
    evidence: "",
    confidence: null,
    notes: "",
    merged_into: null,
  };
}

export function newSession(task: Task): SessionDoc {
  return {
    date: task.date,
    task_id: task.task_id,
    stage: "segment",
    passages: task.passages.map((p) => ({
      passage_id: p.passage_id,
      cuts: [],
      frozen: false,
      sentences: [],
    })),
    updated_at: new Date().toISOString(),
    version: 0,
    revision_of: null,
    timing: {
      started_at: new Date().toISOString(),
      submitted_at: null,
      reading_minutes: null,
      vocab_minutes: null,
    },
    process: { stuck: "", guessed: "", checked: "", changed: "" },
  };
}

export function freezePassage(state: PassageState, passage: TaskPassage): PassageState {
  const ranges = chunkRanges(passage.text, state.cuts)
    .map((r) => ({
      start: r.start,
      end: r.end,
      text: passage.text.slice(r.start, r.end),
    }))
    .filter((r) => r.text.trim().length > 0);

  return {
    ...state,
    frozen: true,
    sentences: ranges.map((r, i) =>
      emptySentence(`${passage.passage_id}-S${i + 1}`, i + 1, [r.start, r.end], r.text),
    ),
  };
}

export function reconcileSkeleton(sentence: LocalSentence): SkeletonRow[] {
  const previous = new Map<number | null, SkeletonRow>();
  for (const row of sentence.skeleton_rows) previous.set(row.chunkIndex, row);

  const rows: SkeletonRow[] = [
    previous.get(null) ?? { chunkIndex: null, role: "main", text: "" },
  ];

  const tagged = Object.keys(sentence.chunk_tags)
    .map((k) => Number(k))
    .sort((a, b) => a - b);

  for (const index of tagged) {
    const role = sentence.chunk_tags[String(index)];
    const existing = previous.get(index);
    rows.push(
      existing && existing.role === role
        ? existing
        : { chunkIndex: index, role, text: existing?.text ?? "", tokens: existing?.tokens },
    );
  }
  return rows;
}

export function isStarted(sentence: LocalSentence): boolean {
  return (
    sentence.chunk_cuts.length > 0 ||
    Object.keys(sentence.chunk_tags).length > 0 ||
    sentence.skeleton_rows.some((row) => row.text.trim().length > 0)
  );
}

export type Progress = {
  total: number;
  started: number;
  tagged: number;
  blankChunks: number;
  skeletonGaps: number;
};

export function progressOf(session: SessionDoc): Progress {
  const progress: Progress = { total: 0, started: 0, tagged: 0, blankChunks: 0, skeletonGaps: 0 };
  for (const passage of session.passages) {
    for (const sentence of passage.sentences) {
      progress.total += 1;
      if (isStarted(sentence)) progress.started += 1;
      if (Object.keys(sentence.chunk_tags).length > 0) progress.tagged += 1;

      const untagged = sentence.chunk_cuts.length + 1 - Object.keys(sentence.chunk_tags).length;
      if (untagged > 0) progress.blankChunks += 1;

      if (Object.keys(sentence.chunk_tags).length > 0) {
        const rows = visibleSkeletonRows(sentence);
        const filledRows = rows.filter((row) => row.text.trim().length > 0).length;
        if (filledRows < rows.length) progress.skeletonGaps += 1;
      }
    }
  }
  return progress;
}

export function sentenceToAnswer(sentence: LocalSentence): AnswerSentence {
  const cuts = normalizeCuts(sentence.chunk_cuts, sentence.text.length);
  const chunks = chunksOf(sentence.text, cuts);

  const orderedIndexes = Object.keys(sentence.chunk_tags)
    .map(Number)
    .sort((a, b) => a - b);

  const chunkTags: Record<string, string> = {};
  for (const index of orderedIndexes) chunkTags[String(index)] = sentence.chunk_tags[String(index)];

  const clauseTypes: string[] = [];
  for (const index of orderedIndexes) {
    const value = sentence.chunk_tags[String(index)];
    if (!clauseTypes.includes(value)) clauseTypes.push(value);
  }

  const words = tokenSpans(sentence.text);
  const parts = visibleSkeletonRows(sentence)
    .filter((row) => row.text.trim().length > 0)
    .map((row) => {
      const predicate =
        row.predicateToken !== undefined && row.tokens?.includes(row.predicateToken)
          ? words[row.predicateToken]?.text
          : undefined;
      return {
        role: row.role,
        text: row.text.trim(),
        ...(predicate ? { predicate } : {}),
      };
    });

  return {
    sentence_id: sentence.sentence_id,
    index: sentence.index,
    span: sentence.span,
    text: sentence.text,
    chunk_cuts: cuts,
    chunks,
    chunk_tags: chunkTags,
    clause_types: clauseTypes,
    skeleton_parts: parts,
    skeleton: parts.map((p) => p.text).join("; "),
    functions: sentence.functions,
    references: sentence.references,
    evidence: sentence.evidence,
    confidence: sentence.confidence,
    notes: sentence.notes,
    merged_into: sentence.merged_into ?? null,
  };
}

export function toAnswerDoc(session: SessionDoc): AnswerDoc {
  return {
    schema_version: "0.2",
    task_id: session.task_id,
    date: session.date,
    version: Math.max(1, session.version),
    revision_of: session.revision_of,
    passages: session.passages.map((passage) => ({
      passage_id: passage.passage_id,
      sentences: passage.sentences.map(sentenceToAnswer),
    })),
    timing: session.timing,
    process: session.process,
  };
}
