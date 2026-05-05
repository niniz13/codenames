export type Team = "red" | "blue";
export type CardRole = Team | "neutral" | "assassin";
export type GamePhase = "clue" | "guess" | "over";

export type Card = {
  word: string;
  role: CardRole;
  revealed: boolean;
};

export type Clue = {
  word: string;
  count: number;
};

export type GameState = {
  cards: Card[];
  activeTeam: Team;
  startingTeam: Team;
  phase: GamePhase;
  clue: Clue | null;
  guessesLeft: number;
  winner: Team | null;
  status: string;
};

export const WORD_POOL = [
  "AIGLE",
  "ALPIN",
  "AMBRE",
  "ANCRE",
  "ARC",
  "ARCTIQUE",
  "ARENE",
  "ATLAS",
  "AVENIR",
  "BAGUE",
  "BALISE",
  "BAMBOU",
  "BANDE",
  "BATEAU",
  "BISCUIT",
  "BLASON",
  "BLOC",
  "BOUSSOLE",
  "BRUME",
  "CABLE",
  "CADRE",
  "CAMP",
  "CANAL",
  "CASQUE",
  "CAVALIER",
  "CERISE",
  "CERCLE",
  "CHARGE",
  "CHATEAU",
  "CHEMIN",
  "CINEMA",
  "CLAVIER",
  "CLE",
  "COMETE",
  "CORAIL",
  "CORDE",
  "COTE",
  "CRISTAL",
  "CROIX",
  "CUIVRE",
  "DELTA",
  "DESERT",
  "DIESEL",
  "DIGUE",
  "DOME",
  "DRAPEAU",
  "ECHO",
  "ECUME",
  "ELECTRON",
  "ENCRE",
  "ETINCELLE",
  "ETOILE",
  "EVEREST",
  "FALAISE",
  "FIBRE",
  "FJORD",
  "FLOTTE",
  "FOUDRE",
  "FUSION",
  "GALAXIE",
  "GANT",
  "GIVRE",
  "GLACE",
  "GLOBE",
  "GRANIT",
  "GRILLE",
  "GROTTE",
  "HAVRE",
  "HELICE",
  "HORIZON",
  "ILE",
  "JETON",
  "JUNGLE",
  "KAYAK",
  "LABO",
  "LAGON",
  "LAMPE",
  "LASER",
  "LAVANDE",
  "LEGENDE",
  "LEVRE",
  "LIMITE",
  "LIVRE",
  "LUCIOLE",
  "LUNE",
  "MAGNET",
  "MANGUE",
  "MARBRE",
  "MARCHE",
  "MAREE",
  "MASQUE",
  "MIRAGE",
  "MOBILE",
  "MONTRE",
  "MUR",
  "NENUPHAR",
  "NID",
  "NIVEAU",
  "NUAGE",
  "ONYX",
  "ORAGE",
  "ORBIT",
  "PALETTE",
  "PAPYRUS",
  "PARFUM",
  "PAVILLON",
  "PERLE",
  "PHARE",
  "PHOENIX",
  "PILIER",
  "PINCEAU",
  "PIRATE",
  "PISTE",
  "PLUME",
  "POLE",
  "PONT",
  "PORTAL",
  "POUSSE",
  "QUARTZ",
  "RACINE",
  "RADAR",
  "RAYON",
  "RECIF",
  "RIVIERE",
  "ROBOT",
  "ROCHE",
  "RUBIS",
  "SAFRAN",
  "SABLE",
  "SAPHIR",
  "SCENE",
  "SEMAPHORE",
  "SIROCCO",
  "SKIPPER",
  "SOLEIL",
  "SONAR",
  "SPHINX",
  "STATUE",
  "SUMMIT",
  "TALISMAN",
  "TEMPLE",
  "TITAN",
  "TORCHE",
  "TOUR",
  "TRAME",
  "TUNNEL",
  "UNIVERS",
  "VALLEE",
  "VENT",
  "VIGIE",
  "VIOLET",
  "VOLCAN",
  "VOYAGE",
  "WAGON",
  "YACHT",
  "ZENITH",
  "ZONE",
] as const;

export const TEAM_LABEL: Record<Team, string> = {
  red: "Rouge",
  blue: "Bleue",
};

export function oppositeTeam(team: Team): Team {
  return team === "red" ? "blue" : "red";
}

export function makeSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], randomFn: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getRemaining(cards: Card[]) {
  return {
    red: cards.filter((card) => card.role === "red" && !card.revealed).length,
    blue: cards.filter((card) => card.role === "blue" && !card.revealed).length,
  };
}

export function createNewGame(seed?: number): GameState {
  const randomFn = seed === undefined ? Math.random : makeSeededRandom(seed);
  const startingTeam: Team = randomFn() > 0.5 ? "red" : "blue";
  const secondTeam = oppositeTeam(startingTeam);
  const words = shuffle(WORD_POOL, randomFn).slice(0, 25);

  const roles: CardRole[] = [
    ...Array<CardRole>(9).fill(startingTeam),
    ...Array<CardRole>(8).fill(secondTeam),
    ...Array<CardRole>(7).fill("neutral"),
    "assassin",
  ];
  const shuffledRoles = shuffle(roles, randomFn);

  const cards = words.map((word, index) => ({
    word,
    role: shuffledRoles[index],
    revealed: false,
  }));

  return {
    cards,
    activeTeam: startingTeam,
    startingTeam,
    phase: "clue",
    clue: null,
    guessesLeft: 0,
    winner: null,
    status: `L'equipe ${TEAM_LABEL[startingTeam]} commence. Le chef donne un indice.`,
  };
}

export function getCardTone(card: Card, spymasterMode: boolean): string {
  if (!card.revealed && !spymasterMode) {
    return "hidden";
  }

  if (card.role === "assassin") {
    return "assassin";
  }

  if (card.role === "neutral") {
    return "neutral";
  }

  return card.role;
}

export function validateClue(game: GameState, clueWord: string, clueCount: string): string | null {
  if (game.phase !== "clue") {
    return "Ce n'est pas le moment de donner un indice.";
  }

  const normalizedWord = clueWord.trim().toUpperCase();
  const parsedCount = Number.parseInt(clueCount, 10);
  const remaining = getRemaining(game.cards);
  const activeRemaining = remaining[game.activeTeam];
  const isSingleWord = /^\p{L}+(?:-\p{L}+)?$/u.test(normalizedWord);

  if (!normalizedWord || !isSingleWord) {
    return "L'indice doit etre un seul mot (lettres, avec tiret optionnel).";
  }

  const forbidden = game.cards.some((card) => card.word === normalizedWord);
  if (forbidden) {
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

export function applyClue(game: GameState, clueWord: string, clueCount: string): GameState {
  const normalizedWord = clueWord.trim().toUpperCase();
  const parsedCount = Number.parseInt(clueCount, 10);

  return {
    ...game,
    clue: { word: normalizedWord, count: parsedCount },
    phase: "guess",
    guessesLeft: parsedCount + 1,
    status: `Equipe ${TEAM_LABEL[game.activeTeam]}: ${parsedCount} + 1 tentative bonus.`,
  };
}

export function endTurn(game: GameState, reason: string): GameState {
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

export function revealCard(game: GameState, index: number): GameState {
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
    const winner: Team = updatedRemaining.red === 0 ? "red" : "blue";
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
  const reason =
    picked.role === "neutral"
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