import { useCallback, useEffect, useRef, useState } from "react";
import { navigate } from "../App";
import { Dialog, useToast } from "../components/Toast";
import { db } from "../db";
import { newSession, progressOf } from "../lib/session";
import { normalizeProse } from "../lib/text";
import { parseTask } from "../schema";
import type { ReviewDoc, SessionDoc, Task, TaskPassage } from "../types";

type Row = { task: Task; session?: SessionDoc; review?: ReviewDoc };

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export default function Today() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteDate, setPasteDate] = useState(todayString);
  const [pasteWords, setPasteWords] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const tasks = await db.listTasks();
    const sessions = await db.listSessions();
    const rowsNext: Row[] = [];
    for (const task of tasks) {
      const session = sessions.find((item) => item.date === task.date);
      const review = await db.getReview(task.task_id);
      rowsNext.push({ task, session, review });
    }
    rowsNext.sort((a, b) => (a.task.date < b.task.date ? 1 : -1));
    setRows(rowsNext);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addPassage = useCallback(
    async (date: string, passage: TaskPassage) => {
      const tasks = await db.listTasks();
      const existing = tasks.find((task) => task.date === date);
      let task: Task;

      if (existing) {
        const has = existing.passages.some((item) => item.passage_id === passage.passage_id);
        task = {
          ...existing,
          passages: has
            ? existing.passages.map((item) => (item.passage_id === passage.passage_id ? passage : item))
            : [...existing.passages, passage],
        };
      } else {
        task = {
          schema_version: "0.2",
          task_id: `MOBILE-${date}`,
          date,
          passages: [passage],
        };
      }
      await db.putTask(task);

      const session = await db.getSession(date);
      if (!session) {
        await db.putSession(newSession(task));
      } else if (!session.passages.some((item) => item.passage_id === passage.passage_id)) {
        await db.putSession({
          ...session,
          passages: [
            ...session.passages,
            { passage_id: passage.passage_id, cuts: [], frozen: false, sentences: [] },
          ],
          updated_at: new Date().toISOString(),
        });
      }
      return task;
    },
    [],
  );

  const nextPassageId = useCallback(
    async (date: string) => {
      const tasks = await db.listTasks();
      const existing = tasks.find((task) => task.date === date);
      const used = new Set(existing?.passages.map((item) => item.passage_id) ?? []);
      let index = 1;
      while (used.has(`P${index}`)) index += 1;
      return `P${index}`;
    },
    [],
  );

  const submitPaste = useCallback(async () => {
    const text = normalizeProse(pasteText);
    if (!text) {
      toast({ message: "先粘贴原文" });
      return;
    }
    const date = pasteDate || todayString();
    const passageId = await nextPassageId(date);
    const words = pasteWords
      .split(/[\s,，、;；]+/)
      .map((word) => word.trim())
      .filter(Boolean);

    await addPassage(date, {
      passage_id: passageId,
      text_id: `pasted-${date}-${passageId}`,
      text,
      target_words: words,
      mode: "intensive",
    });

    setPasteOpen(false);
    setPasteText("");
    setPasteWords("");
    await load();
    navigate(`/session/${encodeURIComponent(date)}/${encodeURIComponent(passageId)}`);
  }, [addPassage, load, nextPassageId, pasteDate, pasteText, pasteWords, toast]);

  const importTasks = useCallback(
    async (files: File[]) => {
      let imported = 0;
      for (const file of files) {
        try {
          const parsed = parseTask(JSON.parse(await file.text()));
          if (!parsed.success) {
            toast({ message: `${file.name}: 不是合法的 task JSON` });
            continue;
          }
          const task: Task = {
            ...(parsed.data as Task),
            passages: (parsed.data as Task).passages.map((passage) => ({
              ...passage,
              text: normalizeProse(passage.text),
            })),
          };
          await db.putTask(task);
          const existing = await db.getSession(task.date);
          if (!existing) {
            await db.putSession(newSession(task));
          } else {
            const merged = [...existing.passages];
            for (const passage of task.passages) {
              if (!merged.some((item) => item.passage_id === passage.passage_id)) {
                merged.push({ passage_id: passage.passage_id, cuts: [], frozen: false, sentences: [] });
              }
            }
            await db.putSession({ ...existing, passages: merged, updated_at: new Date().toISOString() });
          }
          imported += 1;
        } catch {
          toast({ message: `${file.name}: 解析失败` });
        }
      }
      await load();
      if (imported > 0) toast({ message: `已导入 ${imported} 个任务` });
    },
    [load, toast],
  );

  const loadDemo = useCallback(async () => {
    const response = await fetch("./samples/task-demo.json");
    const raw = await response.json();
    const parsed = parseTask(raw);
    if (!parsed.success) {
      toast({ message: "示例任务损坏" });
      return;
    }
    const task = parsed.data as Task;
    await db.putTask(task);
    if (!(await db.getSession(task.date))) await db.putSession(newSession(task));
    await load();
    toast({ message: "已载入示例任务" });
  }, [load, toast]);

  return (
    <>
      <div className="row between" style={{ marginBottom: 16 }}>
        <div>
          <h1>今日</h1>
          <div className="sub">任务来自 task JSON；状态仍在 Multica issue，本地只负责作答与批改。</div>
        </div>
        <div className="row">
          {import.meta.env.DEV && (
            <button type="button" className="btn small" onClick={() => void loadDemo()}>
              载入示例
            </button>
          )}
          <button type="button" className="btn small" onClick={() => inputRef.current?.click()}>
            导入 JSON
          </button>
          <button type="button" className="btn primary" onClick={() => setPasteOpen(true)}>
            粘贴原文
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          void importTasks(files);
          event.target.value = "";
        }}
      />

      <div
        className={`dropzone ${dragging ? "over" : ""}`}
        style={{ marginBottom: 18 }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void importTasks(Array.from(event.dataTransfer.files));
        }}
      >
        手机上点「粘贴原文」；电脑上也可以把 task JSON 拖到这里
      </div>

      {rows.length === 0 && <div className="empty">还没有任务。粘贴一段原文就能开始。</div>}

      {rows.map(({ task, session, review }) => {
        const progress = session ? progressOf(session) : null;
        const pct = progress && progress.total > 0 ? Math.round((progress.started / progress.total) * 100) : 0;
        const errors = review?.sentences.filter((item) => item.error_codes.length > 0).length ?? 0;
        return (
          <div className="card task-card" key={task.task_id}>
            <div className="row between">
              <div>
                <div className="title">
                  {task.date} · {task.task_id}
                </div>
                <div className="date">
                  {task.passages.length} 篇 ·{" "}
                  {task.passages.map((item) => `${item.passage_id} ${item.target_words.length} 词`).join(" / ")}
                </div>
              </div>
              <div className="row">
                {review ? (
                  errors > 0 ? (
                    <span className="pill danger">{errors} 处待改</span>
                  ) : (
                    <span className="pill accent">已批改</span>
                  )
                ) : session && session.version > 0 ? (
                  <span className="pill warn">已提交</span>
                ) : session && progress && progress.started > 0 ? (
                  <span className="pill">进行中</span>
                ) : (
                  <span className="pill">未开始</span>
                )}
                <button
                  type="button"
                  className="btn primary small"
                  onClick={() => navigate(`/session/${encodeURIComponent(task.date)}`)}
                >
                  {session && progress && progress.started > 0 ? "继续" : "打开"}
                </button>
              </div>
            </div>
            <div className="progress">
              <i style={{ width: `${pct}%` }} />
            </div>
            <div className="sub">
              {progress
                ? `${progress.started} / ${progress.total} 句已开始 · ${progress.tagged} 句已标类型`
                : "尚未切句"}
            </div>
          </div>
        );
      })}

      {pasteOpen && (
        <Dialog title="粘贴一段原文" onClose={() => setPasteOpen(false)}>
          <div className="field">
            <label>原文</label>
            <textarea
              autoFocus
              rows={9}
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              placeholder="从 issue 或文章里复制粘贴，段间保留空行"
            />
          </div>
          <div className="row" style={{ gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>日期</label>
              <input type="date" value={pasteDate} onChange={(event) => setPasteDate(event.target.value)} />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>目标词（逗号或空格分隔，可留空）</label>
              <input
                value={pasteWords}
                onChange={(event) => setPasteWords(event.target.value)}
                placeholder="sarcasm, hostility"
              />
            </div>
          </div>
          <div className="sub">
            会自动接到当天任务里，编号依次为 P1、P2…；同一天多次粘贴不会覆盖已有内容。
          </div>
          <div className="row">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                try {
                  const text = await navigator.clipboard.readText();
                  if (text) setPasteText(text);
                } catch {
                  toast({ message: "浏览器不允许读剪贴板，手动长按粘贴即可" });
                }
              }}
            >
              从剪贴板读取
            </button>
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setPasteOpen(false)}>
              取消
            </button>
            <button type="button" className="btn primary" onClick={() => void submitPaste()}>
              添加并打开
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
