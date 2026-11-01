import { z } from 'zod';
export const education = z.object({school:z.string(),degree:z.string(),fieldOfStudy:z.string(),startYear:z.number().int().nullable(),endYear:z.number().int().nullable(),grade:z.string(),activities:z.string(),description:z.string()}).strict();
export const profile = z.object({headline:z.string(),location:z.string(),industry:z.string(),about:z.string(),education:z.array(education)}).strict();
export const candidate = z.object({name:z.string(),description:z.string(),content:profile}).strict();
export const response = z.object({personas:z.tuple([candidate,candidate,candidate])}).strict();
export type Profile = z.infer<typeof profile>;
export class GenerationError extends Error {
 constructor(public readonly code:string,message:string,public readonly status?:number){super(message);this.name='GenerationError'}
}
const errorBody=z.object({error:z.object({code:z.string(),message:z.string()})});
export async function generate(url:string, content:Profile, brief:string) {
 let base:URL;
 try {base=new URL(url)} catch {throw new GenerationError('invalid_url','Enter a valid backend URL.')}
 if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost','127.0.0.1'].includes(base.hostname))) throw new GenerationError('invalid_url','Backend must use HTTPS (HTTP is allowed for localhost).');
 if(base.username || base.password || base.search || base.hash) throw new GenerationError('invalid_url','Backend URL must not contain credentials, a query, or a fragment.');
 const payload={profile:profile.parse(content),brief:z.string().parse(brief)};
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),120000);
 try {
  let res:Response;
  try {res=await fetch(new URL('/api/personas/generate',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'error',signal:controller.signal})}
  catch(error){if(controller.signal.aborted)throw new GenerationError('timeout','The generation request timed out.');throw new GenerationError('network_error',`Could not reach the backend: ${error instanceof Error?error.message:'network error'}`)}
  let json:unknown;
  try {json=await res.json()} catch {throw new GenerationError('invalid_response',`Backend returned invalid JSON (HTTP ${res.status}).`,res.status)}
  if(!res.ok){const parsed=errorBody.safeParse(json);throw new GenerationError(parsed.success?parsed.data.error.code:'backend_error',parsed.success?parsed.data.error.message:`Backend error ${res.status}`,res.status)}
  const parsed=response.safeParse(json);if(!parsed.success)throw new GenerationError('invalid_response','Backend returned an invalid persona response.',res.status);
  return parsed.data.personas;
 } finally {clearTimeout(timer)}
}
