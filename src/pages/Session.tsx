import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "../App";
import Segmenter from "../components/Segmenter";
import SentenceEditor, { initialPhase, type Phase } from "../components/SentenceEditor";
import { Dialog, useToast } from "../components/Toast";
import { db } from "../db";
import { downloadJson, downloadText, ensureFileName, recommendedAnswerName, sessionToMarkdown } from "../lib/export";
import { freezePassage, isStarted, progressOf, toAnswerDoc } from "../lib/session";
import { invariants, parseReview, validateAnswer } from "../schema";
import type { LocalSentence, ReviewDoc, SessionDoc, Settings, Task } from "../types";

type SaveState = "idle" | "saving" | "saved";

const WAL_PREFIX = "rg:session:";

function readWal(date: string): SessionDoc | null {
  try {
    const raw = localStorage.getItem(WAL_PREFIX + date);
    return raw ? (JSON.parse(raw) as SessionDoc) : null;
  } catch {
    return null;
  }
}

export default function Session({ date, passageId }: { date: string; passageId?: string }) {
  const toast = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [session, setSession] = useState<SessionDoc | null>(null);
  const [review, setReview] = useState<ReviewDoc | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [passageIndex, setPassageIndex] = useState(0);
  const [sentenceIndex, setSentenceIndex] = useState(0);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [railOpen, setRailOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("segment");
  const [menuOpen, setMenuOpen] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const reviewInput = useRef<HTMLInputElement>(null);
  const latest = useRef<SessionDoc | null>(null);

  const focusSentence = useCallback(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".sentence")?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await db.getSession(date);
      const wal = readWal(date);
      const loaded = wal && (!stored || wal.updated_at >= stored.updated_at) ? wal : stored;
      if (!loaded || cancelled) return;
      if (wal && loaded === wal) void db.putSession(wal);
      const loadedTask = await db.getTask(loaded.task_id);
      const loadedReview = await db.getReview(loaded.task_id);
      const loadedSettings = await db.getSettings();
      if (cancelled) return;
      setSession(loaded);
      setTask(loadedTask ?? null);
      setReview(loadedReview ?? null);
      setSettings(
        loadedSettings ?? {
          mode: "simple",
          fontSize: 18,
          firstSessionDone: false,
          installHintDismissed: false,
        },
      );
      const requested = passageId
        ? loaded.passages.findIndex((passage) => passage.passage_id === passageId)
        : -1;
      const firstOpen = loaded.passages.findIndex(
        (passage) => !passage.frozen || passage.sentences.some((sentence) => !isStarted(sentence)),
      );
      setPassageIndex(requested >= 0 ? requested : firstOpen >= 0 ? firstOpen : 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [date, passageId]);

  useEffect(() => {
    latest.current = session;
    if (!session) return;
    try {
      localStorage.setItem(WAL_PREFIX + session.date, JSON.stringify(session));
    } catch {
      /* quota */
    }
  }, [session]);

  useEffect(() => {
    const flush = () => {
      if (latest.current) void db.putSession(latest.current);
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void db.putSession(session).then(() => setSaveState("saved"));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [session]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.style.setProperty("--reading-size", `${settings.fontSize}px`);
  }, [settings]);

  const taskPassage = task?.passages[passageIndex];
  const passageState = session?.passages[passageIndex];
  const progress = useMemo(() => (session ? progressOf(session) : null), [session]);

  const reviewBySentence = useMemo(() => {
    const map = new Map<string, ReviewDoc["sentences"][number]>();
    for (const entry of review?.sentences ?? []) map.set(entry.sentence_id, entry);
    return map;
  }, [review]);

  const updatePassage = useCallback((index: number, patch: Partial<SessionDoc["passages"][number]>) => {
    setSession((current) => {
      if (!current) return current;
      const passages = current.passages.map((p, i) => (i === index ? { ...p, ...patch } : p));
      return { ...current, passages, updated_at: new Date().toISOString() };
    });
  }, []);

  const updateSentence = useCallback(
    (passageIdx: number, sentenceId: string, patch: Partial<LocalSentence>) => {
      setSession((current) => {
        if (!current) return current;
        const passages = current.passages.map((passage, i) =>
          i !== passageIdx
            ? passage
            : {
                ...passage,
                sentences: passage.sentences.map((sentence) =>
                  sentence.sentence_id === sentenceId ? { ...sentence, ...patch } : sentence,
                ),
              },
        );
        return { ...current, passages, updated_at: new Date().toISOString() };
      });
    },
    [],
  );

  const exportAnswer = useCallback(
    (name?: string, next?: SessionDoc) => {
      const source = next ?? session;
      if (!source) return;
      const doc = toAnswerDoc(source);
      const parsed = validateAnswer(doc);
      if (!parsed.success) {
        toast({ message: `导出校验失败：${parsed.error.issues[0]?.message ?? "schema 不匹配"}` });
        return;
      }
      const problems = invariants(parsed.data);
      if (problems.length > 0) {
        toast({ message: `导出校验失败：${problems[0]}` });
        return;
      }
      const filename = name ? ensureFileName(name) : recommendedAnswerName(task ?? null, parsed.data);
      downloadJson(filename, doc);
      return doc;
    },
    [session, task, toast],
  );

  const openExport = useCallback(() => {
    if (!session) return;
    const doc = toAnswerDoc(session);
    const parsed = validateAnswer(doc);
    if (!parsed.success) {
      toast({ message: `导出校验失败：${parsed.error.issues[0]?.message ?? "schema 不匹配"}` });
      return;
    }
    const problems = invariants(parsed.data);
    if (problems.length > 0) {
      toast({ message: `导出校验失败：${problems[0]}` });
      return;
    }
    setExportName(recommendedAnswerName(task ?? null, parsed.data));
    setExportOpen(true);
  }, [session, task, toast]);

  const submit = useCallback(() => {
    if (!session) return;
    const nextVersion = session.version + 1;
    const next: SessionDoc = {
      ...session,
      version: nextVersion,
      revision_of: session.version > 0 ? session.version : null,
      timing: { ...session.timing, submitted_at: new Date().toISOString() },
      updated_at: new Date().toISOString(),
    };
    setSession(next);
    void db.putSession(next);
    exportAnswer(undefined, next);
    setProcessOpen(false);
    if (settings && !settings.firstSessionDone) {
      const updated = { ...settings, firstSessionDone: true };
      setSettings(updated);
      void db.putSettings(updated);
    }
    toast({ message: `已导出 v${nextVersion}（推荐文件名）；可拖进 shared/answers/，或用「导出 answer」自定义名称` });
  }, [exportAnswer, session, settings, toast]);

  const importReview = useCallback(
    async (file: File) => {
      try {
        const parsed = parseReview(JSON.parse(await file.text()));
        if (!parsed.success) {
          toast({ message: "review JSON 不合法" });
          return;
        }
        const doc = parsed.data as ReviewDoc;
        await db.putReview(doc);
        setReview(doc);
        setOnlyErrors(true);
        toast({ message: `已导入批改：${doc.sentences.length} 条` });
      } catch {
        toast({ message: "review 解析失败" });
      }
    },
    [toast],
  );

  const sentences = passageState?.sentences ?? [];
  const recommendedName = useMemo(() => {
    if (!session) return "answer.json";
    return recommendedAnswerName(task ?? null, toAnswerDoc(session));
  }, [session, task]);
  const evidenceEntries = useMemo(() => {
    if (!session) return [];
    return session.passages.flatMap((passage) =>
      passage.sentences
        .filter((sentence) => sentence.evidence.trim().length > 0)
        .map((sentence) => ({
          passage_id: passage.passage_id,
          sentence_id: sentence.sentence_id,
          text: sentence.text.trim(),
          evidence: sentence.evidence.trim(),
        })),
    );
  }, [session]);
  const visibleSentences = useMemo(() => {
    if (!onlyErrors) return sentences;
    const filtered = sentences.filter((sentence) => {
      const entry = reviewBySentence.get(sentence.sentence_id);
      return entry && entry.error_codes.length > 0;
    });
    return filtered.length > 0 ? filtered : sentences;
  }, [onlyErrors, reviewBySentence, sentences]);

  const activeSentence = sentences[sentenceIndex];

  const activeId = activeSentence?.sentence_id;
  useEffect(() => {
    if (!activeSentence) return;
    setPhase(initialPhase(activeSentence));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const goNext = useCallback(() => {
    if (sentenceIndex + 1 < visibleSentences.length) {
      const nextId = visibleSentences[sentenceIndex + 1].sentence_id;
      const target = sentences.findIndex((s) => s.sentence_id === nextId);
      setSentenceIndex(target >= 0 ? target : sentenceIndex + 1);
      return;
    }
    if (passageIndex + 1 < (session?.passages.length ?? 0)) {
      setPassageIndex(passageIndex + 1);
      setSentenceIndex(0);
    }
  }, [passageIndex, sentenceIndex, sentences, session?.passages.length, visibleSentences]);

  const goPrev = useCallback(() => {
    if (sentenceIndex > 0) {
      setSentenceIndex(sentenceIndex - 1);
      return;
    }
    if (passageIndex > 0) {
      setPassageIndex(passageIndex - 1);
      setSentenceIndex(0);
    }
  }, [passageIndex, sentenceIndex]);

  if (!session) {
    return <div className="empty">找不到 {date} 的 session。<a href="#/">回到今日</a></div>;
  }

  const mode = settings?.mode ?? "simple";
  const errorCount = review?.sentences.filter((entry) => entry.error_codes.length > 0).length ?? 0;
  const resolvedCount = sentences.filter((sentence) => sentence.review_state === "resolved").length;

  return (
    <div className="session">
      <aside className={`rail ${railOpen ? "open" : ""}`}>
        <div className="rail-head">
          <div className="row between">
            <strong>{session.date}</strong>
            <span className="pill mono">{session.task_id}</span>
          </div>
          <button
            type="button"
            className="btn ghost small only-mobile"
            style={{ alignSelf: "flex-start" }}
            onClick={() => setRailOpen(false)}
          >
            关闭目录
          </button>
          <div className="row" style={{ gap: 6 }}>
            {session.passages.map((passage, index) => (
              <button
                key={passage.passage_id}
                type="button"
                className={`tab ${index === passageIndex ? "on" : ""}`}
                onClick={() => {
                  setPassageIndex(index);
                  setSentenceIndex(0);
                }}
              >
                {passage.passage_id}
                {passage.frozen ? "" : " ·"}
              </button>
            ))}
          </div>
          {progress && (
            <>
              <div className="progress">
                <i style={{ width: `${progress.total ? (progress.started / progress.total) * 100 : 0}%` }} />
              </div>
              <div className="sub">
                {progress.started}/{progress.total} 句 · {progress.tagged} 已标
                {progress.skeletonGaps > 0 ? ` · ${progress.skeletonGaps} 句骨架缺行` : ""}
              </div>
            </>
          )}
          {review && (
            <label className="sub" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={onlyErrors}
                onChange={(event) => {
                  setOnlyErrors(event.target.checked);
                  setSentenceIndex(0);
                }}
              />
              只看错句（{errorCount} 处 · 已改 {resolvedCount}）
            </label>
          )}
        </div>

        <div className="rail-list">
          {!passageState?.frozen && <div className="sub" style={{ padding: 12 }}>先切句，冻结后生成句子列表。</div>}
          {passageState?.frozen &&
            visibleSentences.map((sentence) => {
              const target = sentences.findIndex((s) => s.sentence_id === sentence.sentence_id);
              const entry = reviewBySentence.get(sentence.sentence_id);
              const hasError = (entry?.error_codes.length ?? 0) > 0 && sentence.review_state !== "resolved";
              const started =
                sentence.chunk_cuts.length > 0 ||
                Object.keys(sentence.chunk_tags).length > 0 ||
                sentence.skeleton_rows.some((row) => row.text.trim().length > 0);
              return (
                <button
                  key={sentence.sentence_id}
                  type="button"
                  className={`rail-item ${target === sentenceIndex ? "active" : ""} ${started ? "done" : ""}`}
                  onClick={() => {
                    setSentenceIndex(target);
                    setRailOpen(false);
                  }}
                >
                  <span className="idx">{sentence.index}</span>
                  <span className="snip">{sentence.text.trim().slice(0, 90)}</span>
                  {hasError && <span className="dot" />}
                </button>
              );
            })}
        </div>
      </aside>

      <section className="editor">
        <div className="editor-head">
          <div className="head-main">
          <button type="button" className="btn ghost small only-mobile" onClick={() => setRailOpen((open) => !open)}>
            目录
          </button>
          <div>
            <div style={{ fontWeight: 600 }}>
              {passageState?.passage_id} · {taskPassage?.text_id ?? ""}
            </div>
            <div className="sub">
              {taskPassage?.target_words.length ? `目标词：${taskPassage.target_words.join(", ")}` : "无目标词"}
            </div>
          </div>
          <span className="spacer" />
          <div className={`head-actions ${menuOpen ? "open" : ""}`}>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                if (!settings) return;
                const next = { ...settings, mode: settings.mode === "simple" ? ("full" as const) : ("simple" as const) };
                setSettings(next);
                void db.putSettings(next);
              }}
            >
              {mode === "simple" ? "简洁模式" : "完整模式"}
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => reviewInput.current?.click()}
              title="导入 coach 的 review JSON"
            >
              导入批改
            </button>
            <button type="button" className="btn small ghost" onClick={() => setEvidenceOpen(true)}>
              依据汇总
            </button>
            <button type="button" className="btn small" onClick={openExport}>
              导出 answer
            </button>
            {task && (
              <button
                type="button"
                className="btn small ghost"
                onClick={() =>
                  downloadText(recommendedAnswerName(task, toAnswerDoc(session), "md"), sessionToMarkdown(task, session))
                }
              >
                导出 md
              </button>
            )}
            {passageState?.frozen && (
              <button type="button" className="btn small ghost" onClick={() => setResetOpen(true)}>
                重切
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn small head-more"
            aria-label="更多操作"
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          </div>

          {passageState?.frozen && activeSentence && (
            <div className="head-phases">
              <button
                type="button"
                className={`phase ${phase === "segment" ? "on" : ""}`}
                onClick={() => {
                  setPhase("segment");
                  focusSentence();
                }}
              >
                ① 分块
              </button>
              <button
                type="button"
                className={`phase ${phase === "tag" ? "on" : ""}`}
                onClick={() => {
                  setPhase("tag");
                  focusSentence();
                }}
              >
                ② 标类
              </button>
              <button
                type="button"
                className={`phase ${phase === "skeleton" ? "on" : ""}`}
                onClick={() => {
                  setPhase("skeleton");
                  focusSentence();
                }}
              >
                ③ 骨架
              </button>
              <span className="spacer" />
              <span className="pill mono">
                {activeSentence.sentence_id} · {sentences.findIndex((s) => s.sentence_id === activeSentence.sentence_id) + 1}/{sentences.length}
              </span>
            </div>
          )}
        </div>

        <input
          ref={reviewInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importReview(file);
            event.target.value = "";
          }}
        />

        <div className="editor-body">
          {!passageState || !taskPassage ? (
            <div className="empty">这篇 passage 在 session 里不存在。</div>
          ) : !passageState.frozen ? (
            <Segmenter
              text={taskPassage.text}
              cuts={passageState.cuts}
              onChange={(cuts) => updatePassage(passageIndex, { cuts })}
              onFreeze={() => {
                const frozen = freezePassage(passageState, taskPassage);
                updatePassage(passageIndex, frozen);
                setSentenceIndex(0);
                focusSentence();
              }}
            />
          ) : activeSentence ? (
            <SentenceEditor
              key={activeSentence.sentence_id}
              sentence={activeSentence}
              siblings={sentences}
              mode={mode}
              phase={phase}
              onPhase={setPhase}
              review={reviewBySentence.get(activeSentence.sentence_id)}
              onChange={(patch) => updateSentence(passageIndex, activeSentence.sentence_id, patch)}
              onNext={goNext}
              onPrev={goPrev}
              onSelectSentence={(sentenceId) => {
                const target = sentences.findIndex((s) => s.sentence_id === sentenceId);
                if (target >= 0) setSentenceIndex(target);
              }}
            />
          ) : (
            <div className="empty">这篇还没有句子。</div>
          )}
        </div>

        <div className="footer-bar">
          <span className="sub save-state">
            {saveState === "saving" ? "保存中…" : saveState === "saved" ? "已保存到本地" : "本地优先"}
          </span>
          {progress && progress.skeletonGaps > 0 && (
            <span className="pill warn">{progress.skeletonGaps} 句骨架缺行</span>
          )}
          <span className="spacer" />
          <button type="button" className="btn back" onClick={() => navigate("/")}>
            返回今日
          </button>
          <button type="button" className="btn" onClick={() => setProcessOpen(true)}>
            提交 v{session.version + 1}
          </button>
          {passageState?.frozen && activeSentence && (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (phase === "segment") {
                  if (activeSentence.chunk_cuts.length === 0) {
                    toast({ message: "先分词块：点词与词之间加 /" });
                    focusSentence();
                    return;
                  }
                  setPhase("tag");
                  focusSentence();
                  return;
                }
                if (phase === "tag") {
                  setPhase("skeleton");
                  focusSentence();
                  return;
                }
                goNext();
                focusSentence();
              }}
            >
              {phase === "segment" ? "下一步：标类 →" : phase === "tag" ? "下一步：写骨架 →" : "下一句 →"}
            </button>
          )}
        </div>
      </section>

      {exportOpen && (
        <Dialog title="导出 answer JSON" onClose={() => setExportOpen(false)}>
          <div className="sub">
            推荐名称按「日期 + task_id + 首个 text_id + 版本」生成；可以改成「今天 / 补做」等更好认的名字。
          </div>
          <div className="field">
            <label>文件名</label>
            <input value={exportName} onChange={(event) => setExportName(event.target.value)} />
          </div>
          <div className="sub">
            推荐：<span className="mono">{recommendedName}</span>；扩展名会自动补 `.json`。
          </div>
          <div className="row">
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setExportOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (exportAnswer(exportName)) setExportOpen(false);
              }}
            >
              导出
            </button>
          </div>
        </Dialog>
      )}

      {processOpen && (
        <Dialog title="提交前：过程与信心" onClose={() => setProcessOpen(false)}>
          <div className="sub">四行而已，写不写都能提交，但写了周复盘才有料。</div>
          {(
            [
              ["stuck", "卡在哪里"],
              ["guessed", "猜了什么"],
              ["checked", "查了什么"],
              ["changed", "改了什么"],
            ] as const
          ).map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                value={session.process[key]}
                onChange={(event) =>
                  setSession({ ...session, process: { ...session.process, [key]: event.target.value } })
                }
              />
            </div>
          ))}
          <div className="row">
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setProcessOpen(false)}>
              取消
            </button>
            <button type="button" className="btn primary" onClick={submit}>
              提交并导出
            </button>
          </div>
        </Dialog>
      )}

      {evidenceOpen && (
        <Dialog title="全部依据 / 疑问" onClose={() => setEvidenceOpen(false)}>
          <div className="sub">这里是只读汇总，编号按出现顺序；修改请回到对应句子。</div>
          {evidenceEntries.length === 0 ? (
            <div className="sub">还没有填写依据/疑问。每句的输入框只记当前句；这里会把所有已填的按编号汇总。</div>
          ) : (
            <ol style={{ paddingLeft: 20, lineHeight: 1.8 }}>
              {evidenceEntries.map((entry, index) => (
                <li key={entry.sentence_id} style={{ marginBottom: 8 }}>
                  <span className="mono">#{index + 1}</span>{" "}
                  <span className="pill">
                    {entry.passage_id} · {entry.sentence_id}
                  </span>{" "}
                  <span className="sub">
                    {entry.text.slice(0, 60)}
                    {entry.text.length > 60 ? "…" : ""}
                  </span>
                  <div>{entry.evidence}</div>
                </li>
              ))}
            </ol>
          )}
        </Dialog>
      )}

      {resetOpen && (
        <Dialog title="重切本篇？" onClose={() => setResetOpen(false)}>
          <div>
            重切会清空 {passageState?.passage_id} 的全部句子与答案，不可撤销。已经提交的 answer JSON 仍在本地历史里。
          </div>
          <div className="row">
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setResetOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={() => {
                updatePassage(passageIndex, { frozen: false, sentences: [], cuts: [] });
                setSentenceIndex(0);
                setResetOpen(false);
              }}
            >
              清空重切
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

