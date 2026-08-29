import { useEffect } from 'react';
import { useGame } from './useGame';
import { AttentionMeter } from './components/AttentionMeter';
import { Footer } from './components/Footer';
import { OrgChart } from './components/OrgChart';
import { QueuePanel } from './components/QueuePanel';
import { StorePanel } from './components/StorePanel';
import { ThroughputChart } from './components/ThroughputChart';
import { TopBar } from './components/TopBar';
import { WorkButton } from './components/WorkButton';

export function App() {
  const game = useGame();
  const { actions } = game;

  // A — answer the oldest question. The one shortcut worth having.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'a' && e.key !== 'A') return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      actions.answer();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);

  return (
    <div className="app" data-pressure={game.pressure}>
      <TopBar
        state={game.state}
        telemetry={game.telemetry}
        content={game.content}
        pressure={game.pressure}
        span={game.span}
        running={game.running}
        onToggleRunning={actions.toggleRunning}
      />

      <div className="deck">
        <div className="col col--left">
          <StorePanel content={game.content} state={game.state} actions={actions} />
          <WorkButton
            clickRevenue={game.content.clickRevenue}
            showHint={game.telemetry.headcountTotal === 0}
            onWork={actions.work}
          />
        </div>

        <div className="col col--main">
          <AttentionMeter
            telemetry={game.telemetry}
            playerAnswerRate={game.content.playerAnswerRate}
            orgCapacity={game.orgCapacity}
            pressure={game.pressure}
          />
          <OrgChart
            content={game.content}
            state={game.state}
            blockedFraction={game.telemetry.blockedFraction}
            answered={game.state.answered}
          />
          <ThroughputChart history={game.history} answerRate={game.content.playerAnswerRate} />
        </div>

        <QueuePanel
          questions={game.questions}
          hiddenQueue={game.hiddenQueue}
          now={game.state.t}
          onAnswer={actions.answer}
        />
      </div>

      <Footer
        log={game.log}
        t={game.state.t}
        lifetimeCash={game.state.lifetimeCash}
        answered={game.state.answered}
      />
    </div>
  );
}
