import { useEffect, useRef, useState } from "react";
import { Dialog, useToast } from "../components/Toast";
import { clearAll, exportBackup, importBackup, type Backup } from "../db";
import { db } from "../db";
import { downloadJson } from "../lib/export";
import type { Settings } from "../types";

const DEFAULTS: Settings = {
  mode: "simple",
  fontSize: 18,
  firstSessionDone: false,
  installHintDismissed: false,
};

export default function SettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [confirmClear, setConfirmClear] = useState(false);
  const [version, setVersion] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const stored = await db.getSettings();
      if (stored) {
        const { id: _ignored, ...rest } = stored;
        setSettings(rest as Settings);
      }
      const tasks = await db.listTasks();
      const sessions = await db.listSessions();
      setVersion(`${tasks.length} 个任务 / ${sessions.length} 个 session`);
    })();
  }, []);

  const persist = (next: Settings) => {
    setSettings(next);
    void db.putSettings(next);
    document.documentElement.style.setProperty("--reading-size", `${next.fontSize}px`);
  };

  return (
    <>
      <h1>设置</h1>
      <div className="sub" style={{ marginBottom: 18 }}>
        本地优先：数据只存在这台机器的 IndexedDB 里，不上传、不联网。
      </div>

      <div className="card">
        <h2>作答</h2>
        <div className="row" style={{ marginBottom: 12 }}>
          <span style={{ width: 96 }} className="sub">
            默认模式
          </span>
          <div className="chips">
            {(["simple", "full"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`chip ${settings.mode === mode ? "on" : ""}`}
                onClick={() => persist({ ...settings, mode })}
              >
                {mode === "simple" ? "简洁（切块 / 类型 / 骨架）" : "完整（加功能 / 指代 / 依据 / 信心）"}
              </button>
            ))}
          </div>
        </div>
        <div className="row">
          <span style={{ width: 96 }} className="sub">
            正文字号
          </span>
          <input
            type="range"
            min={15}
            max={26}
            value={settings.fontSize}
            onChange={(event) => persist({ ...settings, fontSize: Number(event.target.value) })}
          />
          <span className="mono">{settings.fontSize}px</span>
        </div>
      </div>

      <div className="card">
        <h2>数据</h2>
        <div className="sub" style={{ marginBottom: 12 }}>
          当前本地：{version || "…"}
        </div>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={() =>
              void exportBackup().then((backup) => {
                downloadJson(`reading-gym-backup-${new Date().toISOString().slice(0, 10)}.json`, backup);
                toast({ message: "备份已导出" });
              })
            }
          >
            导出全部备份
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            导入备份
          </button>
          <button type="button" className="btn danger" onClick={() => setConfirmClear(true)}>
            清空本地数据
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            try {
              const backup = JSON.parse(await file.text()) as Backup;
              if (backup.kind !== "reading-gym-backup") {
                toast({ message: "不是备份文件" });
                return;
              }
              await importBackup(backup);
              toast({ message: "备份已恢复" });
            } catch {
              toast({ message: "恢复失败" });
            }
          }}
        />
      </div>

      <div className="card">
        <h2>契约</h2>
        <div className="sub">
          schema_version 0.2 · DB version 1 · 与团队侧的接口以 CONTRACT.md 为准。
        </div>
      </div>

      {confirmClear && (
        <Dialog title="清空本地数据？" onClose={() => setConfirmClear(false)}>
          <div>任务、答案、批改、设置会全部删除。建议先导出一份备份。</div>
          <div className="row">
            <span className="spacer" />
            <button type="button" className="btn" onClick={() => setConfirmClear(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={async () => {
                await clearAll();
                setConfirmClear(false);
                toast({ message: "已清空" });
                setVersion("0 个任务 / 0 个 session");
              }}
            >
              确认清空
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
