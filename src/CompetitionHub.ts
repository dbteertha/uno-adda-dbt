import { randomInt, randomUUID } from "node:crypto";
import type { Namespace, Server, Socket } from "socket.io";
import { z } from "zod";
import type { GameRoom } from "./GameRoom.js";

const clientIdSchema = z.string().uuid();
const nameSchema = z.string().trim().min(1).max(24);
const avatarSchema = z.string().trim().min(1).max(8);
const roomCodeSchema = z.string().regex(/^[A-Z2-9]{4}$/);
const tournamentCodeSchema = z.string().regex(/^[A-Z2-9]{6}$/);
const profileSchema = z.object({ clientId: clientIdSchema, displayName: nameSchema, avatar: avatarSchema }).strict();
const queueSchema = profileSchema;
const tournamentCreateSchema = profileSchema.extend({ size: z.union([z.literal(4), z.literal(8)]) }).strict();
const tournamentJoinSchema = profileSchema.extend({ code: tournamentCodeSchema }).strict();
const roomReadySchema = z.object({ matchId: z.string().uuid(), roomCode: roomCodeSchema }).strict();
const resumeSchema = z.object({ clientId: clientIdSchema }).strict();
const emptySchema = z.object({}).strict();

type RatingProfile = { id: string; name: string; avatar: string; rating: number; games: number; wins: number; updatedAt: number };
type QueueEntry = { clientId: string; socketId: string; name: string; avatar: string; queuedAt: number };
type RankedMatch = { id: string; aId: string; bId: string; aName: string; bName: string; roomCode: string | null; status: "forming" | "playing" | "finished"; createdAt: number; winnerId: string | null };
type TournamentPlayer = { id: string; name: string; avatar: string };
type TournamentMatch = { id: string; round: number; index: number; aId: string; bId: string; roomCode: string | null; status: "forming" | "playing" | "finished"; winnerId: string | null };
type Tournament = { code: string; hostId: string; size: 4 | 8; status: "waiting" | "playing" | "finished"; entrants: TournamentPlayer[]; rounds: TournamentMatch[][]; winnerId: string | null; createdAt: number; updatedAt: number };

function tournamentCode(existing: Map<string, Tournament>) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do { code = Array.from({ length: 6 }, () => chars[randomInt(chars.length)]).join(""); } while (existing.has(code));
  return code;
}

function shuffle<T>(items: T[]) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = randomInt(i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function registerCompetitionHub(io: Server, rooms: Map<string, GameRoom>) {
  const ns: Namespace = io.of("/competition");
  const queue: QueueEntry[] = [];
  const socketByClient = new Map<string, string>();
  const clientBySocket = new Map<string, string>();
  const profiles = new Map<string, RatingProfile>();
  const rankedMatches = new Map<string, RankedMatch>();
  const tournaments = new Map<string, Tournament>();
  const clientTournament = new Map<string, string>();
  const finishedRooms = new Set<string>();

  const socketFor = (clientId: string) => { const id = socketByClient.get(clientId); return id ? ns.sockets.get(id) : undefined; };
  const emitClient = (clientId: string, event: string, payload: unknown) => socketFor(clientId)?.emit(event, payload);
  const profile = (id: string, name: string, avatar: string) => {
    const current = profiles.get(id) ?? { id, name, avatar, rating: 1000, games: 0, wins: 0, updatedAt: Date.now() };
    current.name = name; current.avatar = avatar; current.updatedAt = Date.now(); profiles.set(id, current); return current;
  };
  const leaderboard = () => [...profiles.values()].filter((p) => p.games > 0).sort((a,b) => b.rating-a.rating || b.wins-a.wins || b.games-a.games).slice(0,50).map((p) => ({ clientId:p.id,name:p.name,avatar:p.avatar,rating:p.rating,games:p.games,wins:p.wins }));

  function ratingDelta(a: RatingProfile, b: RatingProfile, aWon: boolean) {
    const expected = 1 / (1 + Math.pow(10, (b.rating - a.rating) / 400));
    return Math.round(24 * ((aWon ? 1 : 0) - expected));
  }

  function applyRatedResult(aId: string, bId: string, winnerId: string) {
    const a = profiles.get(aId), b = profiles.get(bId); if (!a || !b) return;
    const da = ratingDelta(a,b,winnerId===aId); const db = ratingDelta(b,a,winnerId===bId);
    a.rating = Math.max(100, a.rating + da); b.rating = Math.max(100, b.rating + db);
    a.games++; b.games++; if(winnerId===aId)a.wins++; else b.wins++; a.updatedAt=Date.now(); b.updatedAt=Date.now();
    emitClient(aId,"m_rating",{rating:a.rating,delta:da,games:a.games,wins:a.wins});
    emitClient(bId,"m_rating",{rating:b.rating,delta:db,games:b.games,wins:b.wins});
    ns.emit("m_leaderboard",{rows:leaderboard(),persistence:"server-session"});
  }

  function removeFromQueue(clientId: string) {
    const i=queue.findIndex((x)=>x.clientId===clientId); if(i>=0) queue.splice(i,1);
  }

  function tryPair() {
    while(queue.length>=2){
      const a=queue.shift()!;
      let index=queue.findIndex((x)=>x.clientId!==a.clientId && x.name.toLocaleLowerCase()!==a.name.toLocaleLowerCase());
      if(index<0){queue.unshift(a);break}
      const b=queue.splice(index,1)[0];
      const match:RankedMatch={id:randomUUID(),aId:a.clientId,bId:b.clientId,aName:a.name,bName:b.name,roomCode:null,status:"forming",createdAt:Date.now(),winnerId:null};
      rankedMatches.set(match.id,match);
      emitClient(a.clientId,"m_pair",{matchId:match.id,role:"host",opponent:{name:b.name,avatar:b.avatar}});
      emitClient(b.clientId,"m_pair",{matchId:match.id,role:"guest",opponent:{name:a.name,avatar:a.avatar}});
    }
    ns.emit("m_queue_status",{queued:queue.length});
  }

  function playerName(t:Tournament,id:string){return t.entrants.find((p)=>p.id===id)?.name??"Player"}
  function tournamentPayload(t:Tournament){
    return {code:t.code,hostId:t.hostId,size:t.size,status:t.status,winnerId:t.winnerId,entrants:t.entrants.map((p)=>({...p})),rounds:t.rounds.map((round)=>round.map((m)=>({id:m.id,round:m.round,index:m.index,aId:m.aId,bId:m.bId,aName:playerName(t,m.aId),bName:playerName(t,m.bId),roomCode:m.roomCode,status:m.status,winnerId:m.winnerId,winnerName:m.winnerId?playerName(t,m.winnerId):null})))};
  }
  function emitTournament(t:Tournament){for(const p of t.entrants)emitClient(p.id,"t_state",tournamentPayload(t))}
  function notifyTournamentMatch(t:Tournament,m:TournamentMatch){
    emitClient(m.aId,"t_match",{code:t.code,matchId:m.id,role:"host",round:m.round,opponent:{id:m.bId,name:playerName(t,m.bId)}});
    emitClient(m.bId,"t_match",{code:t.code,matchId:m.id,role:"guest",round:m.round,opponent:{id:m.aId,name:playerName(t,m.aId)}});
  }
  function makeRound(t:Tournament,ids:string[],roundNumber:number){
    const round:TournamentMatch[]=[];for(let i=0;i<ids.length;i+=2)round.push({id:randomUUID(),round:roundNumber,index:i/2,aId:ids[i],bId:ids[i+1],roomCode:null,status:"forming",winnerId:null});t.rounds.push(round);for(const m of round)notifyTournamentMatch(t,m);emitTournament(t)
  }
  function startTournament(t:Tournament){if(t.status!=="waiting"||t.entrants.length!==t.size)return;t.status="playing";t.updatedAt=Date.now();makeRound(t,shuffle(t.entrants.map((p)=>p.id)),1)}
  function activeTournamentMatch(t:Tournament,matchId:string){for(const round of t.rounds){const m=round.find((x)=>x.id===matchId);if(m)return m}return null}
  function advanceTournament(t:Tournament){
    const round=t.rounds.at(-1);if(!round||round.some((m)=>m.status!=="finished"))return;
    const winners=round.map((m)=>m.winnerId).filter((x):x is string=>!!x);
    if(winners.length===1){t.status="finished";t.winnerId=winners[0];t.updatedAt=Date.now();emitTournament(t);for(const p of t.entrants)emitClient(p.id,"t_finished",{code:t.code,winnerId:t.winnerId,winnerName:playerName(t,t.winnerId)});return}
    makeRound(t,winners,round[0].round+1);t.updatedAt=Date.now();
  }

  function resolveRoomWinner(room:GameRoom,aId:string,bId:string,aName:string,bName:string){
    if(room.state.status!=="ROUND_OVER")return null;const winner=room.history[0]?.winnerName;if(!winner)return null;
    if(winner===aName)return aId;if(winner===bName)return bId;return null;
  }

  ns.on("connection",(socket:Socket)=>{
    let budget=120,at=Date.now();
    const spend=(cost=1)=>{const now=Date.now();budget=Math.min(120,budget+((now-at)/1000)*5);at=now;if(budget<cost)return false;budget-=cost;return true};
    const fail=(message:string)=>socket.emit("m_error",{message});
    const bindClient=(data:{clientId:string;displayName:string;avatar:string})=>{socketByClient.set(data.clientId,socket.id);clientBySocket.set(socket.id,data.clientId);profile(data.clientId,data.displayName,data.avatar)};

    socket.emit("m_leaderboard",{rows:leaderboard(),persistence:"server-session"});socket.emit("m_queue_status",{queued:queue.length});

    socket.on("m_join",(raw:unknown)=>{if(!spend(3))return fail("Queue request throttled.");const p=queueSchema.safeParse(raw);if(!p.success)return fail("Quick-match profile was invalid.");bindClient(p.data);if(clientTournament.has(p.data.clientId))return fail("Leave or finish your tournament before quick match.");removeFromQueue(p.data.clientId);queue.push({clientId:p.data.clientId,socketId:socket.id,name:p.data.displayName,avatar:p.data.avatar,queuedAt:Date.now()});socket.emit("m_queued",{queuedAt:Date.now()});tryPair()});
    socket.on("m_cancel",(raw:unknown)=>{if(!emptySchema.safeParse(raw??{}).success)return;const id=clientBySocket.get(socket.id);if(id){removeFromQueue(id);ns.emit("m_queue_status",{queued:queue.length})}});
    socket.on("m_room_ready",(raw:unknown)=>{const p=roomReadySchema.safeParse(raw);if(!p.success)return fail("Room handoff was invalid.");const id=clientBySocket.get(socket.id);const m=rankedMatches.get(p.data.matchId);if(!id||!m||m.aId!==id||m.status!=="forming")return fail("This quick-match handoff is no longer active.");if(!rooms.has(p.data.roomCode))return fail("Classic room is not ready yet.");m.roomCode=p.data.roomCode;m.status="playing";emitClient(m.bId,"m_room",{matchId:m.id,roomCode:m.roomCode});emitClient(m.aId,"m_room_confirmed",{matchId:m.id,roomCode:m.roomCode})});

    socket.on("t_create",(raw:unknown)=>{if(!spend(4))return fail("Tournament request throttled.");const p=tournamentCreateSchema.safeParse(raw);if(!p.success)return fail("Tournament profile was invalid.");bindClient(p.data);if(clientTournament.has(p.data.clientId))return fail("You already belong to an active tournament.");const code=tournamentCode(tournaments);const t:Tournament={code,hostId:p.data.clientId,size:p.data.size,status:"waiting",entrants:[{id:p.data.clientId,name:p.data.displayName,avatar:p.data.avatar}],rounds:[],winnerId:null,createdAt:Date.now(),updatedAt:Date.now()};tournaments.set(code,t);clientTournament.set(p.data.clientId,code);emitTournament(t)});
    socket.on("t_join",(raw:unknown)=>{if(!spend(3))return fail("Tournament join throttled.");const p=tournamentJoinSchema.safeParse(raw);if(!p.success)return fail("Tournament join details were invalid.");bindClient(p.data);const t=tournaments.get(p.data.code);if(!t||t.status!=="waiting")return fail("That tournament is not accepting players.");if(clientTournament.has(p.data.clientId))return fail("You already belong to an active tournament.");if(t.entrants.some((x)=>x.name.toLocaleLowerCase()===p.data.displayName.toLocaleLowerCase()))return fail("Tournament display names must be unique.");if(t.entrants.length>=t.size)return fail("Tournament is full.");t.entrants.push({id:p.data.clientId,name:p.data.displayName,avatar:p.data.avatar});clientTournament.set(p.data.clientId,t.code);t.updatedAt=Date.now();emitTournament(t);if(t.entrants.length===t.size)startTournament(t)});
    socket.on("t_leave",(raw:unknown)=>{if(!emptySchema.safeParse(raw??{}).success)return;const id=clientBySocket.get(socket.id);const code=id?clientTournament.get(id):undefined;const t=code?tournaments.get(code):undefined;if(!id||!t||t.status!=="waiting")return fail("You can leave only before the bracket starts.");t.entrants=t.entrants.filter((p)=>p.id!==id);clientTournament.delete(id);if(t.hostId===id&&t.entrants[0])t.hostId=t.entrants[0].id;if(!t.entrants.length)tournaments.delete(t.code);else emitTournament(t)});
    socket.on("t_room_ready",(raw:unknown)=>{const p=roomReadySchema.safeParse(raw);if(!p.success)return fail("Tournament room handoff was invalid.");const id=clientBySocket.get(socket.id);const code=id?clientTournament.get(id):undefined;const t=code?tournaments.get(code):undefined;const m=t?activeTournamentMatch(t,p.data.matchId):null;if(!id||!t||!m||m.aId!==id||m.status!=="forming")return fail("Tournament match is no longer waiting for a room.");if(!rooms.has(p.data.roomCode))return fail("Classic room is not ready yet.");m.roomCode=p.data.roomCode;m.status="playing";t.updatedAt=Date.now();emitClient(m.bId,"t_room",{code:t.code,matchId:m.id,roomCode:m.roomCode});emitClient(m.aId,"t_room_confirmed",{code:t.code,matchId:m.id,roomCode:m.roomCode});emitTournament(t)});
    socket.on("t_resume",(raw:unknown)=>{const p=resumeSchema.safeParse(raw);if(!p.success)return;const prior=profiles.get(p.data.clientId);if(prior){socketByClient.set(p.data.clientId,socket.id);clientBySocket.set(socket.id,p.data.clientId)}const code=clientTournament.get(p.data.clientId);const t=code?tournaments.get(code):undefined;if(!t)return;if(!t.entrants.some((x)=>x.id===p.data.clientId))return;socket.emit("t_state",tournamentPayload(t));const current=t.rounds.at(-1)?.find((m)=>m.status!=="finished"&&(m.aId===p.data.clientId||m.bId===p.data.clientId));if(current){socket.emit("t_match",{code:t.code,matchId:current.id,role:current.aId===p.data.clientId?"host":"guest",round:current.round,opponent:{id:current.aId===p.data.clientId?current.bId:current.aId,name:playerName(t,current.aId===p.data.clientId?current.bId:current.aId)}});if(current.roomCode)socket.emit("t_room",{code:t.code,matchId:current.id,roomCode:current.roomCode})}});

    socket.on("disconnect",()=>{const id=clientBySocket.get(socket.id);clientBySocket.delete(socket.id);if(id&&socketByClient.get(id)===socket.id)socketByClient.delete(id);if(id)removeFromQueue(id);ns.emit("m_queue_status",{queued:queue.length})});
  });

  const ticker=setInterval(()=>{
    const now=Date.now();
    for(const [id,m] of rankedMatches){
      if(m.status==="forming"&&now-m.createdAt>2*60_000){m.status="finished";emitClient(m.aId,"m_error",{message:"Quick match expired before room creation."});emitClient(m.bId,"m_error",{message:"Quick match expired before room creation."});continue}
      if(m.status!=="playing"||!m.roomCode||finishedRooms.has(`r:${m.roomCode}`))continue;const room=rooms.get(m.roomCode);if(!room)continue;const winnerId=resolveRoomWinner(room,m.aId,m.bId,m.aName,m.bName);if(!winnerId)continue;m.status="finished";m.winnerId=winnerId;finishedRooms.add(`r:${m.roomCode}`);applyRatedResult(m.aId,m.bId,winnerId);emitClient(m.aId,"m_match_result",{matchId:m.id,winnerId,winnerName:winnerId===m.aId?m.aName:m.bName});emitClient(m.bId,"m_match_result",{matchId:m.id,winnerId,winnerName:winnerId===m.aId?m.aName:m.bName});
    }
    for(const t of tournaments.values()){
      if(t.status!=="playing")continue;const round=t.rounds.at(-1);if(!round)continue;
      for(const m of round){if(m.status!=="playing"||!m.roomCode||finishedRooms.has(`t:${m.id}:${m.roomCode}`))continue;const room=rooms.get(m.roomCode);if(!room)continue;const winner=resolveRoomWinner(room,m.aId,m.bId,playerName(t,m.aId),playerName(t,m.bId));if(!winner)continue;m.status="finished";m.winnerId=winner;finishedRooms.add(`t:${m.id}:${m.roomCode}`);applyRatedResult(m.aId,m.bId,winner);t.updatedAt=now;emitTournament(t)}advanceTournament(t)
    }
    for(const [id,m] of rankedMatches)if(m.status==="finished"&&now-m.createdAt>30*60_000)rankedMatches.delete(id);
    for(const [code,t] of tournaments)if(t.status==="finished"&&now-t.updatedAt>60*60_000){tournaments.delete(code);for(const p of t.entrants)if(clientTournament.get(p.id)===code)clientTournament.delete(p.id)}
  },1000);ticker.unref();

  return { close:()=>clearInterval(ticker), leaderboard };
}
