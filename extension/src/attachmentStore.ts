/** Private, content-addressed attachment storage. References carry no expiring URLs. */
export type AttachmentRef={version:1;sha256:string;size:number;type:string};
const dbName='larpdin-attachments',storeName='blobs';
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open(dbName,1);request.onupgradeneeded=()=>request.result.createObjectStore(storeName);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('Could not open attachment storage'))})}
function digest(bytes:ArrayBuffer):Promise<string>{return crypto.subtle.digest('SHA-256',bytes).then(hash=>Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''))}
const keyFor=(ref:AttachmentRef)=>`${ref.sha256}:${ref.type}`;
function valid(ref:AttachmentRef){if(ref.version!==1||!/^([a-f0-9]{64})$/.test(ref.sha256)||!Number.isSafeInteger(ref.size)||ref.size<0||typeof ref.type!=='string')throw Error('Invalid attachment reference')}
async function transaction<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{const db=await database();try{return await new Promise<T>((resolve,reject)=>{const tx=db.transaction(storeName,mode),request=work(tx.objectStore(storeName));let result:T;request.onsuccess=()=>{result=request.result};request.onerror=()=>reject(request.error||Error('Attachment storage failed'));tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||Error('Attachment storage failed'));tx.onerror=()=>reject(tx.error||Error('Attachment storage failed'))})}finally{db.close()}}
export async function storeAttachment(blob:Blob):Promise<AttachmentRef>{
 const estimate=await navigator.storage.estimate();if(estimate.quota===undefined||estimate.usage===undefined||!Number.isFinite(estimate.quota)||!Number.isFinite(estimate.usage))throw Error('Available attachment storage could not be verified');if(estimate.quota-estimate.usage<blob.size)throw Error('Not enough storage for the education attachment');
 const bytes=await blob.arrayBuffer(),sha256=await digest(bytes),ref:AttachmentRef={version:1,sha256,size:bytes.byteLength,type:blob.type};
 await transaction('readwrite',store=>store.put(blob,keyFor(ref)));
 // Verify persistence and integrity before allowing a snapshot to refer to it.
 await readAttachment(ref);return ref;
}
export async function readAttachment(ref:AttachmentRef):Promise<Blob>{valid(ref);const blob=await transaction<Blob|undefined>('readonly',store=>store.get(keyFor(ref)));if(!(blob instanceof Blob))throw Error('Education attachment is missing');const bytes=await blob.arrayBuffer();if(bytes.byteLength!==ref.size||blob.type!==ref.type||await digest(bytes)!==ref.sha256)throw Error('Education attachment failed its integrity check');return blob}
