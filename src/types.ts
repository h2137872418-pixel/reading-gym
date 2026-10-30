export const CLAUSE_TYPES = [
  "main",
  "coordinate",
  "nominal-subject",
  "nominal-object",
  "nominal-predicative",
  "nominal-appositive",
  "relative",
  "adv-time",
  "adv-reason",
  "adv-condition",
  "adv-concession",
  "adv-result",
  "adv-purpose",
  "adv-manner",
  "adv-comparison",
  "nonfinite-infinitive",
  "nonfinite-gerund",
  "nonfinite-participle",
  "none",
] as const;

export type ClauseType = (typeof CLAUSE_TYPES)[number];

export type AssignedClauseType = Exclude<ClauseType, "main" | "none">;

export type TaskPassage = {
  passage_id: string;
  text_id: string;
  text: string;
  target_words: string[];
  difficulty?: number;
  mode?: string;
};

export type Task = {
  schema_version: string;
  task_id: string;
  date: string;
  exam_target?: string;
  phase?: string;
  passages: TaskPassage[];
};

export type SkeletonRow = {
  chunkIndex: number | null;
  role: string;
  text: string;
  tokens?: number[];
  tokensAuto?: boolean;
};

export type LocalSentence = {
  sentence_id: string;
  index: number;
  span: [number, number];
  text: string;
  chunk_cuts: number[];
  chunk_tags: Record<string, AssignedClauseType>;
  skeleton_rows: SkeletonRow[];
  functions: string[];
  references: { pronoun: string; antecedent: string; type?: string }[];
  evidence: string;
  confidence: number | null;
  notes: string;
  merged_into?: string | null;
  review_state?: "resolved" | "questioned";
};

export type PassageState = {
  passage_id: string;
  cuts: number[];
  frozen: boolean;
  sentences: LocalSentence[];
};

export type SessionDoc = {
  date: string;
  task_id: string;
  stage: "segment" | "answer";
  passages: PassageState[];
  updated_at: string;
  version: number;
  revision_of: number | null;
  timing: {
    started_at: string;
    submitted_at: string | null;
    reading_minutes: number | null;
    vocab_minutes: number | null;
  };
  process: {
    stuck: string;
    guessed: string;
    checked: string;
    changed: string;
  };
};

export type AnswerSentence = {
  sentence_id: string;
  index: number;
  span: [number, number];
  text: string;
  chunk_cuts: number[];
  chunks: string[];
  chunk_tags: Record<string, string>;
  clause_types: string[];
  skeleton_parts: { role: string; text: string }[];
  skeleton: string;
  functions: string[];
  references: { pronoun: string; antecedent: string; type?: string }[];
  evidence: string;
  confidence: number | null;
  notes: string;
  merged_into?: string | null;
};

export type AnswerDoc = {
  schema_version: string;
  task_id: string;
  date: string;
  version: number;
  revision_of: number | null;
  passages: { passage_id: string; sentences: AnswerSentence[] }[];
  timing: SessionDoc["timing"];
  process: SessionDoc["process"];
};

export type ReviewSentence = {
  sentence_id: string;
  error_codes: string[];
  comment: string;
  hint: string;
  drill: string;
  refs?: { chunks?: string[]; skeleton?: string };
};

export type ReviewDoc = {
  schema_version: string;
  task_id: string;
  reviewer: string;
  reviewed_at: string;
  sentences: ReviewSentence[];
  summary: {
    top_errors: string[];
    next_priorities: string[];
  };
};

export type Settings = {
  mode: "simple" | "full";
  fontSize: number;
  firstSessionDone: boolean;
  installHintDismissed: boolean;
};

export const ERROR_LABELS: Record<string, string> = {
  P: "谓语",
  C: "从句边界",
  S: "骨架",
  M: "修饰语",
  L: "词形词义",
  R: "指代",
  N: "专名",
  T: "术语",
};

export const FUNCTION_OPTIONS = [
  { key: "topic", label: "主题", hint: "这一段在讲什么" },
  { key: "claim", label: "观点", hint: "作者的主张、判断或态度" },
  { key: "definition", label: "定义", hint: "解释一个概念或术语" },
  { key: "support", label: "支撑", hint: "支撑上文观点或主题" },
  { key: "example", label: "举例", hint: "用例子说明" },
  { key: "cause", label: "原因", hint: "解释为什么发生" },
  { key: "effect", label: "结果", hint: "说明影响或后果" },
  { key: "contrast", label: "对比", hint: "对比、转折或反差" },
  { key: "concession", label: "让步", hint: "先承认再转折" },
  { key: "transition", label: "过渡", hint: "承上启下" },
  { key: "conclusion", label: "结论", hint: "总结或收束" },
  { key: "recommendation", label: "建议", hint: "建议、呼吁或行动" },
  { key: "other", label: "其他", hint: "以上都不是，在依据里说明" },
] as const;
