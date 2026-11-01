import {candidate, type Profile} from './contract';
import {z} from 'zod';
export const savedPersona = candidate.extend({id:z.string().uuid(),createdAt:z.string().datetime()});
export type SavedPersona = z.infer<typeof savedPersona>;
export function profileKey(raw:string):string {
 const u=new URL(raw);
 if(u.protocol!=='https:' || u.hostname!=='www.linkedin.com' || !/^\/in\/[^/]+\/?$/.test(u.pathname) || u.search || u.hash) throw new Error('Enter a LinkedIn profile URL like https://www.linkedin.com/in/name/');
 return `profile:${u.pathname.replace(/\/$/,'').toLowerCase()}`;
}
export async function loadPersonas(url:string):Promise<SavedPersona[]> {
 const key=profileKey(url); const data=await chrome.storage.local.get(key);
 return z.array(savedPersona).parse(data[key] ?? []);
}
export async function savePersona(url:string, value:unknown):Promise<SavedPersona[]> {
 const item=savedPersona.parse(value); const key=profileKey(url); const items=await loadPersonas(url); items.push(item); await chrome.storage.local.set({[key]:items}); return items;
}
export type Snapshot = {content:Profile; capturedAt:string; complete:false};
