import type { Namespace, Server, Socket } from "socket.io";
import { z } from "zod";

const uuid = z.string().uuid();
const code = z.string().regex(/^[A-Z2-9]{4}$/);
const name = z.string().trim().min(1).max(24);
const avatar = z.string().trim().min(1).max(8);
const reason = z.enum(["harassment", "spam", "hate", "sexual", "threats", "cheating", "voice", "other"]);
const profileSchema = z.object({ displayName: name, avatar }).passthrough();
const roomSchema = z.object({ roomCode: code, sessionToken: uuid }).passthrough();
const stateSchema = z.object({
  roomCode: code,
  players: z.array(z.object({ token: uuid, name, avatar, isBot: z.boolean() }).passthrough()),
}).passthrough();
const reportSchema = z.object({ sessionToken: uuid, targetToken: uuid, reason, note: z.string().trim().max(180).optional().default("") }).strict();

type Identity = { token: string; roomCode: string; socketId: string; name: string; avatar: string; updatedAt: number };
type PlayerView = { token: string; name: string; avatar: string; isBot: boolean };
type Report = { id: string; roomCode: string; reporter: string; target: string; reason: z.infer<typeof reason>; note: string; at: number };

export function registerFlexSafetyHub(io: Server) {
  const nsp: Namespace = io.of("/flex");
  const identities = new Map<string, Identity>();
  const socketToken = new Map<string, string>();
  const pendingProfiles = new Map<string, { name: string; avatar: string }>();
  const roomPlayers = new Map<string, Map<string, PlayerView>>();
  const reports: Report[] = [];
  const recentByToken = new Map<string, number[]>();
  const fingerprints = new Map<string, number>();

  const rateAllowed = (token: string) => {
    const now=Date.now(); const recent=(recentByToken.get(token)??[]).filter((at)=>now-at<5*60_000);
    if(recent.length>=3){recentByToken.set(token,recent);return false} recent.push(now);recentByToken.set(token,recent);return true;
  };

  nsp.on("connection", (socket: Socket) => {
    const captureProfile = (raw: unknown) => {
      const parsed=profileSchema.safeParse(raw??{}); if(parsed.success) pendingProfiles.set(socket.id,{name:parsed.data.displayName,avatar:parsed.data.avatar});
    };
    socket.on("f_create_multi",captureProfile); socket.on("f_create_bot",captureProfile); socket.on("f_join",captureProfile);
    socket.on("f_reconnect",(raw:unknown)=>{
      const parsed=z.object({roomCode:code,sessionToken:uuid}).passthrough().safeParse(raw??{});if(!parsed.success)return;
      const known=identities.get(parsed.data.sessionToken);if(!known||known.roomCode!==parsed.data.roomCode)return;
      known.socketId=socket.id;known.updatedAt=Date.now();socketToken.set(socket.id,known.token);
    });

    socket.on("fs_report",(raw:unknown)=>{
      const parsed=reportSchema.safeParse(raw??{});if(!parsed.success)return socket.emit("fs_error",{message:"Report details were invalid."});
      const identity=identities.get(parsed.data.sessionToken);
      if(!identity||identity.socketId!==socket.id)return socket.emit("fs_error",{message:"Flex session expired. Rejoin the room first."});
      const target=roomPlayers.get(identity.roomCode)?.get(parsed.data.targetToken);
      if(!target)return socket.emit("fs_error",{message:"That player is no longer in this Flex room."});
      if(target.isBot)return socket.emit("fs_error",{message:"Bots do not need reports."});
      if(target.token===identity.token)return socket.emit("fs_error",{message:"You cannot report yourself."});
      if(!rateAllowed(identity.token))return socket.emit("fs_error",{message:"Report limit reached. Try again later."});
      const now=Date.now(),fingerprint=`${identity.token}:${target.token}:${parsed.data.reason}`;
      if(now-(fingerprints.get(fingerprint)??0)<60_000)return socket.emit("fs_error",{message:"That report was already submitted recently."});
      fingerprints.set(fingerprint,now);
      const report:Report={id:`flex-${now.toString(36)}-${Math.random().toString(36).slice(2,8)}`,roomCode:identity.roomCode,reporter:identity.name,target:target.name,reason:parsed.data.reason,note:parsed.data.note,at:now};
      reports.unshift(report);if(reports.length>500)reports.length=500;
      console.warn("[DBT FLEX SAFETY REPORT]",JSON.stringify({id:report.id,roomCode:report.roomCode,reporter:report.reporter,target:report.target,reason:report.reason,at:report.at}));
      socket.emit("fs_ack",{id:report.id,target:report.target});
    });

    socket.onAnyOutgoing((event:string,...args:unknown[])=>{
      if(event==="f_room"){
        const parsed=roomSchema.safeParse(args[0]);if(!parsed.success)return;
        const profile=pendingProfiles.get(socket.id)??{name:"Flex Player",avatar:"⚡"};pendingProfiles.delete(socket.id);
        const identity:Identity={token:parsed.data.sessionToken,roomCode:parsed.data.roomCode,socketId:socket.id,name:profile.name,avatar:profile.avatar,updatedAt:Date.now()};identities.set(identity.token,identity);socketToken.set(socket.id,identity.token);
      }
      if(event==="f_state"){
        const parsed=stateSchema.safeParse(args[0]);if(!parsed.success)return;
        roomPlayers.set(parsed.data.roomCode,new Map(parsed.data.players.map((p)=>[p.token,{token:p.token,name:p.name,avatar:p.avatar,isBot:p.isBot}])));
        const token=socketToken.get(socket.id);const identity=token?identities.get(token):undefined;if(identity)identity.updatedAt=Date.now();
      }
      if(event==="f_left"){
        const token=socketToken.get(socket.id);const identity=token?identities.get(token):undefined;if(identity)identity.updatedAt=Date.now();
      }
    });

    socket.on("disconnect",()=>{pendingProfiles.delete(socket.id);const token=socketToken.get(socket.id);socketToken.delete(socket.id);const identity=token?identities.get(token):undefined;if(identity&&identity.socketId===socket.id)identity.updatedAt=Date.now()});
  });

  const cleanup=setInterval(()=>{
    const now=Date.now(),identityCutoff=now-45*60_000,fpCutoff=now-24*60*60_000;
    for(const [token,identity] of identities)if(identity.updatedAt<identityCutoff){identities.delete(token);recentByToken.delete(token)}
    for(const [key,at] of fingerprints)if(at<fpCutoff)fingerprints.delete(key);
  },30*60_000);cleanup.unref();
  return {reports,close:()=>clearInterval(cleanup)};
}
