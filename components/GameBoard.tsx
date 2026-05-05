"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  getCardTone,
  getRemaining,
  TEAM_LABEL,
  type GameState,
} from "@/lib/codenames";

type GameBoardProps = {
  game: GameState;
  spymasterMode?: boolean;
  isDecider?: boolean;
  canReplay?: boolean;
  clueWord: string;
  clueCount: string;
  clueError: string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  canSubmitClue?: boolean;
  canGuess?: boolean;
  onNewGame: () => void;
  onEndTurn: () => void;
  onRevealCard: (index: number) => void;
  onSubmitClue: (event: FormEvent<HTMLFormElement>) => void;
  onClueWordChange: (value: string) => void;
  onClueCountChange: (value: string) => void;
};

export default function GameBoard({
  game,
  spymasterMode = false,
  isDecider = false,
  canReplay = false,
  clueWord,
  clueCount,
  clueError,
  leftSlot,
  rightSlot,
  canSubmitClue = true,
  canGuess = true,
  onNewGame,
  onEndTurn,
  onRevealCard,
  onSubmitClue,
  onClueWordChange,
  onClueCountChange,
}: GameBoardProps) {
  const remaining = getRemaining(game.cards);
  const isMyTurn = canSubmitClue || canGuess;

  // Track which card was just revealed for the flip animation
  const [justRevealedIndex, setJustRevealedIndex] = useState<number | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleRevealCard = (index: number) => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    setJustRevealedIndex(index);
    revealTimerRef.current = setTimeout(() => setJustRevealedIndex(null), 620);
    onRevealCard(index);
  };

  useEffect(() => () => { if (revealTimerRef.current) clearTimeout(revealTimerRef.current); }, []);

  // Key that changes whenever the active team or phase changes — forces turn bar remount → reruns animation
  const turnBarKey = `${game.activeTeam}-${game.phase}`;

  return (
    <main className="game-stage">
      {game.winner ? (
        <div className="winner-overlay">
          <div className="winner-modal">
            <p className="winner-modal-eyebrow">Partie terminée</p>
            <h2 className={`winner-modal-title winner-title-${game.winner}`}>
              {TEAM_LABEL[game.winner]} remporte la victoire !
            </h2>
            <div className="winner-modal-scores">
              <div className="winner-score-chip red-chip">
                <span>Rouge</span>
                <strong>{remaining.red} restantes</strong>
              </div>
              <div className="winner-score-chip blue-chip">
                <span>Bleue</span>
                <strong>{remaining.blue} restantes</strong>
              </div>
            </div>
            {canReplay ? (
              <button className="btn btn-primary winner-modal-btn" onClick={onNewGame} type="button">
                Retour au choix des équipes
              </button>
            ) : (
              <p className="winner-modal-waiting">En attente de l&apos;admin pour relancer la room.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="game-3col">
        <aside className="panel game-col game-col-left">{leftSlot}</aside>

        <div className="game-col-center">
          <div
            key={turnBarKey}
            className={`game-turn-bar game-turn-bar-${game.activeTeam}${
              isMyTurn ? " is-my-turn" : ""
            }`}
          >
            <div className="game-turn-bar-text">
              <span className="game-turn-team-label">{TEAM_LABEL[game.activeTeam]}</span>
              <span className="game-turn-sep">·</span>
              <span className="game-turn-phase-label">
                {game.phase === "clue"
                  ? "Le décideur donne un indice"
                  : "Le devineur choisit une carte"}
              </span>
            </div>
            <div className="game-turn-scores">
              <span className="game-score-chip game-chip-red">{remaining.red}</span>
              <span className="game-score-chip game-chip-blue">{remaining.blue}</span>
            </div>
          </div>

          {game.phase === "guess" && game.clue ? (
            <div key={game.clue.word} className="game-active-clue">
              <span className="game-active-clue-label">Indice</span>
              <strong className="game-active-clue-word">{game.clue.word}</strong>
              <span className="game-active-clue-count">×{game.clue.count}</span>
              <span className="game-active-clue-left">{game.guessesLeft} essai(s) restant(s)</span>
            </div>
          ) : null}

          {game.phase === "clue" ? (
            isDecider ? (
              <form className="game-clue-form" onSubmit={onSubmitClue}>
                <input
                  className="game-clue-input"
                  value={clueWord}
                  onChange={(e) => onClueWordChange(e.target.value)}
                  placeholder="Indice (un seul mot)"
                  maxLength={24}
                  disabled={!canSubmitClue}
                />
                <input
                  className="game-clue-input game-clue-count-input"
                  value={clueCount}
                  onChange={(e) => onClueCountChange(e.target.value)}
                  placeholder="Nbre"
                  inputMode="numeric"
                  disabled={!canSubmitClue}
                />
                <button className="btn btn-primary" type="submit" disabled={!canSubmitClue}>
                  Valider
                </button>
              </form>
            ) : (
              <div className="game-waiting-clue">
                En attente de l&apos;indice du décideur…
              </div>
            )
          ) : null}

          {clueError ? <p className="game-error-line">{clueError}</p> : null}

          <section className="panel grid-panel">
            <div className="cards-grid" role="grid" aria-label="Grille Codenames 5x5">
              {game.cards.map((card, index) => {
                const tone = getCardTone(card, spymasterMode);
                return (
                  <button
                    type="button"
                    key={card.word}
                    className={`word-card tone-${tone} ${card.revealed ? "is-revealed" : ""} ${
                      justRevealedIndex === index ? "just-revealed" : ""
                    }`}
                    onClick={() => handleRevealCard(index)}
                    disabled={game.phase !== "guess" || card.revealed || !canGuess}
                  >
                    <span>{card.word}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {game.phase === "guess" && !game.winner ? (
            <div className="game-board-actions">
              <button className="btn btn-danger" onClick={onEndTurn} type="button" disabled={!canGuess}>
                Passer le tour
              </button>
            </div>
          ) : null}
        </div>

        <aside className="panel game-col game-col-right">{rightSlot}</aside>
      </div>
    </main>
  );
}