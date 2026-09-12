import { randomInt, randomUUID } from "node:crypto";
import type { UnoCard, UnoValue, PlayColor } from "./types.js";

export const COLORS: PlayColor[] = ["RED", "YELLOW", "GREEN", "BLUE"];
export const DECK_SIZE = 110;

export function shuffle<T>(cards: T[]): T[] {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

export function createDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  const add = (color: UnoCard["color"], value: UnoValue) =>
    cards.push(Object.freeze({ id: randomUUID(), color, value }) as UnoCard);
  for (const color of COLORS) {
    add(color, "0");
    for (let n = 1; n <= 9; n++) {
      add(color, String(n) as UnoValue);
      add(color, String(n) as UnoValue);
    }
    for (const v of ["SKIP", "REVERSE", "DRAW_TWO"] as const) {
      add(color, v);
      add(color, v);
    }
  }
  for (let i = 0; i < 4; i++) {
    add("WILD", "WILD");
    add("WILD", "WILD_DRAW_FOUR");
  }
  // DBT party rule: two Devil cards. Playing one briefly reveals opponents only to its owner.
  add("WILD", "DEVIL");
  add("WILD", "DEVIL");
  return cards;
}

export function points(card: UnoCard): number {
  return card.color === "WILD"
    ? (card.value === "DEVIL" ? 40 : 50)
    : /^\d$/.test(card.value)
      ? Number(card.value)
      : 20;
}
