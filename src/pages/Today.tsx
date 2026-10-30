import { useCallback, useEffect, useRef, useState } from "react";
import { navigate } from "../App";
import { useToast } from "../components/Toast";
import { db } from "../db";
import { progressOf } from "../lib/session";
import { parseTask } from "../schema";
import type { ReviewDoc, SessionDoc, Task } from "../types";

type Row = { task: Task; session?: SessionDoc; review?: ReviewDoc };

export default function Today() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const tasks = await db.listTasks();
    const sessions = await db.listSessions();
    const rowsNext: Row[] = [];
    for (const task of tasks) {
      const session = sessions.find((s) => s.date === task.date);
      const review = await db.getReview(task.task_id);
      rowsNext.push({ task, session, review });
    }
    rowsNext.sort((a, b) => (a.task.date < b.task.date ? 1 : -1));
    setRows(rowsNext);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const importTasks = useCallback(
    async (files: File[]) => {
      let imported = 0;
      for (const file of files) {
        try {
          const raw = JSON.parse(await file.text());
          const parsed = parseTask(raw);
          if (!parsed.success) {
            toast({ message: `${file.name}: 不是合法的 task JSON` });
            continue;
          }
          const task = parsed.data as Task;
          await db.putTask(task);
          const existing = await db.getSession(task.date);
          if (!existing) {
            const session: SessionDoc = {
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
            await db.putSession(session);
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
    if (!(await db.getSession(task.date))) {
      await db.putSession({
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
      });
    }
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
          <button type="button" className="btn primary" onClick={() => inputRef.current?.click()}>
            导入 task
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
        把 task JSON 拖到这里，或点右上角导入
      </div>

      {rows.length === 0 && (
        <div className="empty">
          还没有任务。导入 task JSON 开始。
        </div>
      )}

      {rows.map(({ task, session, review }) => {
        const progress = session ? progressOf(session) : null;
        const pct = progress && progress.total > 0 ? Math.round((progress.started / progress.total) * 100) : 0;
        const errors = review?.sentences.filter((s) => s.error_codes.length > 0).length ?? 0;
        return (
          <div className="card task-card" key={task.task_id}>
            <div className="row between">
              <div>
                <div className="title">
                  {task.date} · {task.task_id}
                </div>
                <div className="date">
                  {task.passages.length} 篇 ·{" "}
                  {task.passages.map((p) => `${p.passage_id} ${p.target_words.length} 词`).join(" / ")}
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
    </>
  );
}
