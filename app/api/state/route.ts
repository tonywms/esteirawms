import { loadState } from "@/lib/storage";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(){try{return Response.json(await loadState(),{headers:{"Cache-Control":"no-store"}})}catch(e){return Response.json({error:e instanceof Error&&e.message.startsWith("Armazenamento")?e.message:"Falha ao carregar dados."},{status:500})}}
