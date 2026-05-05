import crypto from "node:crypto";

import { WebSocket, WebSocketServer } from "ws";

const EMPTY_ROOM_TTL_MS = 5 * 60 * 1000;
const DISCONNECT_GRACE_MS = 12 * 1000;

const WORD_POOL = [
  "AIGLE", "ALPIN", "AMBRE", "ANCRE", "ARC", "ARCTIQUE", "ARENE", "ATLAS", "AVENIR",
  "BAGUE", "BALISE", "BAMBOU", "BANDE", "BATEAU", "BISCUIT", "BLASON", "BLOC", "BOUSSOLE",
  "BRUME", "CABLE", "CADRE", "CAMP", "CANAL", "CASQUE", "CAVALIER", "CERISE", "CERCLE",
  "CHARGE", "CHATEAU", "CHEMIN", "CINEMA", "CLAVIER", "CLE", "COMETE", "CORAIL", "CORDE",
  "COTE", "CRISTAL", "CROIX", "CUIVRE", "DELTA", "DESERT", "DIESEL", "DIGUE", "DOME",
  "DRAPEAU", "ECHO", "ECUME", "ELECTRON", "ENCRE", "ETINCELLE", "ETOILE", "EVEREST", "FALAISE",
  "FIBRE", "FJORD", "FLOTTE", "FOUDRE", "FUSION", "GALAXIE", "GANT", "GIVRE", "GLACE",
  "GLOBE", "GRANIT", "GRILLE", "GROTTE", "HAVRE", "HELICE", "HORIZON", "ILE", "JETON",
  "JUNGLE", "KAYAK", "LABO", "LAGON", "LAMPE", "LASER", "LAVANDE", "LEGENDE", "LEVRE",
  "LIMITE", "LIVRE", "LUCIOLE", "LUNE", "MAGNET", "MANGUE", "MARBRE", "MARCHE", "MAREE",
  "MASQUE", "MIRAGE", "MOBILE", "MONTRE", "MUR", "NENUPHAR", "NID", "NIVEAU", "NUAGE",
  "ONYX", "ORAGE", "ORBIT", "PALETTE", "PAPYRUS", "PARFUM", "PAVILLON", "PERLE", "PHARE",
  "PHOENIX", "PILIER", "PINCEAU", "PIRATE", "PISTE", "PLUME", "POLE", "PONT", "PORTAL",
  "POUSSE", "QUARTZ", "RACINE", "RADAR", "RAYON", "RECIF", "RIVIERE", "ROBOT", "ROCHE",
  "RUBIS", "SAFRAN", "SABLE", "SAPHIR", "SCENE", "SEMAPHORE", "SIROCCO", "SKIPPER", "SOLEIL",
  "SONAR", "SPHINX", "STATUE", "SUMMIT", "TALISMAN", "TEMPLE", "TITAN", "TORCHE", "TOUR",
  "TRAME", "TUNNEL", "UNIVERS", "VALLEE", "VENT", "VIGIE", "VIOLET", "VOLCAN", "VOYAGE",
  "WAGON", "YACHT", "ZENITH", "ZONE",
];

const TEAM_LABEL = {
  red: "Rouge",
  blue: "Bleue",
};

function oppositeTeam(team) {
  return team === "red" ? "blue" : "red";
}

function shuffle(items, randomFn = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getRemaining(cards) {
  return {
    red: cards.filter((card) => card.role === "red" && !card.revealed).length,
    blue: cards.filter((card) => card.role === "blue" && !card.revealed).length,
  };
}

function createNewGame() {
  const startingTeam = Math.random() > 0.5 ? "red" : "blue";
  const secondTeam = oppositeTeam(startingTeam);
  const words = shuffle(WORD_POOL).slice(0, 25);
  const roles = [
    ...Array(9).fill(startingTeam),
    ...Array(8).fill(secondTeam),
    ...Array(7).fill("neutral"),
    "assassin",
  ];
  const shuffledRoles = shuffle(roles);

  return {
    cards: words.map((word, index) => ({ word, role: shuffledRoles[index], revealed: false })),
    activeTeam: startingTeam,
    startingTeam,
    phase: "clue",
    clue: null,
    guessesLeft: 0,
    winner: null,
    status: `L'equipe ${TEAM_LABEL[startingTeam]} commence. Le chef donne un indice.`,
  };
}

function validateClue(game, clueWord, clueCount) {
  const normalizedWord = String(clueWord).trim().toUpperCase();
  const parsedCount = Number.parseInt(String(clueCount), 10);
  const remaining = getRemaining(game.cards);
  const activeRemaining = remaining[game.activeTeam];
  const isSingleWord = /^\p{L}+(?:-\p{L}+)?$/u.test(normalizedWord);

  if (game.phase !== "clue") {
    return "Ce n'est pas le moment de donner un indice.";
  }
  if (!normalizedWord || !isSingleWord) {
    return "L'indice doit etre un seul mot.";
  }
  if (game.cards.some((card) => card.word === normalizedWord)) {
    return "Indice invalide: ce mot est present sur la grille.";
  }
  if (
    !Number.isInteger(parsedCount) ||
    parsedCount < 1 ||
    parsedCount > 9 ||
    parsedCount > activeRemaining
  ) {
    return `Le nombre doit etre entre 1 et ${Math.max(1, Math.min(activeRemaining, 9))}.`;
  }

  return null;
}

function applyClue(game, clueWord, clueCount) {
  const normalizedWord = String(clueWord).trim().toUpperCase();
  const parsedCount = Number.parseInt(String(clueCount), 10);

  return {
    ...game,
    clue: { word: normalizedWord, count: parsedCount },
    phase: "guess",
    guessesLeft: parsedCount + 1,
    status: `Equipe ${TEAM_LABEL[game.activeTeam]}: ${parsedCount} + 1 tentative bonus.`,
  };
}

function endTurn(game, reason) {
  if (game.phase === "over") {
    return game;
  }
  const nextTeam = oppositeTeam(game.activeTeam);
  return {
    ...game,
    activeTeam: nextTeam,
    phase: "clue",
    clue: null,
    guessesLeft: 0,
    status: `${reason} Tour de l'equipe ${TEAM_LABEL[nextTeam]}.`,
  };
}

function revealCard(game, index) {
  if (game.phase !== "guess") {
    return game;
  }

  const picked = game.cards[index];
  if (!picked || picked.revealed) {
    return game;
  }

  const cards = game.cards.map((card, cardIndex) =>
    cardIndex === index ? { ...card, revealed: true } : card,
  );

  if (picked.role === "assassin") {
    const winner = oppositeTeam(game.activeTeam);
    return {
      ...game,
      cards,
      phase: "over",
      winner,
      status: `Assassin choisi. L'equipe ${TEAM_LABEL[winner]} gagne immediatement.`,
    };
  }

  const updatedRemaining = getRemaining(cards);
  if (updatedRemaining.red === 0 || updatedRemaining.blue === 0) {
    const winner = updatedRemaining.red === 0 ? "red" : "blue";
    return {
      ...game,
      cards,
      phase: "over",
      winner,
      status: `Toutes les cartes ${TEAM_LABEL[winner]} sont trouvees. Victoire ${TEAM_LABEL[winner]}.`,
    };
  }

  if (picked.role === game.activeTeam) {
    const nextGuessesLeft = game.guessesLeft - 1;
    if (nextGuessesLeft <= 0) {
      const nextTeam = oppositeTeam(game.activeTeam);
      return {
        ...game,
        cards,
        activeTeam: nextTeam,
        phase: "clue",
        clue: null,
        guessesLeft: 0,
        status: `Plus de tentatives. Tour de l'equipe ${TEAM_LABEL[nextTeam]}.`,
      };
    }

    return {
      ...game,
      cards,
      guessesLeft: nextGuessesLeft,
      status: `Bonne reponse. Il reste ${nextGuessesLeft} tentative(s).`,
    };
  }

  const nextTeam = oppositeTeam(game.activeTeam);
  const reason = picked.role === "neutral"
    ? "Mot neutre choisi."
    : `Carte ${TEAM_LABEL[picked.role]} choisie.`;

  return {
    ...game,
    cards,
    activeTeam: nextTeam,
    phase: "clue",
    clue: null,
    guessesLeft: 0,
    status: `${reason} Tour de l'equipe ${TEAM_LABEL[nextTeam]}.`,
  };
}

function sanitizePlayerName(value) {
  return String(value || "Agent").trim().slice(0, 20) || "Agent";
}

function sanitizeTitle(value) {
  return String(value || "Room Codenames").trim().slice(0, 36) || "Room Codenames";
}

function sanitizePlayerToken(value) {
  const token = String(value || "").trim().slice(0, 64);
  return token || crypto.randomUUID();
}

function countTeamPlayers(room, team) {
  return [...room.players.values()].filter((player) => player.team === team).length;
}

function getTeamEntries(room, team) {
  return [...room.players.entries()].filter(([, player]) => player.team === team);
}

function getPlayerRole(room, clientId) {
  const player = room.players.get(clientId);
  if (!player || !player.team) {
    return null;
  }

  const teamEntries = getTeamEntries(room, player.team);
  const index = teamEntries.findIndex(([id]) => id === clientId);

  if (index === 0) {
    return "decider";
  }
  if (index === 1) {
    return "guesser";
  }

  return null;
}

function canStartWithBalancedTeams(room) {
  return countTeamPlayers(room, "red") === 2 && countTeamPlayers(room, "blue") === 2;
}

export function attachRoomServer(server, options = {}) {
  const rooms = new Map();
  const clientState = new Map();
  const wss = new WebSocketServer({ server, path: options.path });

  function clearRoomExpiry(room) {
    if (room.expiryTimer) {
      clearTimeout(room.expiryTimer);
      room.expiryTimer = null;
    }
  }

  function deleteRoom(code) {
    const room = rooms.get(code);
    if (!room) {
      return;
    }

    clearRoomExpiry(room);
    rooms.delete(code);
    broadcastPublicRooms();
  }

  function closeRoomForOwnerDeparture(room, reason, ownerWs = null) {
    const sockets = [...room.clients];
    for (const socket of sockets) {
      const state = clientState.get(socket);
      if (state?.roomCode === room.code) {
        state.roomCode = null;
      }

      if (socket === ownerWs) {
        send(socket, { type: "room_left" });
      } else {
        send(socket, { type: "room_closed", payload: { message: reason } });
      }
    }

    if (room.disconnectedPlayers) {
      for (const timer of room.disconnectedPlayers.values()) {
        clearTimeout(timer);
      }
      room.disconnectedPlayers.clear();
    }

    room.clients.clear();
    room.players.clear();
    room.ownerClientId = null;
    deleteRoom(room.code);
  }

  function scheduleRoomExpiry(room) {
    clearRoomExpiry(room);
    room.expiryTimer = setTimeout(() => {
      const currentRoom = rooms.get(room.code);
      if (!currentRoom || currentRoom.clients.size > 0) {
        return;
      }

      deleteRoom(room.code);
    }, EMPTY_ROOM_TTL_MS);
  }

  function generateCode() {
    let code = "";
    do {
      code = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(2, 8);
    } while (!code || rooms.has(code));
    return code;
  }

  function send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  function getPublicRooms() {
    return [...rooms.values()]
      .filter((room) => room.isPublic)
      .map((room) => ({
        code: room.code,
        title: room.title,
        isPublic: room.isPublic,
        playersCount: room.players.size,
        updatedAt: room.updatedAt,
      }));
  }

  function broadcastPublicRooms() {
    const payload = { type: "public_rooms", payload: { rooms: getPublicRooms() } };
    for (const ws of clientState.keys()) {
      send(ws, payload);
    }
  }

  function makeRoomSnapshot(room) {
    return {
      code: room.code,
      title: room.title,
      isPublic: room.isPublic,
      ownerId: room.ownerClientId,
      isStarted: room.isStarted,
      players: [...room.players.entries()].map(([id, player]) => ({
        id,
        name: player.name,
        team: player.team,
        role: getPlayerRole(room, id),
        isOwner: id === room.ownerClientId,
      })),
      game: room.game,
      updatedAt: room.updatedAt,
    };
  }

  function broadcastRoom(room, type = "room_updated") {
    const message = { type, payload: { room: makeRoomSnapshot(room) } };
    for (const ws of room.clients) {
      send(ws, message);
    }
  }

  function leaveRoom(ws) {
    const state = clientState.get(ws);
    if (!state?.roomCode) {
      return;
    }

    const room = rooms.get(state.roomCode);
    if (!room) {
      state.roomCode = null;
      return;
    }

    const playerId = state.playerId ?? state.clientId;

    if (room.ownerClientId === playerId) {
      closeRoomForOwnerDeparture(room, "L'admin a quitte la room.", ws);
      return;
    }

    room.clients.delete(ws);
    room.players.delete(playerId);

    room.updatedAt = Date.now();
    state.roomCode = null;

    if (room.clients.size === 0) {
      scheduleRoomExpiry(room);
    } else {
      broadcastRoom(room);
    }

    broadcastPublicRooms();
  }

  function cleanupDisconnectedPlayer(room, playerId) {
    if (!room.disconnectedPlayers) {
      room.disconnectedPlayers = new Map();
    }
    const timer = room.disconnectedPlayers.get(playerId);
    if (timer) {
      clearTimeout(timer);
    }
    room.disconnectedPlayers.delete(playerId);
  }

  function scheduleDisconnectedCleanup(room, playerId) {
    if (!room.disconnectedPlayers) {
      room.disconnectedPlayers = new Map();
    }
    cleanupDisconnectedPlayer(room, playerId);
    const timer = setTimeout(() => {
      const currentRoom = rooms.get(room.code);
      if (!currentRoom) {
        return;
      }

      if (!currentRoom.disconnectedPlayers) {
        currentRoom.disconnectedPlayers = new Map();
      }

      currentRoom.disconnectedPlayers.delete(playerId);

      if (currentRoom.ownerClientId === playerId) {
        closeRoomForOwnerDeparture(currentRoom, "L'admin a quitte la room.");
        return;
      }

      currentRoom.players.delete(playerId);

      currentRoom.updatedAt = Date.now();
      if (currentRoom.clients.size === 0) {
        scheduleRoomExpiry(currentRoom);
      } else {
        broadcastRoom(currentRoom);
      }
      broadcastPublicRooms();
    }, DISCONNECT_GRACE_MS);

    room.disconnectedPlayers.set(playerId, timer);
  }

  function leaveRoomPreservingPlayer(ws) {
    const state = clientState.get(ws);
    if (!state?.roomCode) {
      return;
    }

    const room = rooms.get(state.roomCode);
    if (!room) {
      state.roomCode = null;
      return;
    }

    room.clients.delete(ws);

    const playerId = state.playerId ?? state.clientId;
    if (room.players.has(playerId)) {
      scheduleDisconnectedCleanup(room, playerId);
    }

    room.updatedAt = Date.now();
    state.roomCode = null;

    if (room.clients.size === 0) {
      scheduleRoomExpiry(room);
    } else {
      broadcastRoom(room);
    }

    broadcastPublicRooms();
  }

  function joinRoom(ws, room, playerName, requestedPlayerToken) {
    leaveRoom(ws);

    const state = clientState.get(ws);
    const playerId = sanitizePlayerToken(requestedPlayerToken || state.playerId || state.clientId);
    state.playerId = playerId;
    state.roomCode = room.code;
    if (!room.disconnectedPlayers) {
      room.disconnectedPlayers = new Map();
    }
    clearRoomExpiry(room);
    room.clients.add(ws);
    cleanupDisconnectedPlayer(room, playerId);

    if (!room.ownerClientId) {
      room.ownerClientId = playerId;
    }

    const existingPlayer = room.players.get(playerId);
    room.players.set(playerId, {
      name: sanitizePlayerName(playerName),
      team: existingPlayer?.team ?? null,
    });
    room.updatedAt = Date.now();
    send(ws, { type: "room_joined", payload: { room: makeRoomSnapshot(room) } });
    broadcastRoom(room);
    broadcastPublicRooms();
  }

  wss.on("connection", (ws) => {
    const clientId = crypto.randomUUID();
    clientState.set(ws, { clientId, playerId: null, roomCode: null });
    send(ws, { type: "welcome", payload: { clientId } });
    send(ws, { type: "public_rooms", payload: { rooms: getPublicRooms() } });

    ws.on("message", (raw) => {
      let message;

      try {
        message = JSON.parse(String(raw));
      } catch {
        send(ws, { type: "error", payload: { message: "Message WebSocket invalide." } });
        return;
      }

      const state = clientState.get(ws);
      if (!state) {
        send(ws, { type: "error", payload: { message: "Session joueur introuvable." } });
        return;
      }

      const actorId = state.playerId ?? state.clientId;
      const room = state.roomCode ? rooms.get(state.roomCode) : null;

      switch (message.type) {
        case "list_rooms":
          send(ws, { type: "public_rooms", payload: { rooms: getPublicRooms() } });
          return;

        case "create_room": {
          const playerToken = sanitizePlayerToken(message.payload?.playerToken);
          const code = generateCode();
          const newRoom = {
            code,
            title: sanitizeTitle(message.payload?.title),
            isPublic: Boolean(message.payload?.isPublic),
            ownerClientId: playerToken,
            isStarted: false,
            players: new Map(),
            clients: new Set(),
            disconnectedPlayers: new Map(),
            game: null,
            updatedAt: Date.now(),
            expiryTimer: null,
          };
          rooms.set(code, newRoom);
          joinRoom(ws, newRoom, message.payload?.playerName, playerToken);
          newRoom.ownerClientId = playerToken;
          broadcastRoom(newRoom);
          return;
        }

        case "join_room": {
          const requestedCode = String(message.payload?.code || "").trim().toUpperCase();
          const existingRoom = rooms.get(requestedCode);
          if (!existingRoom) {
            send(ws, { type: "error", payload: { message: "Cette room n'existe pas." } });
            return;
          }

          joinRoom(ws, existingRoom, message.payload?.playerName, message.payload?.playerToken);
          return;
        }

        case "leave_room":
          leaveRoom(ws);
          send(ws, { type: "room_left" });
          return;

        case "new_game":
          if (!room) {
            send(ws, { type: "error", payload: { message: "Aucune room active." } });
            return;
          }

          if (room.ownerClientId !== actorId) {
            send(ws, { type: "error", payload: { message: "Seul l'admin peut relancer la partie." } });
            return;
          }

          // Retour en salle d'attente: tout le monde repasse au choix des equipes.
          room.game = null;
          room.isStarted = false;
          for (const player of room.players.values()) {
            player.team = null;
          }
          room.updatedAt = Date.now();
          broadcastRoom(room);
          broadcastPublicRooms();
          return;

        case "start_game":
          if (!room) {
            send(ws, { type: "error", payload: { message: "Aucune room active." } });
            return;
          }

          if (room.ownerClientId !== actorId) {
            send(ws, { type: "error", payload: { message: "Seul l'admin peut lancer la partie." } });
            return;
          }

          if (!canStartWithBalancedTeams(room)) {
            send(ws, { type: "error", payload: { message: "Il faut 2 joueurs rouges et 2 joueurs bleus pour lancer." } });
            return;
          }

          room.game = createNewGame();
          room.isStarted = true;
          room.updatedAt = Date.now();
          broadcastRoom(room);
          broadcastPublicRooms();
          return;

        case "set_team":
          if (!room) {
            send(ws, { type: "error", payload: { message: "Aucune room active." } });
            return;
          }

          if (room.isStarted) {
            send(ws, { type: "error", payload: { message: "Impossible de changer d'equipe pendant la partie." } });
            return;
          }

          {
            const requestedTeam = message.payload?.team;
            if (requestedTeam !== "red" && requestedTeam !== "blue") {
              send(ws, { type: "error", payload: { message: "Equipe invalide." } });
              return;
            }

            const currentPlayer = room.players.get(actorId);
            if (!currentPlayer) {
              send(ws, { type: "error", payload: { message: "Joueur introuvable dans la room." } });
              return;
            }

            if (currentPlayer.team === requestedTeam) {
              return;
            }

            if (countTeamPlayers(room, requestedTeam) >= 2) {
              send(ws, { type: "error", payload: { message: "Cette equipe est deja complete (2 joueurs max)." } });
              return;
            }

            room.players.set(actorId, {
              ...currentPlayer,
              team: requestedTeam,
            });
            room.updatedAt = Date.now();
            broadcastRoom(room);
            broadcastPublicRooms();
          }
          return;

        case "submit_clue":
          if (!room || !room.game || !room.isStarted) {
            send(ws, { type: "error", payload: { message: "Aucune room active." } });
            return;
          }

          {
            const player = room.players.get(actorId);
            if (!player || !player.team) {
              send(ws, { type: "error", payload: { message: "Choisis une equipe avant de jouer." } });
              return;
            }

            if (player.team !== room.game.activeTeam) {
              send(ws, { type: "error", payload: { message: "Ce n'est pas le tour de ton equipe." } });
              return;
            }

            if (getPlayerRole(room, actorId) !== "decider") {
              send(ws, { type: "error", payload: { message: "Seul le decideur peut donner un indice." } });
              return;
            }
          }

          {
            const error = validateClue(room.game, message.payload?.word, message.payload?.count);
            if (error) {
              send(ws, { type: "error", payload: { message: error } });
              return;
            }
            room.game = applyClue(room.game, message.payload?.word, message.payload?.count);
            room.updatedAt = Date.now();
            broadcastRoom(room);
            broadcastPublicRooms();
          }
          return;

        case "reveal_card":
          if (!room || !room.game || !room.isStarted) {
            send(ws, { type: "error", payload: { message: "Aucune room active." } });
            return;
          }

          {
            const player = room.players.get(actorId);
            if (!player || !player.team) {
              send(ws, { type: "error", payload: { message: "Choisis une equipe avant de jouer." } });
              return;
            }

            if (player.team !== room.game.activeTeam) {
              send(ws, { type: "error", payload: { message: "Ce n'est pas le tour de ton equipe." } });
              return;
            }

            if (getPlayerRole(room, actorId) !== "guesser") {
              send(ws, { type: "error", payload: { message: "Seul le devineur peut choisir une carte." } });
              return;
            }
          }

          room.game = revealCard(room.game, Number(message.payload?.index));
          room.updatedAt = Date.now();
          broadcastRoom(room);
          broadcastPublicRooms();
          return;

        case "end_turn":
          if (!room || !room.game || !room.isStarted) {
            send(ws, { type: "error", payload: { message: "Aucune room active." } });
            return;
          }

          {
            const player = room.players.get(actorId);
            if (!player || !player.team) {
              send(ws, { type: "error", payload: { message: "Choisis une equipe avant de jouer." } });
              return;
            }

            if (player.team !== room.game.activeTeam) {
              send(ws, { type: "error", payload: { message: "Ce n'est pas le tour de ton equipe." } });
              return;
            }

            if (getPlayerRole(room, actorId) !== "guesser") {
              send(ws, { type: "error", payload: { message: "Seul le devineur peut terminer le tour." } });
              return;
            }
          }

          room.game = endTurn(room.game, "L'equipe passe son tour.");
          room.updatedAt = Date.now();
          broadcastRoom(room);
          broadcastPublicRooms();
          return;

        default:
          send(ws, { type: "error", payload: { message: "Type de message inconnu." } });
      }
    });

    ws.on("close", () => {
      leaveRoomPreservingPlayer(ws);
      clientState.delete(ws);
    });
  });

  return wss;
}