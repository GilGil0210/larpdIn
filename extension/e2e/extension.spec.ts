import {test,expect,chromium} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {spawn} from 'node:child_process';

test('unpacked extension generates and saves a mock persona',async()=>{
 test.setTimeout(90000);
 const userData=await fs.mkdtemp(path.join(os.tmpdir(),'larpdin-e2e-'));
 const mock=spawn(process.execPath,['mock/server.js'],{cwd:process.cwd(),stdio:'pipe'});
 let context:Awaited<ReturnType<typeof chromium.launchPersistentContext>>|undefined;
 try {
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Mock did not start')),5000);mock.stdout.on('data',data=>{if(String(data).includes('Mock listening')){clearTimeout(timer);resolve()}});mock.once('exit',()=>{clearTimeout(timer);reject(new Error('Mock exited'))})});
  const extensionPath=path.resolve('dist');
  context=await chromium.launchPersistentContext(userData,{headless:true,channel:'chromium',args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
  let worker=context.serviceWorkers()[0]; if(!worker) worker=await context.waitForEvent('serviceworker');
  const id=new URL(worker.url()).host;
  const page=await context.newPage();await page.goto(`chrome-extension://${id}/index.html`);
  await page.getByLabel('Backend URL').fill('http://localhost:8787');await page.getByLabel('Backend URL').blur();
  await page.getByLabel('LinkedIn profile URL').fill('https://www.linkedin.com/in/example/');
  await page.getByLabel('Brief').fill('A fictional profile');
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Candidate 1'})).toBeVisible();
  const first=page.getByRole('region',{name:'Candidate 1'});
  await first.getByLabel('Headline').fill('Edited headline');
  await first.getByRole('button',{name:'Add education'}).click();
  await first.getByLabel('School').fill('University of Toronto');
  await first.getByRole('button',{name:'Save candidate'}).click();
  await expect(page.getByRole('heading',{name:'Mock option 1'})).toBeVisible();
  await page.reload();await page.getByLabel('LinkedIn profile URL').fill('https://www.linkedin.com/in/example/');await page.getByRole('button',{name:'Load saved personas'}).click();
  await expect(page.getByRole('heading',{name:'Mock option 1'})).toBeVisible();
  await expect(page.getByText(/Edited headline/)).toBeVisible();
  await expect(page.getByText(/University of Toronto/)).toBeVisible();

 } finally {await context?.close();mock.kill();await fs.rm(userData,{recursive:true,force:true})}
});

test('worker restart marks a running job interrupted without replaying its checkpoint',async()=>{
 const userData=await fs.mkdtemp(path.join(os.tmpdir(),'larpdin-restart-'));let context:Awaited<ReturnType<typeof chromium.launchPersistentContext>>|undefined;
 try{
  const extensionPath=path.resolve('dist');context=await chromium.launchPersistentContext(userData,{headless:true,channel:'chromium',args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
  let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker');const page=await context.newPage();await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
  await page.evaluate(async()=>{await chrome.runtime.sendMessage({type:'worker-ready'});await chrome.storage.local.set({'switch-job:profile:/in/example':{status:'running'},'operation:profile:/in/example':{status:'running',sections:{intro:'submitting'}}})});
  const cdp=await context.newCDPSession(page);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');
  await page.evaluate(()=>chrome.runtime.sendMessage({type:'worker-ready'}));
  const result=await page.evaluate(()=>chrome.storage.local.get(['switch-job:profile:/in/example','operation:profile:/in/example']));
  expect(result['switch-job:profile:/in/example'].status).toBe('interrupted');expect(result['operation:profile:/in/example'].sections.intro).toBe('submitting');
 }finally{await context?.close();await fs.rm(userData,{recursive:true,force:true})}
});
