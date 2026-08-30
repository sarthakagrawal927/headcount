import type { Question } from '../useGame';
import { fmtInt } from '../format';
import { IconCheck, IconInbox, IconQuestion } from '../icons';

const STALE_AFTER = 8; // in-game seconds before a question starts to smell

export function QueuePanel({
  questions,
  hiddenQueue,
  now,
  onAnswer,
}: {
  questions: Question[];
  hiddenQueue: number;
  now: number;
  onAnswer: (id?: number) => void;
}) {
  return (
    <div className="panel queue">
      <div className="panel__head">
        <span className="panel__title">
          <IconQuestion size={13} />
          Questions for you
        </span>
        <button
          className="btn btn--answer"
          onClick={() => onAnswer()}
          disabled={questions.length === 0}
        >
          <IconCheck size={12} />
          Answer oldest
          <span className="work__key" style={{ marginLeft: 4 }}>
            A
          </span>
        </button>
      </div>

      {questions.length === 0 ? (
        <div className="queue__empty">
          <div>
            <IconInbox size={30} />
            <h3>Nothing is waiting on you</h3>
            <p>
              Workers ask a question whenever the job runs past what the spec says. Hire someone
              and they will. Answering keeps the floor moving.
            </p>
          </div>
        </div>
      ) : (
        <div className="queue__list scroll">
          {questions.map((q) => {
            const wait = Math.max(0, now - q.raisedAt);
            const stale = wait > STALE_AFTER;
            return (
              <article className={`qcard ${stale ? 'qcard--stale' : ''}`} key={q.id}>
                <div className="qcard__meta">
                  <span className="qcard__who">{q.roleName}</span>
                  <span className="qcard__dot" />
                  <span>{q.where}</span>
                  <span className="qcard__wait num">{wait.toFixed(1)}s</span>
                </div>
                <p className="qcard__text">{q.text}</p>
                <div className="qcard__actions">
                  <button className="btn btn--answer" onClick={() => onAnswer(q.id)}>
                    Answer
                  </button>
                </div>
              </article>
            );
          })}

          {hiddenQueue > 0 && (
            <div className="queue__overflow">
              + {fmtInt(hiddenQueue)} more waiting, off screen. They are all blocking someone.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
