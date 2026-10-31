import type { AnswerDoc, SessionDoc, Task } from "../types";
import { labelOf, isAssigned } from "./taxonomy";
import { sentenceToAnswer } from "./session";

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadJson(filename: string, data: unknown) {
  downloadBlob(filename, new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
}

export function downloadText(filename: string, text: string) {
  downloadBlob(filename, new Blob([text], { type: "text/markdown;charset=utf-8" }));
}

export function sanitizeFileBase(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[.\s_]+|[.\s_]+$/g, "")
    .slice(0, 140);
}

export function recommendedAnswerName(task: Task | null, doc: AnswerDoc, extension = "json"): string {
  const parts = [doc.date, doc.task_id];
  const textId = task?.passages?.[0]?.text_id;
  if (textId && !doc.task_id.includes(textId)) parts.push(textId);
  parts.push(`v${Math.max(1, doc.version)}`);
  return `${sanitizeFileBase(parts.join("_"))}.${extension}`;
}

export function ensureFileName(name: string, extension = "json"): string {
  const trimmed = name.trim().replace(new RegExp(`\\.${extension}$`, "i"), "");
  const base = sanitizeFileBase(trimmed) || "answer";
  return `${base}.${extension}`;
}

export function answerToMarkdown(task: Task, doc: AnswerDoc): string {
  const lines: string[] = [];
  lines.push(`# Reading Gym 答题 ${doc.date}`);
  lines.push("");
  lines.push(`- Task: ${doc.task_id}`);
  lines.push(`- Version: v${doc.version}`);
  lines.push(`- 导出时间: ${new Date().toLocaleString("zh-CN")}`);
  lines.push("");

  for (const passage of doc.passages) {
    const meta = task.passages.find((p) => p.passage_id === passage.passage_id);
    lines.push(`## ${passage.passage_id}${meta ? ` · ${meta.text_id}` : ""}`);
    lines.push("");
    if (meta && meta.target_words.length > 0) {
      lines.push(`- 目标词: ${meta.target_words.join(", ")}`);
      lines.push("");
    }
    lines.push("| S# | 分块 | 从句类型 | 骨架 | 依据/疑问 | 信心 |");
    lines.push("|---|---|---|---|---|---|");
    for (const sentence of passage.sentences) {
      const chunked = sentence.chunks.join(" / ").trim();
      const types = sentence.clause_types
        .filter(isAssigned)
        .map(labelOf)
        .join("、");
      lines.push(
        `| ${sentence.sentence_id} | ${escapeCell(chunked)} | ${types} | ${escapeCell(
          sentence.skeleton,
        )} | ${escapeCell(sentence.evidence || sentence.notes)} | ${sentence.confidence ?? ""} |`,
      );
    }
    lines.push("");
  }

  const process = doc.process;
  if (process.stuck || process.guessed || process.checked || process.changed) {
    lines.push("## 过程与信心");
    lines.push("");
    if (process.stuck) lines.push(`- 卡在哪里: ${process.stuck}`);
    if (process.guessed) lines.push(`- 猜了什么: ${process.guessed}`);
    if (process.checked) lines.push(`- 查了什么: ${process.checked}`);
    if (process.changed) lines.push(`- 改了什么: ${process.changed}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function sessionToMarkdown(task: Task, session: SessionDoc): string {
  const doc: AnswerDoc = {
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
  return answerToMarkdown(task, doc);
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
