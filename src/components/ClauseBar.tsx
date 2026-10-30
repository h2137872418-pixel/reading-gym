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
};

export default function ClauseBar({ path, chunkText, chunkIndex, current, onPick, onBack, onClear }: Props) {
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
    </div>
  );
}
