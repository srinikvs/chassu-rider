import { useEffect, useRef, useState } from "react";
import { Gift, Volume2, VolumeX } from "lucide-react";
import { loadSave } from "./save";
import { GAME_VERSION, type PublicEngine, type UiState } from "./types";

const initial = (): UiState => {
  const s = loadSave();
  return {
    screen: "title",
    distance: 0,
    gifts: 0,
    score: 0,
    best: s.best,
    muted: s.muted,
    newBest: false,
  };
};

function fmt(n: number): string {
  return Math.floor(n).toLocaleString("en-US");
}

export function ChassuGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<PublicEngine | null>(null);
  const [ui, setUi] = useState<UiState>(initial);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let engine: PublicEngine | null = null;
    void import("./engine").then(({ createEngine }) => {
      if (cancelled) return;
      engine = createEngine(canvas, setUi);
      engineRef.current = engine;
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
    <div className="cr-shell">
      <canvas ref={canvasRef} className="cr-canvas" />

      <header className={`cr-hud${play ? "" : " cr-hud-quiet"}`}>
        <div className="cr-brand">
          <span className="cr-wordmark">Chassu Rider</span>
          <span className="cr-ver">v{GAME_VERSION}</span>
        </div>
        {play && (
          <div className="cr-stats">
            <span className="cr-stat">
              <span className="cr-stat-label">Dist</span>
              <span className="cr-stat-value">{fmt(ui.distance)}m</span>
            </span>
            <span className="cr-stat">
              <Gift className="cr-ico" aria-hidden />
              <span className="cr-stat-value">{fmt(ui.gifts)}</span>
            </span>
            <span className="cr-stat cr-stat-muted">
              <span className="cr-stat-label">Best</span>
              <span className="cr-stat-value">{fmt(ui.best)}</span>
            </span>
          </div>
        )}
        <button
          type="button"
          className="cr-icon-btn"
          aria-label={ui.muted ? "Unmute" : "Mute"}
          onClick={() => engineRef.current?.toggleMute()}
        >
          {ui.muted ? <VolumeX className="cr-ico" /> : <Volume2 className="cr-ico" />}
        </button>
      </header>

      {overlay && (
        <div className="cr-veil">
          <div className="cr-card">
            {ui.screen === "title" ? (
              <>
                <p className="cr-kicker">Playadda</p>
                <h1 className="cr-title">Chassu Rider</h1>
                <p className="cr-tag">
                  Endless downhill. Dodge pines, rocks, snowmen and gaps. Scoop gifts
                  before the slope eats you.
                </p>
                {ui.best > 0 && (
                  <p className="cr-best">
                    Best <strong>{fmt(ui.best)}</strong>
                  </p>
                )}
                <button
                  type="button"
                  className="cr-cta"
                  onClick={() => engineRef.current?.start()}
                >
                  Start
                </button>
                <ul className="cr-help">
                  <li>
                    <kbd>A</kbd> <kbd>D</kbd> or arrows steer
                  </li>
                  <li>
                    <kbd>W</kbd> <kbd>Space</kbd> jump
                  </li>
                  <li>Touch: sides steer, center or swipe up jumps</li>
                </ul>
              </>
            ) : (
              <>
                <p className="cr-kicker">{ui.newBest ? "New best" : "Wrecked"}</p>
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
                  <div>
                    <dt>Best</dt>
                    <dd>{fmt(ui.best)}</dd>
                  </div>
                </dl>
                <button
                  type="button"
                  className="cr-cta"
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
