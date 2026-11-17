import {loadState} from "@/lib/storage";
export const runtime="nodejs";
export async function GET(){const text=JSON.stringify(await loadState(),null,2);return new Response(text,{headers:{"Content-Type":"application/json; charset=utf-8","Content-Disposition":`attachment; filename="wms-control-tower-backup-${new Date().toISOString().slice(0,10)}.json"`,"Cache-Control":"no-store"}})}
