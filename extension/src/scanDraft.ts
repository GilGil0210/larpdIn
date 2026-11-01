import {z} from 'zod';
import {educationRecord} from './snapshot';
import {profileKey} from './storage';
const draft=z.object({profileUrl:z.string(),capturedAt:z.string().datetime(),educationRecords:z.array(educationRecord),complete:z.literal(false)}).strict();
export type ScanDraft=z.infer<typeof draft>;
export async function saveScanDraft(input:ScanDraft):Promise<void>{const checked=draft.parse(input);const key=`scan-draft:${profileKey(checked.profileUrl)}`;await chrome.storage.local.set({[key]:checked})}
export async function loadScanDraft(url:string):Promise<ScanDraft|null>{const key=`scan-draft:${profileKey(url)}`;const data=await chrome.storage.local.get(key);if(!data[key])return null;const result=draft.parse(data[key]);if(profileKey(result.profileUrl)!==profileKey(url))throw new Error('Scan draft belongs to a different profile');return result}
