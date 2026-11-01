import {test,expect} from '@playwright/test';
test('attachment bytes survive reload and missing or corrupt data is rejected',async({page})=>{
 await page.goto('/');
 const ref=await page.evaluate(async()=>{const {storeAttachment}=await import('/src/attachmentStore.ts');return storeAttachment(new Blob(['sample data'],{type:'text/plain'}))});
 await page.reload();
 expect(await page.evaluate(async ref=>{const {readAttachment}=await import('/src/attachmentStore.ts');return (await readAttachment(ref)).text()},ref)).toBe('sample data');
 expect(await page.evaluate(async ref=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('larpdin-attachments',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});await new Promise<void>((resolve,reject)=>{const tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(new Blob(['other data!'],{type:'text/plain'}),ref.sha256);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close();const {readAttachment}=await import('/src/attachmentStore.ts');try{await readAttachment(ref);return false}catch{return true}},ref)).toBe(true);
});
