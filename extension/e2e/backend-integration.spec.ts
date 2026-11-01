import {test,expect,chromium} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

// Opt in after starting the backend with its deterministic mock provider.
test('unpacked extension works with the backend contract',async()=>{
 test.skip(process.env.LARPDIN_INTEGRATION !== '1','Requires the local backend and mock provider');
 test.setTimeout(150000);
 const userData=await fs.mkdtemp(path.join(os.tmpdir(),'larpdin-backend-e2e-'));
 let context:Awaited<ReturnType<typeof chromium.launchPersistentContext>>|undefined;
 try {
  const extensionPath=path.resolve('dist');
  context=await chromium.launchPersistentContext(userData,{headless:true,channel:'chromium',args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
  let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker');
  const page=await context.newPage();await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
  await page.getByLabel('Backend URL').fill('http://localhost:3000');
  await page.getByLabel('LinkedIn profile URL').fill('https://www.linkedin.com/in/example/');
  await page.getByLabel('Profile JSON').fill(JSON.stringify({headline:'Software Engineer',location:'Seattle',industry:'Software Development',about:'I build software.',education:[]}));
  await page.getByLabel('Brief').fill('Machine learning in Toronto, University of Toronto');
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Candidate 3'}).or(page.getByRole('alert'))).toBeVisible({timeout:120000});
  if(await page.getByRole('alert').isVisible())throw new Error(`Generation failed: ${await page.getByRole('alert').textContent()}`);
  const first=page.getByRole('region',{name:'Candidate 1'});
  for(let i=1;i<=3;i++){const option=page.getByRole('region',{name:`Candidate ${i}`});await expect(option.getByLabel('Location')).toHaveValue(/Toronto/i);await expect(option.getByLabel('School').first()).toHaveValue(/University of Toronto/i)}
  const name=await first.getByLabel('Persona name',{exact:true}).inputValue();
  await first.getByRole('button',{name:'Save candidate'}).click();
  await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
 } finally {await context?.close();await fs.rm(userData,{recursive:true,force:true})}
});
