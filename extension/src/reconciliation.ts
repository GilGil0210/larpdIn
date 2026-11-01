import type {Operation} from './operation';
import {snapshot,type Snapshot} from './snapshot';
import {profileKey} from './storage';
/** A live read reports observations only; it never authorizes replay of a submission. */
export function reconcileSnapshot(operation:Operation,raw:Snapshot):{outcome:'unchanged'|'target-content-observed'|'changed';observedAt:string}{
 const current=snapshot.parse(raw);if(profileKey(current.profileUrl)!==profileKey(operation.profileUrl))throw Error('Reconciliation belongs to a different profile');
 const comparable=(value:Snapshot)=>{const {capturedAt,...rest}=value;return JSON.stringify(rest)};
 return {outcome:comparable(current)===comparable(operation.before)?'unchanged':JSON.stringify(current.content)===JSON.stringify(operation.target)?'target-content-observed':'changed',observedAt:current.capturedAt};
}
