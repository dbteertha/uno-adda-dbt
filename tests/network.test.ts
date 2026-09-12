import test from "node:test";
import assert from "node:assert/strict";
import { io, Socket } from "socket.io-client";
import { createUnoServer } from "../src/server.js";

function event(s:Socket,name:string,predicate:(d:any)=>boolean=()=>true){return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>{s.off(name,h);reject(Error(`Timed out: ${name}`))},4000);function h(d:any){if(!predicate(d))return;s.off(name,h);clearTimeout(timer);resolve(d)}s.on(name,h)})}

test("four clients can join, fast troll broadcasts to room, hands stay private, fifth is rejected",async()=>{
  const server=createUnoServer();await new Promise<void>(r=>server.http.listen(0,"127.0.0.1",r));const {port}=server.http.address() as {port:number};const url=`http://127.0.0.1:${port}`;const clients:Socket[]=[];
  async function connect(){const s=io(url,{transports:["websocket"],forceNew:true,reconnection:false});clients.push(s);await event(s,"connect");return s}
  try{
    const a=await connect(),b=await connect(),c=await connect(),d=await connect();let p=event(a,"s_room_created");a.emit("c_create_room",{displayName:"A",avatar:"😎"});const seatA=await p;
    for(const [s,n,av] of [[b,"B","🤖"],[c,"C","👻"],[d,"D","😈"]] as const){p=event(s,"s_room_created");s.emit("c_join_room",{roomCode:seatA.roomCode,displayName:n,avatar:av});await p}
    const fifth=await connect();p=event(fifth,"s_error");fifth.emit("c_join_room",{roomCode:seatA.roomCode,displayName:"E",avatar:"🐸"});assert.match((await p).message,/ভর্তি/);
    const room=server.rooms.get(seatA.roomCode)!;const viewA=room.sync(seatA.sessionToken);assert.equal(viewA.players.length,4);
    p=event(b,"s_troll_reaction",x=>x.text.includes("দাবা"));a.emit("c_troll_reaction",{trollId:"think-fast"});const troll=await p;assert.equal(troll.senderName,"A");
    for(const t of room.tokens.filter(t=>t!==seatA.sessionToken))for(const card of room.player(t).hand)assert.ok(!JSON.stringify(viewA).includes(card.id));
  }finally{for(const s of clients)s.disconnect();await server.close()}
});
