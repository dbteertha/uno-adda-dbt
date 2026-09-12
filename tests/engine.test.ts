import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDeck } from "../src/Deck.js";
import { GameRoom } from "../src/GameRoom.js";
import type { UnoCard, UnoValue, UnoColor } from "../src/types.js";

const card=(value:UnoValue="5",color:UnoColor="RED"):UnoCard=>({id:randomUUID(),value,color});
function add(r:GameRoom,t:string){r.add({socketId:t,sessionToken:t,displayName:t.toUpperCase(),avatar:"😎",hand:[],isReady:false,isUnoSafe:false,connected:true,lastHeartbeat:0});}
function fixture(n=2){let now=100000;const r=new GameRoom("TEST",()=>now);for(const t of ["a","b","c","d"].slice(0,n))add(r,t);r.start();r.state.currentTurnIndex=0;r.state.direction=1;r.state.discardPile=[card()];r.state.activeColor="RED";r.needsStartingColor=false;r.state.drawnCardPlayable=null;r.state.drawPile=Array.from({length:60},()=>card("9","BLUE"));for(const t of r.tokens)r.player(t).hand=[card("5"),card("2")];r.assertIntegrity("fixture");return{r,advance:(ms:number)=>{now+=ms;r.tick()}}}

function identities(r:GameRoom,t:string){return r.player(t).hand.map(c=>({id:c.id,value:c.value,color:c.color}));}
function counts(r:GameRoom){return Object.fromEntries(r.tokens.map(t=>[t,r.player(t).hand.length]));}

test("110 card party deck is preserved, includes Devil cards, and cards are immutable",()=>{const d=createDeck();assert.equal(d.length,110);assert.equal(new Set(d.map(c=>c.id)).size,110);assert.equal(d.filter(c=>c.value==="DEVIL").length,2);assert.equal(Object.isFrozen(d[0]),true)});
test("room supports 2 to 4 players and rejects fifth",()=>{const r=new GameRoom("ABCD");for(const t of ["a","b","c","d"])add(r,t);assert.equal(r.tokens.length,4);assert.throws(()=>add(r,"e"));});
test("four-player normal turn advances clockwise",()=>{const{r}=fixture(4);const id=r.player("a").hand[0].id;r.play("a",id,undefined,false);assert.equal(r.current,"b")});
test("four-player skip skips next player",()=>{const{r}=fixture(4);const c=card("SKIP");r.player("a").hand=[c,card("2")];r.play("a",c.id,undefined,false);assert.equal(r.current,"c")});
test("four-player reverse changes direction",()=>{const{r}=fixture(4);const c=card("REVERSE");r.player("a").hand=[c,card("2")];r.play("a",c.id,undefined,false);assert.equal(r.state.direction,-1);assert.equal(r.current,"d")});
test("two-player reverse behaves like skip",()=>{const{r}=fixture(2);const c=card("REVERSE");r.player("a").hand=[c,card("2")];r.play("a",c.id,undefined,false);assert.equal(r.current,"a")});
test("draw two changes only actor and target card counts",()=>{const{r}=fixture(4);const c=card("DRAW_TWO");r.player("a").hand=[c,card("2")];const before=counts(r);r.play("a",c.id,undefined,false);assert.equal(r.player("a").hand.length,before.a-1);assert.equal(r.player("b").hand.length,before.b+2);assert.equal(r.player("c").hand.length,before.c);assert.equal(r.player("d").hand.length,before.d);assert.equal(r.current,"c")});
test("wild draw four changes only actor and target card counts",()=>{const{r}=fixture(4);const w=card("WILD_DRAW_FOUR","WILD");r.player("a").hand=[w,card("2","BLUE")];const before=counts(r);r.play("a",w.id,"GREEN",false);assert.equal(r.player("a").hand.length,before.a-1);assert.equal(r.player("b").hand.length,before.b+4);assert.equal(r.player("c").hand.length,before.c);assert.equal(r.player("d").hand.length,before.d)});
test("wild draw four cannot be played while active color exists in hand",()=>{const{r}=fixture();const w=card("WILD_DRAW_FOUR","WILD");r.player("a").hand.push(w);assert.throws(()=>r.play("a",w.id,"BLUE",false))});
test("UNO miss can be caught",()=>{const{r}=fixture();r.play("a",r.player("a").hand[0].id,undefined,false);assert.equal(r.sync("b").canCatchOpponent,true);r.catchUno("b");assert.equal(r.player("a").hand.length,3)});
test("sync never leaks opponent hand IDs",()=>{const{r}=fixture(4);const view=r.sync("b");for(const t of r.tokens.filter(t=>t!=="b"))for(const c of r.player(t).hand)assert.ok(!JSON.stringify(view).includes(c.id));});
test("timer draws exactly one card and advances",()=>{const{r,advance}=fixture(4);const before=counts(r);advance(30000);assert.equal(r.player("a").hand.length,before.a+1);assert.equal(r.player("b").hand.length,before.b);assert.equal(r.current,"b")});
test("all players requesting rematch starts next round",()=>{const{r}=fixture(4);r.finish("a","test");for(const t of ["a","b","c"])r.requestRematch(t);assert.equal(r.state.status,"ROUND_OVER");r.requestRematch("d");assert.equal(r.state.status,"PLAYING")});
test("bot joins and can play a legal turn",()=>{let now=100000;const r=new GameRoom("BOT1",()=>now);add(r,"a");const bot=r.addBot("বট মামা","🤖");r.ready("a",true);assert.equal(r.state.status,"PLAYING");r.state.currentTurnIndex=r.tokens.indexOf(bot);r.state.direction=1;r.state.discardPile=[card("5","RED")];r.state.activeColor="RED";r.needsStartingColor=false;const playable=card("7","RED");r.player(bot).hand=[playable,card("2","BLUE")];assert.equal(r.playBotTurn(),true);assert.equal(r.player(bot).hand.length,1)});
test("playing one card never changes identity/value/color of remaining cards",()=>{const{r}=fixture(2);const before=identities(r,"a"),played=before[0];r.play("a",played.id,undefined,false);assert.deepEqual(identities(r,"a"),before.slice(1))});
test("drawing a card preserves every existing card identity/value/color",()=>{const{r}=fixture(2);const before=identities(r,"a");r.state.drawPile=[card("8","BLUE")];r.draw("a");assert.deepEqual(identities(r,"a").slice(0,before.length),before)});
test("normal play changes no other player's card count",()=>{const{r}=fixture(4);const before=counts(r);r.play("a",r.player("a").hand[0].id,undefined,false);assert.equal(r.player("a").hand.length,before.a-1);for(const t of ["b","c","d"])assert.equal(r.player(t).hand.length,before[t])});
test("duplicate card ids are rejected by integrity guard",()=>{const{r}=fixture(2);r.player("b").hand.push(r.player("a").hand[0]);assert.throws(()=>r.assertIntegrity("duplicate-test"),/duplicate card/)});
test("same card id changing value is rejected",()=>{const{r}=fixture(2);const c=r.player("a").hand[0];r.assertIntegrity("remember");r.player("a").hand[0]={...c,value:"9"};assert.throws(()=>r.assertIntegrity("mutation-test"),/changed from/)});

test("devil card acts as wild and reveal contains opponents for the player only without card ids",()=>{const{r}=fixture(4);const devil=card("DEVIL","WILD");r.player("a").hand=[devil,card("2","BLUE")];r.play("a",devil.id,"GREEN",false);assert.equal(r.state.activeColor,"GREEN");assert.equal(r.lastEvent?.type,"devil");const reveal=r.devilReveal("a");assert.equal(reveal.length,3);assert.ok(reveal.every(x=>x.cards.length===r.player(r.tokens[x.seat]).hand.length));assert.ok(!JSON.stringify(reveal).includes(r.player("b").hand[0].id));});
