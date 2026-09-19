import { useEffect, useRef, useState } from "react";
import { Gift, Volume2, VolumeX } from "lucide-react";
import { loadSave } from "./save";
import { GAME_VERSION, type PublicEngine, type UiState } from "./types";

const emptyUi = (): UiState => ({
  screen: "title",
  distance: 0,
  gifts: 0,
  score: 0,
  best: 0,
  muted: false,
  newBest: false,
});

function fmt(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

export function ChassuGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PublicEngine | null>(null);
  const [ui, setUi] = useState<UiState>(emptyUi);
  const [engineReady, setEngineReady] = useState(false);

  useEffect(() => {
    const saved = loadSave();
    setUi((u) => ({
      ...u,
      best: Math.max(u.best, saved.best),
      muted: saved.muted,
    }));

    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let engine: PublicEngine | null = null;
    void import("./engine").then(({ createEngine }) => {
      if (cancelled) return;
      engine = createEngine(canvas, setUi);
      engineRef.current = engine;
      setEngineReady(true);
    });
    return () => {
      cancelled = true;
      engine?.destroy();
      engineRef.current = null;
    };
  }, []);

  const play = ui.screen === "play";
  const overlay = ui.screen === "title" || ui.screen === "over";

  return (
    <div className="cr-shell" data-testid="app" data-engine={engineReady ? "ready" : "boot"}>
      <canvas ref={canvasRef} className="cr-canvas" data-testid="board" />

      <header className={`cr-hud${play ? "" : " cr-hud-quiet"}`} data-testid="hud">
        <div className="cr-brand">
          <span className="cr-wordmark">Chassu Rider</span>
          <span className="cr-ver-badge" data-testid="version" aria-label={`Version ${GAME_VERSION}`}>
            v{GAME_VERSION}
          </span>
        </div>
        <div className="cr-stats">
          {play && (
            <>
              <span className="cr-stat">
                <span className="cr-stat-label">Dist</span>
                <span className="cr-stat-value" data-testid="distance">
                  {fmt(ui.distance)}m
                </span>
              </span>
              <span className="cr-stat">
                <Gift className="cr-ico" aria-hidden />
                <span className="cr-stat-value" data-testid="gifts">
                  {fmt(ui.gifts)}
                </span>
              </span>
            </>
          )}
          <span className={`cr-stat${ui.newBest && play ? " cr-stat-hot" : ""}`}>
            <span className="cr-stat-label">Best</span>
            <span className="cr-stat-value" data-testid="best">
              {fmt(ui.best)}
            </span>
          </span>
        </div>
        <button
          type="button"
          className="cr-icon-btn"
          data-testid="mute"
          aria-label={ui.muted ? "Unmute" : "Mute"}
          onClick={() => engineRef.current?.toggleMute()}
        >
          {ui.muted ? <VolumeX className="cr-ico" /> : <Volume2 className="cr-ico" />}
        </button>
      </header>

      {overlay && (
        <div className="cr-veil" data-testid="start-screen">
          <div className="cr-card" data-testid="start-panel">
            {ui.screen === "title" ? (
              <>
                <div className="cr-card-head">
                  <p className="cr-kicker">Playadda</p>
                  <span className="cr-ver-badge" data-testid="start-version" aria-label={`Version ${GAME_VERSION}`}>
                    v{GAME_VERSION}
                  </span>
                </div>
                <h1 className="cr-title">Chassu Rider</h1>
                <p className="cr-tag">
                  Endless downhill. Dodge pines, rocks, snowmen and gaps. Scoop gifts
                  before the slope eats you. Snow squirrels keep the trail lively.
                </p>
                <div className="cr-hi" aria-live="polite">
                  <span className="cr-hi-label">High score</span>
                  <span className="cr-hi-value" data-testid="high-score">
                    {fmt(ui.best)}
                  </span>
                </div>
                <section className="cr-howto" data-testid="howto" aria-labelledby="cr-howto-title">
                  <h2 id="cr-howto-title" className="cr-howto-title">
                    How to play
                  </h2>
                  <ul className="cr-help">
                    <li>
                      <kbd>A</kbd> <kbd>D</kbd> or arrows steer
                    </li>
                    <li>
                      <kbd>W</kbd> <kbd>Space</kbd> jump
                    </li>
                    <li>Touch: sides steer, center or swipe up jumps</li>
                    <li>Dodge trees, rocks, snowmen, snowballs, and gaps</li>
                    <li>Collect gifts — they add to your score</li>
                    <li>Snow squirrels scurry across the slope — they dart away and will not wreck you</li>
                  </ul>
                </section>
                <button
                  type="button"
                  className="cr-cta"
                  data-testid="start"
                  onClick={() => engineRef.current?.start()}
                >
                  Start
                </button>
              </>
            ) : (
              <>
                <div className="cr-card-head">
                  <p className="cr-kicker">{ui.newBest ? "New best" : "Wrecked"}</p>
                  <span className="cr-ver-badge" data-testid="start-version" aria-label={`Version ${GAME_VERSION}`}>
                    v{GAME_VERSION}
                  </span>
                </div>
                <h1 className="cr-title">Run over</h1>
                <dl className="cr-recap">
                  <div>
                    <dt>Distance</dt>
                    <dd>{fmt(ui.distance)}m</dd>
                  </div>
                  <div>
                    <dt>Gifts</dt>
                    <dd>{fmt(ui.gifts)}</dd>
                  </div>
                  <div>
                    <dt>Score</dt>
                    <dd>{fmt(ui.score)}</dd>
                  </div>
                  <div className={ui.newBest ? "cr-recap-hot" : undefined}>
                    <dt>High score</dt>
                    <dd>{fmt(ui.best)}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="cr-cta"
                  data-testid="start"
                  onClick={() => engineRef.current?.restart()}
                >
                  Start
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
