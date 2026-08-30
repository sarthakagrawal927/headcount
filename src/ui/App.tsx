import { useEffect } from 'react';
import { useGame } from './useGame';
import { AgentFeed } from './components/AgentFeed';
import { AttentionMeter } from './components/AttentionMeter';
import { Footer } from './components/Footer';
import { OrgChart } from './components/OrgChart';
import { PrestigePanel } from './components/PrestigePanel';
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
          <PrestigePanel
            content={game.content}
            state={game.state}
            ready={game.prestigeReady}
            actions={actions}
          />
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

        {/* Two things want the player's attention, and they are not the same
            kind of thing: the queue is work only a human can do, the feed is
            work an agent already did and a human already approved. Stacking
            them in one column makes the trade visible — the game is changing
            underneath you while you answer. */}
        <div className="col col--right">
          <QueuePanel
            questions={game.questions}
            hiddenQueue={game.hiddenQueue}
            now={game.state.t}
            onAnswer={actions.answer}
          />
          <AgentFeed />
        </div>
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
