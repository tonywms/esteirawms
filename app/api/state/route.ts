import { loadState } from "@/lib/storage";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){try{return Response.json(await loadState(),{headers:{"Cache-Control":"no-store"}})}catch{return Response.json({error:"Falha ao carregar dados."},{status:500})}}
