import { readFileSync } from "node:fs";
import { invariants, parseReview, parseTask, validateAnswer } from "../src/schema";
import { freezePassage, newSession, progressOf, reconcileSkeleton, sentenceToAnswer, toAnswerDoc } from "../src/lib/session";
import { visibleSkeletonRows } from "../src/lib/skeleton";
import { chunkRanges, chunksOf, gapPositions, normalizeProse, toggleCut } from "../src/lib/text";
import { answerToMarkdown } from "../src/lib/export";
import type { LocalSentence, Task } from "../src/types";

let failures = 0;
function check(name: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

const raw = JSON.parse(readFileSync(new URL("../public/samples/task-demo.json", import.meta.url), "utf8"));
const parsed = parseTask(raw);
check("task JSON 通过 schema", parsed.success, parsed.success ? "" : parsed.error.issues);
if (!parsed.success) process.exit(1);
const task = parsed.data as Task;

const session = newSession(task);
check("session 初始化 passage 数", session.passages.length === 2);
check("session 初始未冻结", session.passages.every((passage) => !passage.frozen));

const p1 = task.passages[0];
const pState = session.passages[0];
const gaps = gapPositions(p1.text);
console.log(`  info P1 可切点 ${gaps.length} 个`);

const cuts = [
  p1.text.indexOf("You know them"),
  p1.text.indexOf("Sarcasm is mostly"),
  p1.text.indexOf("For example"),
  p1.text.indexOf("Most frequently"),
].filter((value) => value > 0);

const frozen = freezePassage({ ...pState, cuts }, p1);
check("冻结后句子数 = 切点 + 1", frozen.sentences.length === cuts.length + 1, frozen.sentences.length);
check("句子 id 顺序", frozen.sentences.every((sentence, i) => sentence.sentence_id === `P1-S${i + 1}`));
check("句子文本拼接回原文", frozen.sentences.map((sentence) => sentence.text).join("") === p1.text);
check(
  "span 连续",
  frozen.sentences.every((sentence, i) => {
    const next = frozen.sentences[i + 1];
    return next ? sentence.span[1] === next.span[0] : sentence.span[1] === p1.text.length;
  }),
);

const sentence0 = frozen.sentences[0];
console.log(`  info S1 = ${JSON.stringify(sentence0.text)}`);

const boundaries = gapPositions(sentence0.text);
const cutA = boundaries[0];
const cutB = boundaries[2];
check("S1 至少有两个可切点", cutA !== undefined && cutB !== undefined);

const withCuts: LocalSentence = {
  ...sentence0,
  chunk_cuts: [cutA, cutB].filter((value): value is number => value !== undefined),
};
const chunks = chunksOf(withCuts.text, withCuts.chunk_cuts);
check("chunks 拼接等于原句", chunks.join("") === withCuts.text, chunks);

const tagged: LocalSentence = { ...withCuts, chunk_tags: { "1": "adv-time" } };
const rows = reconcileSkeleton(tagged);
check("骨架行 = 主句 + 已标块", rows.length === 2 && rows[0].chunkIndex === null, rows);

const filled: LocalSentence = {
  ...tagged,
  skeleton_rows: rows.map((row, i) => ({ ...row, text: i === 0 ? "You know them" : "you hear them" })),
};

session.passages[0] = { ...frozen, sentences: [filled, ...frozen.sentences.slice(1)] };

const doc = toAnswerDoc(session);
const validated = validateAnswer(doc);
check("answer 通过 schema", validated.success, validated.success ? "" : validated.error.issues);
if (validated.success) {
  const problems = invariants(validated.data);
  check("answer 不变量通过", problems.length === 0, problems);
  check(
    "clause_types 由块派生",
    JSON.stringify(validated.data.passages[0].sentences[0].clause_types) === JSON.stringify(["adv-time"]),
  );
  check(
    "skeleton 由行拼接",
    validated.data.passages[0].sentences[0].skeleton === "You know them; you hear them",
    validated.data.passages[0].sentences[0].skeleton,
  );
}

const progress = progressOf(session);
check("进度统计", progress.total === frozen.sentences.length, progress);

const markdown = answerToMarkdown(task, doc);
check("markdown 含表头", markdown.includes("| S# | 分块 | 从句类型 | 骨架 |"));
check("markdown 含 / 分隔分块", markdown.includes(" / "));

check("toggleCut 加切点", cutA !== undefined && toggleCut([], cutA, sentence0.text.length).length === 1);
check(
  "toggleCut 去切点",
  cutA !== undefined && toggleCut([cutA], cutA, sentence0.text.length).length === 0,
);
check("chunkRanges 空切点 = 1 块", chunkRanges(sentence0.text, []).length === 1);

const noSentences = parseReview({ schema_version: "0.2", task_id: "X", sentences: [] });
check("review 允许空 sentences 数组", noSentences.success, noSentences.success ? "" : noSentences.error.issues);

const missing = parseReview({ schema_version: "0.2", task_id: "X" });
check("review 缺 sentences 被拒", !missing.success);

const goodReview = parseReview({
  schema_version: "0.2",
  task_id: task.task_id,
  sentences: [{ sentence_id: "P1-S1", error_codes: ["C"], comment: "x" }],
});
check("review 最小可用", goodReview.success, goodReview.success ? "" : goodReview.error.issues);

const oneChunk = frozen.sentences[0];
const legacyRows: LocalSentence = {
  ...oneChunk,
  chunk_cuts: [],
  chunk_tags: { "0": "adv-condition" },
  skeleton_rows: [
    { chunkIndex: null, role: "main", text: oneChunk.text.trim(), tokens: [0, 1, 2] },
    { chunkIndex: 0, role: "adv-condition", text: oneChunk.text.trim(), tokens: [0, 1, 2] },
  ],
};
const visible = visibleSkeletonRows(legacyRows);
check("整句标成从句时隐藏主句行", visible.length === 1 && visible[0].chunkIndex === 0, visible);

const twoChunk: LocalSentence = {
  ...oneChunk,
  chunk_cuts: [gapPositions(oneChunk.text)[0]],
  chunk_tags: { "1": "adv-condition" },
  skeleton_rows: [
    { chunkIndex: null, role: "main", text: "keep", tokens: [0] },
    { chunkIndex: 1, role: "adv-condition", text: "clause", tokens: [1] },
  ],
};
check("仍有未标块时保留主句行", visibleSkeletonRows(twoChunk).length === 2);

const wrapped = "Sarcasm and jazz have\nsomething surprisingly\nin common.\n\nMost frequently,\nsarcasm highlights\nan irritation.\r\n\r\nIf you want to be\nhappier, cut it out.";
const normalized = normalizeProse(wrapped);
check("硬换行合并成一段", normalized.split("\n\n").length === 3, normalized);
check("段内不再有换行", !normalized.split("\n\n").some((block) => block.includes("\n")), normalized);
check("CRLF 归一", !normalized.includes("\r"));
check(
  "多空格压缩",
  normalizeProse("a   b\t\tc") === "a b c",
  normalizeProse("a   b\t\tc"),
);
check(
  "NBSP 与零宽字符清理",
  normalizeProse("a\u00a0b\u200bc") === "a b c",
  JSON.stringify(normalizeProse("a\u00a0b\u200bc")),
);
check("纯空白输入为空", normalizeProse(" \n\n\t ").trim() === "");

const predSentence: LocalSentence = {
  ...oneChunk,
  chunk_cuts: [],
  chunk_tags: {},
  skeleton_rows: [
    {
      chunkIndex: null,
      role: "main",
      text: "Sarcasm and jazz have",
      tokens: [0, 1, 2, 3],
      predicateToken: 3,
    },
  ],
};
const predAnswer = sentenceToAnswer(predSentence);
check("谓语导出到 skeleton_parts", predAnswer.skeleton_parts[0]?.predicate === "have", predAnswer.skeleton_parts);

const noPred: LocalSentence = {
  ...predSentence,
  skeleton_rows: [{ ...predSentence.skeleton_rows[0], predicateToken: undefined }],
};
check("未标谓语时不出 predicate 字段", sentenceToAnswer(noPred).skeleton_parts[0]?.predicate === undefined);

console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
process.exit(failures === 0 ? 0 : 1);
