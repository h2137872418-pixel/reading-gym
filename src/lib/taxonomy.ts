import type { AssignedClauseType } from "../types";

export type Tone = "coordinate" | "nominal" | "relative" | "adverbial" | "nonfinite";

export type TreeNode = {
  key?: AssignedClauseType;
  label: string;
  tone: Tone;
  children?: TreeNode[];
};

export const TREE: TreeNode[] = [
  {
    label: "从句",
    tone: "relative",
    children: [
      {
        label: "名词性",
        tone: "nominal",
        children: [
          { key: "nominal-subject", label: "主语", tone: "nominal" },
          { key: "nominal-object", label: "宾语", tone: "nominal" },
          { key: "nominal-predicative", label: "表语", tone: "nominal" },
          { key: "nominal-appositive", label: "同位语", tone: "nominal" },
        ],
      },
      { key: "relative", label: "定语", tone: "relative" },
      {
        label: "状语",
        tone: "adverbial",
        children: [
          { key: "adv-time", label: "时间", tone: "adverbial" },
          { key: "adv-reason", label: "原因", tone: "adverbial" },
          { key: "adv-condition", label: "条件", tone: "adverbial" },
          { key: "adv-concession", label: "让步", tone: "adverbial" },
          { key: "adv-result", label: "结果", tone: "adverbial" },
          { key: "adv-purpose", label: "目的", tone: "adverbial" },
          { key: "adv-manner", label: "方式", tone: "adverbial" },
          { key: "adv-comparison", label: "比较", tone: "adverbial" },
        ],
      },
    ],
  },
  {
    label: "非谓语",
    tone: "nonfinite",
    children: [
      { key: "nonfinite-infinitive", label: "不定式", tone: "nonfinite" },
      { key: "nonfinite-gerund", label: "动名词", tone: "nonfinite" },
      { key: "nonfinite-participle", label: "分词", tone: "nonfinite" },
    ],
  },
  { key: "coordinate", label: "并列", tone: "coordinate" },
];

export const SHORT_LABEL: Record<AssignedClauseType, string> = {
  coordinate: "并列",
  "nominal-subject": "名·主",
  "nominal-object": "名·宾",
  "nominal-predicative": "名·表",
  "nominal-appositive": "名·同位",
  relative: "定语",
  "adv-time": "状·时间",
  "adv-reason": "状·原因",
  "adv-condition": "状·条件",
  "adv-concession": "状·让步",
  "adv-result": "状·结果",
  "adv-purpose": "状·目的",
  "adv-manner": "状·方式",
  "adv-comparison": "状·比较",
  "nonfinite-infinitive": "不定式",
  "nonfinite-gerund": "动名词",
  "nonfinite-participle": "分词",
};

export const TONE_OF: Record<AssignedClauseType, Tone> = {
  coordinate: "coordinate",
  "nominal-subject": "nominal",
  "nominal-object": "nominal",
  "nominal-predicative": "nominal",
  "nominal-appositive": "nominal",
  relative: "relative",
  "adv-time": "adverbial",
  "adv-reason": "adverbial",
  "adv-condition": "adverbial",
  "adv-concession": "adverbial",
  "adv-result": "adverbial",
  "adv-purpose": "adverbial",
  "adv-manner": "adverbial",
  "adv-comparison": "adverbial",
  "nonfinite-infinitive": "nonfinite",
  "nonfinite-gerund": "nonfinite",
  "nonfinite-participle": "nonfinite",
};

export function labelOf(key: AssignedClauseType): string {
  return SHORT_LABEL[key] ?? key;
}

export function isAssigned(value: string): value is AssignedClauseType {
  return value in SHORT_LABEL;
}

export function optionsFor(path: TreeNode[]): TreeNode[] {
  if (path.length === 0) return TREE;
  return path[path.length - 1].children ?? [];
}

export function pathLabel(path: TreeNode[]): string {
  return path.map((node) => node.label).join(" › ");
}

export function depthOf(node: TreeNode, path: TreeNode[]): number {
  if (TREE.includes(node)) return 0;
  for (let i = 0; i < path.length; i += 1) {
    if ((path[i].children ?? []).includes(node)) return i + 1;
  }
  return path.length;
}
