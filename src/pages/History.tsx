import { useEffect, useState } from "react";
import { navigate } from "../App";
import { db } from "../db";
import { progressOf } from "../lib/session";
import type { ReviewDoc, SessionDoc } from "../types";

type Row = { session: SessionDoc; review?: ReviewDoc };

export default function History() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const sessions = await db.listSessions();
      const rowsNext: Row[] = [];
      for (const session of sessions) {
        rowsNext.push({ session, review: await db.getReview(session.task_id) });
      }
      rowsNext.sort((a, b) => (a.session.date < b.session.date ? 1 : -1));
      setRows(rowsNext);
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return null;

  return (
    <>
      <h1>历史</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        本地副本。序号是句子，不是日期；提交过的 session 带版本号。
      </div>

      {rows.length === 0 && <div className="empty">还没有 session。</div>}

      {rows.length > 0 && (
        <div className="card">
          <div className="hist-row sub" style={{ fontWeight: 600 }}>
            <span className="hist-date">日期</span>
            <span style={{ flex: 1 }}>任务</span>
            <span>进度</span>
            <span style={{ width: 92, textAlign: "right" }}>状态</span>
            <span style={{ width: 64 }} />
          </div>
          {rows.map(({ session, review }) => {
            const progress = progressOf(session);
            const errors = review?.sentences.filter((entry) => entry.error_codes.length > 0).length ?? 0;
            const resolved = session.passages
              .flatMap((passage) => passage.sentences)
              .filter((sentence) => sentence.review_state === "resolved").length;
            return (
              <div className="hist-row" key={session.date}>
                <span className="hist-date">{session.date}</span>
                <span style={{ flex: 1 }}>
                  <span className="mono">{session.task_id}</span>
                  <span className="sub" style={{ marginLeft: 8 }}>
                    {session.passages.length} 篇
                  </span>
                </span>
                <span className="sub">
                  {progress.started}/{progress.total} 句
                </span>
                <span style={{ width: 92, textAlign: "right" }}>
                  {review ? (
                    <span className={`pill ${errors - resolved > 0 ? "danger" : "accent"}`}>
                      批改 {errors > 0 ? `${resolved}/${errors}` : "✓"}
                    </span>
                  ) : session.version > 0 ? (
                    <span className="pill warn">v{session.version}</span>
                  ) : (
                    <span className="pill">草稿</span>
                  )}
                </span>
                <span style={{ width: 64, textAlign: "right" }}>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => navigate(`/session/${encodeURIComponent(session.date)}`)}
                  >
                    打开
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {rows.length > 0 && (
        <div className="sub" style={{ marginTop: 16 }}>
          统计与错误趋势属于 v0.2，这里只保留可打开的历史。
        </div>
      )}
    </>
  );
}
