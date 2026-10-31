import { z } from "zod";
import { CLAUSE_TYPES } from "./types";

const clauseType = z.enum(CLAUSE_TYPES);

export const taskPassageSchema = z.object({
  passage_id: z.string().min(1),
  text_id: z.string().min(1),
  text: z.string().min(1),
  target_words: z.array(z.string()).default([]),
  difficulty: z.number().optional(),
  mode: z.string().optional(),
});

export const taskSchema = z.object({
  schema_version: z.string(),
  task_id: z.string().min(1),
  date: z.string().min(1),
  exam_target: z.string().optional(),
  phase: z.string().optional(),
  passages: z.array(taskPassageSchema).min(1),
});

const skeletonPartSchema = z.object({
  role: z.string(),
  text: z.string(),
  predicate: z.string().optional(),
});

export const answerSentenceSchema = z.object({
  sentence_id: z.string().min(1),
  index: z.number(),
  span: z.tuple([z.number(), z.number()]),
  text: z.string(),
  chunk_cuts: z.array(z.number()),
  chunks: z.array(z.string()),
  chunk_tags: z.record(z.string(), clauseType),
  clause_types: z.array(clauseType),
  skeleton_parts: z.array(skeletonPartSchema),
  skeleton: z.string(),
  functions: z.array(z.string()),
  references: z.array(
    z.object({
      pronoun: z.string(),
      antecedent: z.string(),
      type: z.string().optional(),
    }),
  ),
  evidence: z.string(),
  confidence: z.number().nullable(),
  notes: z.string(),
  merged_into: z.string().nullable().optional(),
});

export const answerSchema = z.object({
  schema_version: z.string(),
  task_id: z.string().min(1),
  date: z.string().min(1),
  version: z.number(),
  revision_of: z.number().nullable(),
  passages: z.array(
    z.object({
      passage_id: z.string().min(1),
      sentences: z.array(answerSentenceSchema),
    }),
  ),
  timing: z.object({
    started_at: z.string(),
    submitted_at: z.string().nullable(),
    reading_minutes: z.number().nullable(),
    vocab_minutes: z.number().nullable(),
  }),
  process: z.object({
    stuck: z.string(),
    guessed: z.string(),
    checked: z.string(),
    changed: z.string(),
  }),
});

export const reviewSchema = z.object({
  schema_version: z.string(),
  task_id: z.string().min(1),
  reviewer: z.string().default("reading-coach"),
  reviewed_at: z.string().default(() => new Date().toISOString()),
  sentences: z.array(
    z.object({
      sentence_id: z.string().min(1),
      error_codes: z.array(z.string()).default([]),
      comment: z.string().default(""),
      hint: z.string().default(""),
      drill: z.string().default(""),
      refs: z
        .object({
          chunks: z.array(z.string()).optional(),
          skeleton: z.string().optional(),
        })
        .optional(),
    }),
  ),
  summary: z
    .object({
      top_errors: z.array(z.string()).default([]),
      next_priorities: z.array(z.string()).default([]),
    })
    .default({ top_errors: [], next_priorities: [] }),
});

export function parseTask(raw: unknown) {
  return taskSchema.safeParse(raw);
}
export function parseReview(raw: unknown) {
  return reviewSchema.safeParse(raw);
}
export function validateAnswer(doc: unknown) {
  return answerSchema.safeParse(doc);
}

export function invariants(doc: ReturnType<typeof answerSchema.parse>) {
  const problems: string[] = [];
  for (const passage of doc.passages) {
    for (const sentence of passage.sentences) {
      const joined = sentence.chunks.join("");
      if (joined !== sentence.text) {
        problems.push(`${sentence.sentence_id}: chunks 拼接与原文不符`);
      }
      for (const cut of sentence.chunk_cuts) {
        if (cut <= 0 || cut >= sentence.text.length) {
          problems.push(`${sentence.sentence_id}: 切点 ${cut} 越界`);
        }
      }
    }
  }
  return problems;
}
