import { useMemo, useState } from "react";
import { gapPositions, isWideGap, toggleCut, wordCount } from "../lib/text";

type Props = {
  text: string;
  cuts: number[];
  onChange: (cuts: number[]) => void;
  onFreeze: () => void;
};

export default function Segmenter({ text, cuts, onChange, onFreeze }: Props) {
  const gaps = useMemo(() => gapPositions(text), [text]);
  const [lineBreaks, setLineBreaks] = useState(true);

  const cutSet = useMemo(() => new Set(cuts), [cuts]);
  const sentences = cuts.length + 1;
  const words = wordCount(text);
  const average = sentences > 0 ? Math.round(words / sentences) : 0;

  const pieces = useMemo(() => {
    const out: { start: number; end: number; text: string }[] = [];
    let prev = 0;
    for (const gap of gaps) {
      if (gap <= prev) continue;
      out.push({ start: prev, end: gap, text: text.slice(prev, gap) });
      prev = gap;
    }
    if (prev < text.length) out.push({ start: prev, end: text.length, text: text.slice(prev) });
    return out;
  }, [gaps, text]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row between">
        <div className="row">
          <span className="pill accent">
            {sentences} 句 · {words} 词 · 平均 {average} 词
          </span>
          <label className="sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={lineBreaks}
              onChange={(event) => setLineBreaks(event.target.checked)}
            />
            按句换行
          </label>
        </div>
        <div className="row">
          <button type="button" className="btn ghost small" onClick={() => onChange([])}>
            清空切点
          </button>
          <button type="button" className="btn primary" onClick={onFreeze} disabled={cuts.length === 0}>
            冻结边界
          </button>
        </div>
      </div>

      <div className="hint">
        这一步只决定「这篇有几句话」：点词与词之间加「¶」，再点取消。冻结后每句进入左侧列表，之后在句内再做「分块」——分块不会新增句子。
      </div>

      <div className="sentence" style={{ lineHeight: 2.2 }}>
        {pieces.map((piece, index) => (
          <span key={piece.start}>
            {index > 0 && (
              <>
                <button
                  type="button"
                  className={`gap ${isWideGap(text, piece.start) ? "wide" : "tight"} ${
                    cutSet.has(piece.start) ? "cut" : ""
                  }`}
                  aria-label="句子边界"
                  onClick={() => onChange(toggleCut(cuts, piece.start, text.length))}
                >
                  {cutSet.has(piece.start) && <span className="mark">¶</span>}
                </button>
                {lineBreaks && cutSet.has(piece.start) && <br />}
              </>
            )}
            <span className="tok">{piece.text.replace(/\s+$/, "")}</span>
          </span>
        ))}
      </div>

      <div className="sub">
        切点只落在词与词之间，所以原文不会被改动。关掉「按句换行」可以看整段原始排版。
      </div>
    </div>
  );
}

