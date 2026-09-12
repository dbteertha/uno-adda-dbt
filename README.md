# UNO আড্ডা v4.2 — Made by DBT

Bangla-first 2–4 player UNO party game with bot mode, live funny commentary, fast troll reactions, room-wide sound effects, score history, reconnect support and mobile layout.

## v4.2 stability update

This release hardens the card engine:

- card objects from the real deck are immutable
- card ID → color/value identity is checked on every state change
- duplicate cards across draw/discard/hands are rejected
- production rounds enforce conservation of all 108 cards
- play/draw/+2/+4/UNO penalties verify exact hand-count changes
- clients ignore stale state revisions after reconnect/network changes
- hand DOM nodes stay keyed to permanent card IDs
- regression tests cover card identity and hand-count stability

## Party UI changes

- free-form live chat removed
- Fast Troll buttons live on the main board
- every Fast Troll appears as a large board overlay for everyone in the room
- Sound buttons live on the main board
- `Rag korla 😡` broadcasts the included MP3 to all human players in the room
- funnier Bangla commentary includes playful Mr Bean, John Cena, Charlie Chaplin and The Rock references (generic browser Bangla TTS; not impersonated voices)
- tighter mobile layout with horizontal player/troll/sound strips and a compact hand area

## Run

```bash
npm install
npm run build
npm test
npm start
```

Then open `http://localhost:3000` or the server computer's LAN IP on other devices.

## Always-online deployment

See `ALWAYS_ON_DEPLOY.md` and `render.yaml`.

## v4.4 DBT Arena + Devil Card

- Match UI redesigned as a blue mobile card table: opponent card backs at the top, draw/discard in the center, and your fanned hand at the bottom.
- Party deck is now 110 cards: the classic 108 plus **2 Devil cards**.
- Devil card (`😈`) behaves like a Wild: choose the next color when playing it.
- The player who plays Devil receives a private one-second reveal of every opponent's current card faces. Opponents do not receive that reveal payload, and real opponent card IDs are not sent in the reveal.
- Fast Troll and room-wide sound buttons remain directly below the board.
- Mobile layout was tightened for portrait screens and horizontally scrollable opponent hands.

After extracting: `npm install`, `npm run build`, `npm test`, `npm start`.
