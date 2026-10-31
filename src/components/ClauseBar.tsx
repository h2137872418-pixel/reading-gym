import { TREE, labelOf, pathLabel, type TreeNode } from "../lib/taxonomy";
import type { AssignedClauseType } from "../types";

type Props = {
  path: TreeNode[];
  chunkText: string;
  chunkIndex: number;
  current?: AssignedClauseType;
  onPick: (node: TreeNode) => void;
  onBack: () => void;
  onClear: () => void;
  onSkip: () => void;
};

function hintFor(path: TreeNode[]): string {
  if (path.length === 0) {
    return "名词/介词这类普通短语不用标，点「不是从句」直接过；只有整块是句子结构的一部分时才往下选。";
  }
  const first = path[0].label;
  const second = path[1]?.label;
  if (first === "从句" && !second) {
    return "名词性 = 整块当主语 / 宾语 / 表语 / 同位语；定语 = 从句里留一个空位；状语 = 修饰主句或动词。";
  }
  if (first === "从句" && second === "名词性") {
    return "名词性从句不说「修饰」，说它在句子里当什么：主语 / 宾语 / 表语 / 同位语。";
  }
  if (first === "从句" && second === "定语") {
    return "定语从句：修饰前面一个名词，且从句里必须留一个空位（that / which / who 代替了某个成分）。";
  }
  if (first === "从句" && second === "状语") {
    return "状语从句：修饰主句或动词，回答 when / why / if / how / 尽管 / 结果 等问题。";
  }
  if (first === "非谓语") {
    return "非谓语：不定式 / 动名词 / 分词。它们不能在句子里单独当谓语。";
  }
  return "";
}

export default function ClauseBar({
  path,
  chunkText,
  chunkIndex,
  current,
  onPick,
  onBack,
  onClear,
  onSkip,
}: Props) {
  return (
    <div className="clause-bar">
      <div className="clause-head">
        <span className="pill">
          第 {chunkIndex + 1} 块
          <span className="clause-sample">{chunkText.trim()}</span>
        </span>
        {current ? (
          <span className="pill accent">已标：{labelOf(current)}</span>
        ) : (
          <span className="sub">还没标</span>
        )}
        <span className="spacer" />
        {path.length > 0 && (
          <>
            <span className="sub">{pathLabel(path)} ›</span>
            <button type="button" className="btn ghost small" onClick={onBack}>
              上一级
            </button>
          </>
        )}
        <button type="button" className="btn ghost small" onClick={onClear}>
          清除
        </button>
        <button type="button" className="btn small" onClick={onSkip} title="这块不是从句，留空并跳到下一块">
          不是从句（跳过）
        </button>
      </div>

      <div className="clause-row">
        <span className="clause-depth">一级</span>
        {TREE.map((node, index) => (
          <button
            key={node.label}
            type="button"
            className={`chip ${node.key && current === node.key ? "on" : ""}`}
            onClick={() => onPick(node)}
          >
            <span className={`tone-${node.tone}`}>●</span> {node.label}
            {node.children ? " ›" : ""}
            <kbd>{index + 1}</kbd>
          </button>
        ))}
        <button type="button" className="chip muted" onClick={onSkip}>
          不是从句
          <kbd>0</kbd>
        </button>
      </div>

      {path.map((node, depth) => {
        const options = node.children ?? [];
        if (options.length === 0) return null;
        return (
          <div className="clause-row" key={`${node.label}-${depth}`}>
            <span className="clause-depth">{depth === 0 ? "二级" : "三级"}</span>
            {options.map((option, index) => (
              <button
                key={option.label}
                type="button"
                className={`chip ${option.key && current === option.key ? "on" : ""}`}
                onClick={() => onPick(option)}
              >
                {option.label}
                {option.children ? " ›" : ""}
                <kbd>{index + 1}</kbd>
              </button>
            ))}
          </div>
        );
      })}

      <div className="hint clause-hint">{hintFor(path)}</div>
    </div>
  );
}
