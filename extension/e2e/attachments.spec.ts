import {test,expect} from '@playwright/test';
test('attachment bytes survive reload and missing or corrupt data is rejected',async({page})=>{
 await page.goto('/');
 const ref=await page.evaluate(async()=>{const {storeAttachment}=await import('/src/attachmentStore.ts');return storeAttachment(new Blob(['sample data'],{type:'text/plain'}))});
 await page.reload();
 expect(await page.evaluate(async ref=>{const {readAttachment}=await import('/src/attachmentStore.ts');return (await readAttachment(ref)).text()},ref)).toBe('sample data');
 expect(await page.evaluate(async ref=>{const {readAttachment}=await import('/src/attachmentStore.ts');try{await readAttachment({...ref,size:ref.size+1});return false}catch{return true}},ref)).toBe(true);
});
