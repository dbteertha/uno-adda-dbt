export type UnoColor = "RED" | "YELLOW" | "GREEN" | "BLUE" | "WILD";
export type PlayColor = Exclude<UnoColor, "WILD">;
export type UnoValue =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "SKIP" | "REVERSE" | "DRAW_TWO" | "WILD" | "WILD_DRAW_FOUR" | "DEVIL";
export type RoomVisibility = "public" | "private" | "invite";

export interface UnoCard { id: string; color: UnoColor; value: UnoValue; }

export interface PlayerSession {
  socketId: string;
  sessionToken: string;
  displayName: string;
  avatar: string;
  hand: UnoCard[];
  isReady: boolean;
  isUnoSafe: boolean;
  connected: boolean;
  lastHeartbeat: number;
  isBot?: boolean;
}

export interface MatchHistoryItem {
  round: number;
  winnerName: string;
  winnerAvatar: string;
  points: number;
  reason: string;
  at: number;
}

export interface UnoRoomState {
  roomCode: string;
  players: Record<string, PlayerSession>;
  playerOrder: string[];
  currentTurnIndex: number;
  direction: 1 | -1;
  activeColor: UnoColor;
  drawPile: UnoCard[];
  discardPile: UnoCard[];
  vulnerablePlayerToken: string | null;
  vulnerabilityExpiry: number | null;
  drawnCardPlayable: UnoCard | null;
  status: "LOBBY" | "PLAYING" | "ROUND_OVER";
  winnerToken: string | null;
}

export interface PublicPlayer {
  displayName: string;
  avatar: string;
  connected: boolean;
  isReady: boolean;
  isMe: boolean;
  isHost: boolean;
  isCurrent: boolean;
  cardCount: number;
  score: number;
  wins: number;
  rematchRequested: boolean;
  isBot: boolean;
  seat: number;
}

export interface GameEvent {
  id: string;
  type: string;
  actor: string;
  target?: string;
  value?: string;
  at: number;
}

export interface ClientSyncPayload {
  roomCode: string;
  status: UnoRoomState["status"];
  isMyTurn: boolean;
  myHand: UnoCard[];
  myName: string;
  myAvatar: string;
  topDiscardCard: UnoCard | null;
  activeColor: UnoColor;
  direction: 1 | -1;
  drawPileCount: number;
  canCallUno: boolean;
  canCatchOpponent: boolean;
  pendingDrawnCard: UnoCard | null;
  winnerName: string | null;
  winnerAvatar: string | null;
  playableCardIds: string[];
  needsStartingColor: boolean;
  paused: boolean;
  turnDeadline: number | null;
  reconnectDeadline: number | null;
  unoDeadline: number | null;
  serverNow: number;
  players: PublicPlayer[];
  history: MatchHistoryItem[];
  revision: number;
  round: number;
  resultReason: string | null;
  lastEvent: GameEvent | null;
  roomVisibility: RoomVisibility;
  inviteKey: string | null;
}
