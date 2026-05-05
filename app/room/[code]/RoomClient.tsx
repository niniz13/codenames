"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import GameBoard from "@/components/GameBoard";
import { validateClue, getRemaining } from "@/lib/codenames";
import {
  getPlayerToken,
  getWebSocketUrl,
  type RoomSnapshot,
  type ServerMessage,
} from "@/lib/room-protocol";

type RoomClientProps = {
  code: string;
};

export default function RoomClient({ code }: RoomClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const socketRef = useRef<WebSocket | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [clueWord, setClueWord] = useState("");
  const [clueCount, setClueCount] = useState("2");
  const [clueError, setClueError] = useState("");
  const [roomClosedMessage, setRoomClosedMessage] = useState("");
  const [connectionLabel, setConnectionLabel] = useState("Connexion a la room...");
  const [playerToken] = useState(() => getPlayerToken());
  const playerName = useMemo(
    () => (searchParams.get("name")?.trim().slice(0, 20) || "Agent").trim(),
    [searchParams],
  );

  useEffect(() => {
    if (!playerToken) {
      return;
    }

    const socket = new WebSocket(getWebSocketUrl());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      setConnectionLabel("Room connectee");
      socket.send(JSON.stringify({ type: "join_room", payload: { code, playerName, playerToken } }));
    });

    socket.addEventListener("close", () => {
      setConnectionLabel("Connexion coupee");
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data) as ServerMessage;

      if (message.type === "room_joined" || message.type === "room_updated") {
        setRoom(message.payload.room);
        return;
      }

      if (message.type === "room_left") {
        router.push("/");
        return;
      }

      if (message.type === "room_closed") {
        setRoomClosedMessage(message.payload.message || "La room a ete fermee par l'admin.");
        return;
      }

      if (message.type === "error") {
        setClueError(message.payload.message);
      }
    });

    return () => {
      socket.close();
    };
  }, [code, playerName, playerToken, router]);

  const sendMessage = (message: object) => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      setClueError("Le serveur WebSocket est indisponible.");
      return false;
    }

    socketRef.current.send(JSON.stringify(message));
    return true;
  };

  const leaveRoomNow = () => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "leave_room" }));
    }
    router.push("/");
  };

  const submitClue = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!room || !room.game) {
      return;
    }

    if (myTeam !== room.game.activeTeam || myRole !== "decider") {
      setClueError("Seul le decideur de l'equipe active peut donner un indice.");
      return;
    }

    const error = validateClue(room.game, clueWord, clueCount);
    if (error) {
      setClueError(error);
      return;
    }

    setClueError("");
    sendMessage({ type: "submit_clue", payload: { word: clueWord, count: clueCount } });
  };

  const normalizedPlayers = useMemo(() => {
    if (!room) {
      return [] as Array<{
        id: string;
        rawId: string | null;
        name: string;
        isOwner: boolean;
        isMe: boolean;
        team: "red" | "blue" | null;
        role: "decider" | "guesser" | null;
      }>;
    }

    return room.players.map((entry, index) => {
      if (typeof entry === "string") {
        return {
          id: `legacy-${index}-${entry}`,
          rawId: null,
          name: entry,
          isOwner: false,
          isMe: false,
          team: null,
          role: null,
        };
      }

      const safeName = entry.name?.trim() || `Agent ${index + 1}`;
      const baseId = entry.id?.trim() || `player-${index}-${safeName}`;

      return {
        id: `${baseId}-${index}`,
        rawId: entry.id ?? null,
        name: safeName,
        isOwner: Boolean(entry.isOwner) || (room.ownerId !== null && entry.id === room.ownerId),
        isMe: entry.id === playerToken,
        team: entry.team ?? null,
        role: entry.role ?? null,
      };
    });
  }, [playerToken, room]);

  const me = normalizedPlayers.find((player) => player.rawId === playerToken) ?? null;
  const myTeam = me?.team ?? null;
  const myRole = me?.role ?? null;
  const isOwner = Boolean(me?.isOwner);
  const redCount = normalizedPlayers.filter((player) => player.team === "red").length;
  const blueCount = normalizedPlayers.filter((player) => player.team === "blue").length;
  const redTeamPlayers = normalizedPlayers.filter((player) => player.team === "red");
  const blueTeamPlayers = normalizedPlayers.filter((player) => player.team === "blue");
  const unassignedPlayers = normalizedPlayers.filter((player) => player.team === null);
  const assignedCount = redCount + blueCount;
  const canStartGame = redCount === 2 && blueCount === 2;
  const activeRole = room?.game?.phase === "clue" ? "decider" : room?.game?.phase === "guess" ? "guesser" : null;
  const canSubmitClue = Boolean(
    room?.game &&
      room.game.phase === "clue" &&
      myTeam === room.game.activeTeam &&
      myRole === "decider",
  );
  const canGuess = Boolean(
    room?.game &&
      room.game.phase === "guess" &&
      myTeam === room.game.activeTeam &&
      myRole === "guesser",
  );
  const remaining = room?.game ? getRemaining(room.game.cards) : { red: 0, blue: 0, neutral: 0 };

  const closureModal = roomClosedMessage ? (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="room-closed-title">
      <section className="modal-card room-closed-modal">
        <h2 id="room-closed-title">Room fermee</h2>
        <p>{roomClosedMessage}</p>
        <div className="modal-actions">
          <button className="btn btn-primary" type="button" onClick={() => router.push("/")}>
            Retour accueil
          </button>
        </div>
      </section>
    </div>
  ) : null;

  if (!room) {
    return (
      <>
        <main className="room-loading-shell">
          <section className="landing-card room-loading-card">
            <p className="landing-kicker">Room {code}</p>
            <h1>Connexion en cours</h1>
            <p>{connectionLabel}</p>
            <Link className="btn btn-soft" href="/">
              Retour accueil
            </Link>
          </section>
        </main>
        {closureModal}
      </>
    );
  }

  if (!room.isStarted || !room.game) {
    return (
      <>
        <main className="room-loading-shell">
          <section className="landing-card lobby-card">
          <p className="landing-kicker">Salle d&apos;attente</p>
          <h1>{room.title}</h1>

          <div className="lobby-widgets">
            <article className="lobby-widget">
              <span>Code room</span>
              <strong>{room.code}</strong>
            </article>
            <article className="lobby-widget">
              <span>Visibilite</span>
              <strong>{room.isPublic ? "Publique" : "Privee"}</strong>
            </article>
            <article className="lobby-widget">
              <span>Admin</span>
              <strong>{normalizedPlayers.find((player) => player.isOwner)?.name ?? "En attente"}</strong>
            </article>
            <article className="lobby-widget">
              <span>Composition</span>
              <strong>{assignedCount}/4 assignes</strong>
            </article>
          </div>

          <div className="lobby-layout">
            <section className="lobby-teams">
              <article className="team-column team-column-red">
                <header>
                  <p>Equipe Rouge</p>
                  <strong>{redCount}/2</strong>
                </header>
                <ul className="team-player-list">
                  {redTeamPlayers.map((player) => (
                    <li key={player.id} className={player.isMe ? "team-player is-me" : "team-player"}>
                      <span>
                        {player.name}
                        {player.isOwner ? <em className="admin-badge">Admin</em> : null}
                        {player.role ? (
                          <em className="role-badge">{player.role === "decider" ? "Decideur" : "Devineur"}</em>
                        ) : null}
                      </span>
                    </li>
                  ))}
                  {Array.from({ length: Math.max(0, 2 - redTeamPlayers.length) }).map((_, index) => (
                    <li key={`red-empty-${index}`} className="team-player team-empty">Place libre</li>
                  ))}
                </ul>
              </article>

              <article className="team-column team-column-blue">
                <header>
                  <p>Equipe Bleue</p>
                  <strong>{blueCount}/2</strong>
                </header>
                <ul className="team-player-list">
                  {blueTeamPlayers.map((player) => (
                    <li key={player.id} className={player.isMe ? "team-player is-me" : "team-player"}>
                      <span>
                        {player.name}
                        {player.isOwner ? <em className="admin-badge">Admin</em> : null}
                        {player.role ? (
                          <em className="role-badge">{player.role === "decider" ? "Decideur" : "Devineur"}</em>
                        ) : null}
                      </span>
                    </li>
                  ))}
                  {Array.from({ length: Math.max(0, 2 - blueTeamPlayers.length) }).map((_, index) => (
                    <li key={`blue-empty-${index}`} className="team-player team-empty">Place libre</li>
                  ))}
                </ul>
              </article>

              <article className="lobby-panel lobby-unassigned">
                <p className="card-kicker">Joueurs en attente</p>
                <h2>Sans equipe</h2>
                {unassignedPlayers.length === 0 ? (
                  <p className="lobby-empty-note">Tous les joueurs ont choisi une equipe.</p>
                ) : (
                  <ul className="lobby-players">
                    {unassignedPlayers.map((player) => (
                      <li key={player.id} className={player.isMe ? "player-item is-me" : "player-item"}>
                        <strong>
                          {player.name}
                          {player.isOwner ? <em className="admin-badge">Admin</em> : null}
                          {player.role ? (
                            <em className="role-badge">{player.role === "decider" ? "Decideur" : "Devineur"}</em>
                          ) : null}
                          <em className="team-badge team-none">Sans equipe</em>
                        </strong>
                        <span>{player.isOwner ? "Chef de room" : "Connecte"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </section>

            <section className="lobby-panel lobby-actions-panel">
              <p className="card-kicker">Statut</p>
              <h2>Controle de room</h2>
              <p className="landing-text lobby-text">
                {isOwner
                  ? "Il faut exactement 2 joueurs rouges et 2 joueurs bleus pour lancer la partie."
                  : "En attente du lancement par l'admin. Il faut une composition 2 rouges / 2 bleus."}
              </p>

              {me ? (
                <p className="eyebrow-label">
                  Ton role: {myRole === "decider" ? "Decideur" : myRole === "guesser" ? "Devineur" : "Non assigne"}
                </p>
              ) : null}

              {me ? (
                <div className="team-picker">
                  <p className="team-picker-label">Choisir ton equipe</p>
                  <div className="team-picker-actions">
                    <button
                      className={`btn team-btn team-btn-red ${me.team === "red" ? "is-active" : ""}`}
                      onClick={() => sendMessage({ type: "set_team", payload: { team: "red" } })}
                      type="button"
                    >
                      Rejoindre Rouge ({redCount}/2)
                    </button>
                    <button
                      className={`btn team-btn team-btn-blue ${me.team === "blue" ? "is-active" : ""}`}
                      onClick={() => sendMessage({ type: "set_team", payload: { team: "blue" } })}
                      type="button"
                    >
                      Rejoindre Bleue ({blueCount}/2)
                    </button>
                  </div>
                </div>
              ) : null}

              <p className="eyebrow-label">{connectionLabel}</p>
              <p className="eyebrow-label">Condition: 4 joueurs minimum, 2 par equipe maximum</p>
              {clueError ? <p className="error-line">{clueError}</p> : null}
              {isOwner ? (
                <button
                  className="btn btn-primary"
                  onClick={() => sendMessage({ type: "start_game" })}
                  type="button"
                  disabled={!canStartGame}
                >
                  Lancer la partie
                </button>
              ) : null}
              <button className="btn btn-soft room-back-btn" type="button" onClick={leaveRoomNow}>
                Retour accueil
              </button>
            </section>
          </div>
          </section>
        </main>
        {closureModal}
      </>
    );
  }

  return (
    <>
      <GameBoard
        game={room.game}
        spymasterMode={myRole === "decider"}
        isDecider={myRole === "decider"}
        canReplay={isOwner}
        clueWord={clueWord}
        clueCount={clueCount}
        clueError={clueError}
        leftSlot={
        <div className="gtc-col">
          <div className="gtc-room-info">
            <span className="gtc-room-code">{room.code}</span>
            <span className="gtc-room-title">{room.title}</span>
          </div>
          <div className="gtc-team-hdr gtc-red">
            <div className="gtc-team-name">
              <span className="gtc-dot" />
              <h2>Équipe Rouge</h2>
            </div>
            {room.game.activeTeam === "red" ? (
              <span className="gtc-active-badge">Tour actif</span>
            ) : null}
          </div>
          <div className="gtc-score gtc-score-red">
            <span>Cartes restantes</span>
            <strong>{remaining.red}</strong>
          </div>
          <div className="gtc-players">
            {redTeamPlayers.length === 0 ? (
              <p className="gtc-empty">Aucun joueur</p>
            ) : redTeamPlayers.map((player) => (
              <div key={player.id} className={`gtc-player ${player.isMe ? "is-me" : ""}`}>
                <span className="gtc-player-name">
                  {player.name}
                  {player.isMe ? <em className="gtc-you"> (vous)</em> : null}
                  {player.isOwner ? <em className="admin-badge"> Admin</em> : null}
                </span>
                <span className={`gtc-role ${player.role === activeRole && room.game?.activeTeam === "red" ? "is-playing" : ""}`}>
                  {player.role === "decider" ? "Décideur" : player.role === "guesser" ? "Devineur" : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      }
      rightSlot={
        <div className="gtc-col">
          <div className="gtc-team-hdr gtc-blue">
            <div className="gtc-team-name">
              <span className="gtc-dot" />
              <h2>Équipe Bleue</h2>
            </div>
            {room.game.activeTeam === "blue" ? (
              <span className="gtc-active-badge">Tour actif</span>
            ) : null}
          </div>
          <div className="gtc-score gtc-score-blue">
            <span>Cartes restantes</span>
            <strong>{remaining.blue}</strong>
          </div>
          <div className="gtc-players">
            {blueTeamPlayers.length === 0 ? (
              <p className="gtc-empty">Aucun joueur</p>
            ) : blueTeamPlayers.map((player) => (
              <div key={player.id} className={`gtc-player ${player.isMe ? "is-me" : ""}`}>
                <span className="gtc-player-name">
                  {player.name}
                  {player.isMe ? <em className="gtc-you"> (vous)</em> : null}
                  {player.isOwner ? <em className="admin-badge"> Admin</em> : null}
                </span>
                <span className={`gtc-role ${player.role === activeRole && room.game?.activeTeam === "blue" ? "is-playing" : ""}`}>
                  {player.role === "decider" ? "Décideur" : player.role === "guesser" ? "Devineur" : "—"}
                </span>
              </div>
            ))}
          </div>
          <div className="gtc-footer">
            <p className="gtc-status">{connectionLabel}</p>
            <button className="btn btn-soft room-back-btn" type="button" onClick={leaveRoomNow}>
              Quitter la room
            </button>
          </div>
        </div>
      }
      canSubmitClue={canSubmitClue}
      canGuess={canGuess}
      onNewGame={() => {
        setClueError("");
        sendMessage({ type: "new_game" });
      }}
      onEndTurn={() => {
        if (!room.game || myTeam !== room.game.activeTeam || myRole !== "guesser") {
          setClueError("Seul le devineur de l'equipe active peut terminer le tour.");
          return;
        }

        sendMessage({ type: "end_turn" });
      }}
      onRevealCard={(index) => {
        if (!room.game || myTeam !== room.game.activeTeam || myRole !== "guesser") {
          setClueError("Seul le devineur de l'equipe active peut choisir une carte.");
          return;
        }

        sendMessage({ type: "reveal_card", payload: { index } });
      }}
      onSubmitClue={submitClue}
        onClueWordChange={setClueWord}
        onClueCountChange={setClueCount}
      />
      {closureModal}
    </>
  );
}