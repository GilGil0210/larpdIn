import {test,expect} from '@playwright/test';
test('attachment bytes survive reload and missing or corrupt data is rejected',async({page})=>{
 await page.goto('/');
 const ref=await page.evaluate(async()=>{const {storeAttachment}=await import('/src/attachmentStore.ts');return storeAttachment(new Blob(['sample data'],{type:'text/plain'}))});
 await page.reload();

 const differentType=await page.evaluate(async()=>{const {storeAttachment}=await import('/src/attachmentStore.ts');return storeAttachment(new Blob(['sample data'],{type:'application/octet-stream'}))});
 expect(await page.evaluate(async ref=>{const {readAttachment}=await import('/src/attachmentStore.ts');return (await readAttachment(ref)).type},ref)).toBe('text/plain');
 expect(await page.evaluate(async ref=>{const {readAttachment}=await import('/src/attachmentStore.ts');return (await readAttachment(ref)).type},differentType)).toBe('application/octet-stream');
 expect(await page.evaluate(async ref=>{const {readAttachment}=await import('/src/attachmentStore.ts');return (await readAttachment(ref)).text()},ref)).toBe('sample data');
 expect(await page.evaluate(async ref=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('larpdin-attachments',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});await new Promise<void>((resolve,reject)=>{const tx=db.transaction('blobs','readwrite');tx.objectStore('blobs').put(new Blob(['other data!'],{type:'text/plain'}),`${ref.sha256}:${ref.type}`);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});db.close();const {readAttachment}=await import('/src/attachmentStore.ts');try{await readAttachment(ref);return false}catch{return true}},ref)).toBe(true);
});
test('refuses to store attachments when capacity cannot be established',async({page})=>{
 await page.goto('/');const rejected=await page.evaluate(async()=>{const {storeAttachment}=await import('/src/attachmentStore.ts');const original=navigator.storage.estimate;try{navigator.storage.estimate=async()=>({});await storeAttachment(new Blob(['x']));return false}catch{return true}finally{navigator.storage.estimate=original}});expect(rejected).toBe(true);
});
