import {z} from 'zod';
import {snapshot,type Snapshot} from './snapshot';
import {operation,type Operation} from './operation';
import {profileKey} from './storage';
const historySchema=z.object({original:snapshot,undo:snapshot.nullable(),activePersonaId:z.string().uuid().nullable(),undoPersonaId:z.string().uuid().nullable().default(null)}).strict();
export type History=z.infer<typeof historySchema>;
const keyFor=(url:string)=>`history:${profileKey(url)}`;
export async function loadHistory(url:string):Promise<History|null> {
 const key=keyFor(url), data=await chrome.storage.local.get(key);
 if(!data[key]) return null;
 const result=historySchema.parse(data[key]);
 if(profileKey(result.original.profileUrl)!==profileKey(url) || (result.undo && profileKey(result.undo.profileUrl)!==profileKey(url))) throw new Error('History belongs to a different profile');
 return result;
}
/** Capture the original once; never replace it with a later persona. */
export async function saveOriginal(original:Snapshot):Promise<History> {
 const checked=snapshot.parse(original), key=keyFor(checked.profileUrl);
 const existing=await loadHistory(checked.profileUrl);
 if(existing) return existing;
 const history=historySchema.parse({original:checked,undo:null,activePersonaId:null,undoPersonaId:null});
 await chrome.storage.local.set({[key]:history});return history;
}
/** Only a fully verified operation may change the active persona or undo point. */
export async function commitSwitch(raw:Operation,personaId:string):Promise<History> {
 const op=operation.parse(raw);
 if(op.status!=='complete' || Object.values(op.sections).some(x=>x!=='verified')) throw new Error('Switch has not been fully verified');
 const key=keyFor(op.profileUrl), history=await loadHistory(op.profileUrl);
 if(!history) throw new Error('Original snapshot is missing');
 const updated=historySchema.parse({...history,undo:op.before,undoPersonaId:history.activePersonaId,activePersonaId:personaId});
 await chrome.storage.local.set({[key]:updated});return updated;
}

/** Record a verified restore; the prior state becomes the new undo point. */
export async function commitRestore(raw:Operation,activePersonaId:string|null):Promise<History>{
 const op=operation.parse(raw);if(!op.destination||op.status!=='complete'||Object.values(op.sections).some(x=>x!=='verified'))throw new Error('Restore has not been fully verified');
 const key=keyFor(op.profileUrl),history=await loadHistory(op.profileUrl);if(!history)throw new Error('Original snapshot is missing');
 const updated=historySchema.parse({...history,undo:op.before,undoPersonaId:history.activePersonaId,activePersonaId});await chrome.storage.local.set({[key]:updated});return updated;
}
