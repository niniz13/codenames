"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import {
  getPlayerToken,
  getWebSocketUrl,
  type PublicRoomSummary,
  type ServerMessage,
} from "@/lib/room-protocol";

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export default function LandingClient() {
  const router = useRouter();
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const playerTokenRef = useRef(getPlayerToken());
  const stoppedRef = useRef(false);
  const profileNameRef = useRef("");
  const pendingCreateRef = useRef<{
    title: string;
    isPublic: boolean;
    playerName: string;
    playerToken?: string;
  } | null>(null);
  const [rooms, setRooms] = useState<PublicRoomSummary[]>([]);
  const [profileName, setProfileName] = useState("");
  const [roomTitle, setRoomTitle] = useState("Salon tactique");
  const [roomCode, setRoomCode] = useState("");
  const [isPublicRoom, setIsPublicRoom] = useState(true);
  const [connectionLabel, setConnectionLabel] = useState("Connexion...");
  const [errorMessage, setErrorMessage] = useState("");
  const [joinModalCode, setJoinModalCode] = useState("");
  const [joinModalName, setJoinModalName] = useState("");
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);

  useEffect(() => {
    profileNameRef.current = profileName;
  }, [profileName]);

  useEffect(() => {
    stoppedRef.current = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (stoppedRef.current) {
        return;
      }

      clearReconnectTimer();
      reconnectAttemptsRef.current += 1;
      const backoff = Math.min(2200, 400 + reconnectAttemptsRef.current * 250);
      setConnectionLabel("Reconnexion au serveur room...");

      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, backoff);
    };

    const connect = () => {
      const existingSocket = socketRef.current;
      if (
        existingSocket &&
        (existingSocket.readyState === WebSocket.OPEN || existingSocket.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const socket = new WebSocket(getWebSocketUrl());
      socketRef.current = socket;
      setConnectionLabel("Connexion au serveur room...");

      socket.addEventListener("open", () => {
        reconnectAttemptsRef.current = 0;
        clearReconnectTimer();
        setConnectionLabel("Temps reel actif");
        socket.send(JSON.stringify({ type: "list_rooms" }));

        if (pendingCreateRef.current) {
          socket.send(JSON.stringify({ type: "create_room", payload: pendingCreateRef.current }));
          pendingCreateRef.current = null;
        }
      });

      socket.addEventListener("close", () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }

        if (!stoppedRef.current) {
          scheduleReconnect();
          return;
        }

        setConnectionLabel("Serveur room hors ligne");
      });

      socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data) as ServerMessage;

        if (message.type === "public_rooms") {
          setRooms(message.payload.rooms);
          return;
        }

        if (message.type === "room_joined") {
          router.push(
            `/room/${message.payload.room.code}?name=${encodeURIComponent(profileNameRef.current || "Agent")}`,
          );
          return;
        }

        if (message.type === "error") {
          setErrorMessage(message.payload.message);
        }
      });
    };

    connect();

    return () => {
      stoppedRef.current = true;
      clearReconnectTimer();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [router]);

  const sortedRooms = useMemo(
    () => [...rooms].sort((left, right) => right.updatedAt - left.updatedAt),
    [rooms],
  );

  const openJoinModal = (code: string) => {
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) {
      setErrorMessage("Entre un code de room valide.");
      return;
    }

    setErrorMessage("");
    setJoinModalCode(normalizedCode);
    setJoinModalName(profileNameRef.current);
    setIsJoinModalOpen(true);
  };

  const submitJoinRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedCode = normalizeCode(joinModalCode);
    const trimmedName = joinModalName.trim();

    if (!normalizedCode) {
      setErrorMessage("Entre un code de room valide.");
      return;
    }

    if (!trimmedName) {
      setErrorMessage("Choisis un pseudo pour rejoindre une room.");
      return;
    }

    setProfileName(trimmedName);
    setErrorMessage("");
    setIsJoinModalOpen(false);
    router.push(`/room/${normalizedCode}?name=${encodeURIComponent(trimmedName)}`);
  };

  const createRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!profileName.trim()) {
      setErrorMessage("Choisis un pseudo pour creer une room.");
      return;
    }

    if (!roomTitle.trim()) {
      setErrorMessage("Donne un nom a la room.");
      return;
    }

    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
      pendingCreateRef.current = {
        title: roomTitle.trim(),
        isPublic: isPublicRoom,
        playerName: profileName.trim(),
            playerToken: playerTokenRef.current,
      };
      setErrorMessage("");
      setConnectionLabel("Connexion au serveur room... creation en attente");
      return;
    }

    setErrorMessage("");
    socketRef.current.send(
      JSON.stringify({
        type: "create_room",
        payload: {
          title: roomTitle.trim(),
          isPublic: isPublicRoom,
          playerName: profileName.trim(),
          playerToken: playerTokenRef.current,
        },
      }),
    );
  };

  return (
    <main className="landing-shell">
      <header className="landing-topbar">
        <Link className="brand-mark" href="/">
          <span>C</span>
          <div>
            <strong>Codenames</strong>
            <small>{connectionLabel}</small>
          </div>
        </Link>

        <nav className="landing-nav">
          <a href="#rooms">Rooms publiques</a>
          <a href="#create">Creer</a>
        </nav>
      </header>

      <section className="landing-hero landing-hero-single">
        <div className="landing-copy">
          <p className="landing-kicker">Multijoueur en direct</p>
          <h1>Crée une room, partage un code, lance une partie synchronisée.</h1>
          <p className="landing-text">
            Les salons publics apparaissent automatiquement ici. Les salons prives restent accessibles
            uniquement via leur code.
          </p>

          <div className="hero-stats">
            <article>
              <strong>{sortedRooms.length}</strong>
              <span>rooms publiques</span>
            </article>
            <article>
              <strong>5x5</strong>
              <span>grille synchronisee</span>
            </article>
            <article>
              <strong>WS</strong>
              <span>temps reel</span>
            </article>
          </div>

          <div className="hero-cta-row">
            <a className="btn btn-primary" href="#create">Créer une room</a>
            <a className="btn btn-soft" href="#rooms">Voir les rooms</a>
          </div>
        </div>
      </section>

      <section className="landing-forms" id="create">
        <div className="section-heading">
          <p className="landing-kicker">Démarrage rapide</p>
          <h2>Créer ou rejoindre une room</h2>
        </div>

        <div className="forms-grid">
          <section className="landing-card identity-card">
            <p className="card-kicker">Profil joueur</p>
            <h2>Ton pseudo</h2>
            <label>
              Pseudo
              <input
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                placeholder="Ex: Jeremy"
                maxLength={20}
              />
            </label>
            <p className="landing-helper">Utilise ce pseudo pour creer une room ou pre-remplir la modale de connexion.</p>
          </section>

          <form className="landing-card create-card" id="create" onSubmit={createRoom}>
            <p className="card-kicker">Creation rapide</p>
            <h2>Creer une room</h2>

            <label>
              Nom de la room
              <input
                value={roomTitle}
                onChange={(event) => setRoomTitle(event.target.value)}
                placeholder="Ex: Soiree equipe rouge"
                maxLength={36}
              />
            </label>

            <label className="toggle-row">
              <input
                checked={isPublicRoom}
                onChange={(event) => setIsPublicRoom(event.target.checked)}
                type="checkbox"
              />
              <span>Room publique</span>
            </label>

            <button className="btn btn-primary" type="submit">
              Generer un code
            </button>
          </form>

          <div className="landing-card join-card">
            <p className="card-kicker">Acces direct</p>
            <h2>Rejoindre avec un code</h2>

            <label>
              Code room
              <input
                value={roomCode}
                onChange={(event) => setRoomCode(normalizeCode(event.target.value))}
                placeholder="AB12CD"
                maxLength={6}
              />
            </label>

            <button className="btn btn-soft" onClick={() => openJoinModal(roomCode)} type="button">
              Rejoindre la room
            </button>

            {errorMessage ? <p className="error-line landing-error">{errorMessage}</p> : null}
          </div>
        </div>
      </section>

      <section className="public-rooms" id="rooms">
        <div className="section-heading">
          <p className="landing-kicker">Rooms visibles</p>
          <h2>Rooms publiques en cours</h2>
        </div>

        <div className="rooms-grid">
          {sortedRooms.length === 0 ? (
            <article className="landing-card empty-card">
              <h3>Aucune room publique pour l&apos;instant</h3>
              <p>Crée la premiere room et partage ton code a ton equipe.</p>
            </article>
          ) : null}

          {sortedRooms.map((room) => (
            <article className="landing-card room-card" key={room.code}>
              <div className="room-card-head">
                <p className="room-code">{room.code}</p>
                <span className="room-tag">publique</span>
              </div>
              <h3>{room.title}</h3>
              <p>{room.playersCount} joueur(s) connecte(s)</p>
              <button className="btn btn-primary" onClick={() => openJoinModal(room.code)} type="button">
                Rejoindre
              </button>
            </article>
          ))}
        </div>
      </section>

      {isJoinModalOpen ? (
        <div className="modal-overlay" role="presentation" onClick={() => setIsJoinModalOpen(false)}>
          <section className="modal-card" onClick={(event) => event.stopPropagation()}>
            <p className="card-kicker">Connexion a une room</p>
            <h2>Rejoindre {joinModalCode}</h2>
            <form className="modal-form" onSubmit={submitJoinRoom}>
              <label>
                Pseudo
                <input
                  autoFocus
                  value={joinModalName}
                  onChange={(event) => setJoinModalName(event.target.value)}
                  placeholder="Ex: Niniz"
                  maxLength={20}
                />
              </label>

              {errorMessage ? <p className="error-line landing-error">{errorMessage}</p> : null}

              <div className="modal-actions">
                <button className="btn btn-soft" onClick={() => setIsJoinModalOpen(false)} type="button">
                  Annuler
                </button>
                <button className="btn btn-primary" type="submit">
                  Entrer dans la room
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}
