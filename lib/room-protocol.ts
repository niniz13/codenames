import type { GameState } from "@/lib/codenames";

export type PublicRoomSummary = {
  code: string;
  title: string;
  isPublic: boolean;
  playersCount: number;
  updatedAt: number;
};

export type RoomPlayer = {
  id: string;
  name: string;
  isOwner: boolean;
  team: "red" | "blue" | null;
  role: "decider" | "guesser" | null;
};

export type RoomSnapshot = {
  code: string;
  title: string;
  isPublic: boolean;
  ownerId: string | null;
  isStarted: boolean;
  players: RoomPlayer[];
  game: GameState | null;
  updatedAt: number;
};

export type ClientMessage =
  | {
      type: "list_rooms";
    }
  | {
      type: "create_room";
      payload: {
        title: string;
        isPublic: boolean;
        playerName: string;
        playerToken?: string;
      };
    }
  | {
      type: "join_room";
      payload: {
        code: string;
        playerName: string;
        playerToken?: string;
      };
    }
  | {
      type: "leave_room";
    }
  | {
      type: "new_game";
    }
  | {
      type: "start_game";
    }
  | {
      type: "set_team";
      payload: {
        team: "red" | "blue";
      };
    }
  | {
      type: "submit_clue";
      payload: {
        word: string;
        count: string;
      };
    }
  | {
      type: "reveal_card";
      payload: {
        index: number;
      };
    }
  | {
      type: "end_turn";
    };

export type ServerMessage =
  | {
      type: "welcome";
      payload: {
        clientId: string;
      };
    }
  | {
      type: "public_rooms";
      payload: {
        rooms: PublicRoomSummary[];
      };
    }
  | {
      type: "room_joined" | "room_updated";
      payload: {
        room: RoomSnapshot;
      };
    }
  | {
      type: "room_left";
    }
  | {
      type: "room_closed";
      payload: {
        message: string;
      };
    }
  | {
      type: "error";
      payload: {
        message: string;
      };
    };

function buildWebSocketUrlFromAppUrl(appUrl: string) {
  const url = new URL(appUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.search = "";
  url.hash = "";

  url.port = "3001";

  return url.toString();
}

export function getWebSocketUrl() {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  if (typeof window === "undefined") {
    return buildWebSocketUrlFromAppUrl("http://localhost:3000");
  }

  const wsUrl = new URL(window.location.href);
  wsUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  wsUrl.pathname = "/ws";
  wsUrl.search = "";
  wsUrl.hash = "";

  wsUrl.port = "3001";

  return wsUrl.toString();
}

export function getPlayerToken() {
  if (typeof window === "undefined") {
    return "";
  }

  const storageKey = "codenames.playerToken";
  const existing = window.localStorage.getItem(storageKey)?.trim();
  if (existing) {
    return existing;
  }

  const generated = window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2);
  window.localStorage.setItem(storageKey, generated);
  return generated;
}