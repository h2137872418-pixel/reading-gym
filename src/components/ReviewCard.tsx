import { chunksOf } from "../lib/text";
import { isAssigned, labelOf } from "../lib/taxonomy";
import { ERROR_LABELS, type LocalSentence, type ReviewSentence } from "../types";

type Props = {
  sentence: LocalSentence;
  review: ReviewSentence;
  onStateChange: (state: "resolved" | "questioned" | undefined) => void;
};

export default function ReviewCard({ sentence, review, onStateChange }: Props) {
  const state = sentence.review_state;

  if (review.error_codes.length === 0) {
    return (
      <div className="review clean">
        <div className="review-head">
          <span className="pill accent">这句没问题</span>
          {review.comment && <span className="sub">{review.comment}</span>}
        </div>
      </div>
    );
  }

  const myChunks = chunksOf(sentence.text, sentence.chunk_cuts).map((chunk) => chunk.trim()).filter(Boolean);
  const showCompare = Boolean(review.refs?.chunks?.length || review.refs?.skeleton);

  return (
    <div className="review">
      <div className="review-head">
        {review.error_codes.map((code) => (
          <span className="code" key={code} title={ERROR_LABELS[code] ?? code}>
            {code} {ERROR_LABELS[code] ?? ""}
          </span>
        ))}
        <span className="spacer" />
        <button
          type="button"
          className={`btn small ${state === "resolved" ? "primary" : ""}`}
          onClick={() => onStateChange(state === "resolved" ? undefined : "resolved")}
        >
          已改
        </button>
        <button
          type="button"
          className={`btn small ${state === "questioned" ? "primary" : ""}`}
          onClick={() => onStateChange(state === "questioned" ? undefined : "questioned")}
        >
          有疑问
        </button>
      </div>

      {review.comment && <div>{review.comment}</div>}
      {review.hint && <div className="sub">提示：{review.hint}</div>}
      {review.drill && <div className="sub">小练：{review.drill}</div>}

      {showCompare && (
        <div className="compare">
          <div>
            <h4>我的</h4>
            {myChunks.length > 0 ? myChunks.join(" / ") : "（未切块）"}
            {sentence.skeleton_rows.some((row) => row.text.trim()) && (
              <>
                <br />
                <span className="sub">
                  骨架：{sentence.skeleton_rows.map((row) => row.text).filter(Boolean).join("; ")}
                </span>
              </>
            )}
          </div>
          <div>
            <h4>参考</h4>
            {review.refs?.chunks?.length ? review.refs.chunks.join(" / ") : "—"}
            {review.refs?.skeleton && (
              <>
                <br />
                <span className="sub">骨架：{review.refs.skeleton}</span>
              </>
            )}
          </div>
        </div>
      )}

      {Object.keys(sentence.chunk_tags).length > 0 && (
        <div className="sub">
          你标的类型：
          {Object.entries(sentence.chunk_tags)
            .map(([index, tag]) => `第${Number(index) + 1}块 ${isAssigned(tag) ? labelOf(tag) : tag}`)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}
