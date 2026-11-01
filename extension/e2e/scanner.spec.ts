import {test,expect,chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:https';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {AddressInfo} from 'node:net';

test('unpacked extension scans a synthetic signed-in profile through isolated HTTPS tabs',async()=>{
 test.setTimeout(90000);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'larpdin-scan-'));
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'key.pem'),'-out',path.join(dir,'cert.pem'),'-days','1','-subj','/CN=www.linkedin.com'],{stdio:'ignore'});
 const requests:string[]=[];let writes=0;
 const pages:Record<string,string>={
  '/in/example/':'<main><a href="/in/example/edit/forms/summary/new/">Add a summary</a></main>',
  '/in/example/edit/intro/':'<main><label>First name<input value="A"></label><label>Last name<input value="B"></label><label>Additional name<input></label><label>Pronouns<select><option>None</option></select></label><label>Education<select><option>School</option></select></label><label>Headline<textarea>Student</textarea></label><label>Country/Region<input value="Canada"></label><label>City<input value="Toronto"></label><label>Industry<input value="Technology"></label><button onclick="document.body.dataset.saved=document.querySelector(\'textarea\').value">Save</button></main>',
  '/in/example/edit/forms/summary/new/':'<main><textarea aria-label="Summary">About me</textarea></main>',
  '/in/example/edit/forms/education/new/':`<main><label>School<input aria-controls="schools"></label><div id="schools"><div role="option">University of Toronto</div></div><label>Degree<input></label><label>Field of study<input></label><select aria-label="Start month"><option>Month</option><option>September</option></select><select aria-label="Start year"><option>Year</option><option>2020</option></select><select aria-label="End month"><option>Month</option></select><select aria-label="End year"><option>Year</option></select><label>Grade<input></label><label>Activities and societies<textarea></textarea></label><label>Description<textarea></textarea></label><button role="switch" aria-label="Notify network" aria-checked="false"></button><button id="save">Save</button><script>document.querySelector('[role=option]').onclick=()=>{const input=document.querySelector('input');input.value='University of Toronto';input.setAttribute('aria-expanded','false')};document.querySelector('#save').onclick=()=>document.body.dataset.saved='yes'</script></main>`,
  '/in/example/details/education/':'<main><a href="/in/example/details/education/edit/forms/123/">Edit school</a></main>',
  '/in/example/details/education/edit/forms/123/':'<main><label>School<input value="Example University"></label><label>Degree<input value="BA"></label><label>Field of study<input value="History"></label><select aria-label="Start month"><option>September</option></select><select aria-label="Start year"><option>2020</option></select><select aria-label="End month"><option>Month</option></select><select aria-label="End year"><option>Year</option></select><label>Grade<input></label><label>Activities and societies<textarea></textarea></label><label>Description<textarea></textarea></label><button role="switch" aria-label="Notify network" aria-checked="true"></button><button onclick="document.body.dataset.deleted=\'yes\'">Delete education</button><button>Save</button></main>'
 };
 const server=createServer({key:await fs.readFile(path.join(dir,'key.pem')),cert:await fs.readFile(path.join(dir,'cert.pem'))},(req,res)=>{const pathname=new URL(req.url||'/', 'https://www.linkedin.com').pathname;requests.push(pathname);if(req.method!=='GET')writes++;if(pathname==='/in/me/'){res.writeHead(302,{Location:'/in/example/'});return res.end()}const body=pages[pathname];res.writeHead(body?200:404,{'Content-Type':'text/html'});res.end(body||'not found')});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as AddressInfo).port;
 let context:Awaited<ReturnType<typeof chromium.launchPersistentContext>>|undefined;
 try {
  const extensionPath=path.resolve('dist');
  context=await chromium.launchPersistentContext(path.join(dir,'profile'),{headless:true,channel:'chromium',args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`,`--host-resolver-rules=MAP www.linkedin.com 127.0.0.1:${port}, MAP * ~NOTFOUND, EXCLUDE localhost`,'--no-proxy-server','--ignore-certificate-errors']});
  let worker=context.serviceWorkers()[0];if(!worker)worker=await context.waitForEvent('serviceworker');
  const page=await context.newPage();await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
  await page.getByRole('button',{name:'Scan profile',exact:true}).click();
  await expect(page.getByRole('status')).not.toHaveText('Reading intro',{timeout:25000});
  const alert=await page.getByRole('alert').allTextContents();if(alert.length)throw new Error(`Scan failed: ${alert.join(', ')}`);
  await expect(page.getByRole('status')).toHaveText('Scan finished',{timeout:60000});
  expect(JSON.parse(await page.getByLabel('Profile JSON').inputValue())).toMatchObject({headline:'Student',location:'Toronto',industry:'Technology',about:'About me',education:[{school:'Example University',startYear:2020}]});
  expect(requests).toContain('/in/me/');expect(requests).toContain('/in/example/details/education/edit/forms/123/');
  await page.evaluate(async()=>chrome.storage.local.set({'profile:/in/example':[{id:'00000000-0000-4000-8000-000000000000',createdAt:'2026-01-01T00:00:00.000Z',name:'Test persona',description:'',content:{headline:'Changed',location:'Toronto',industry:'Technology',about:'About me',education:[]}}]}));
  await page.getByRole('button',{name:'Load saved personas'}).click();
  await page.getByRole('button',{name:'Apply Test persona'}).click();
  await expect(page.getByRole('status')).toHaveText('Switch stopped',{timeout:60000});
  await expect(page.getByRole('alert')).toContainText('Education list completeness could not be verified');
  expect(writes).toBe(0);

  const tabId=await page.evaluate(async()=>{const tab=await chrome.tabs.create({url:'https://www.linkedin.com/in/example/edit/intro/',active:false});return tab.id!});
  await expect.poll(async()=>page.evaluate(id=>chrome.tabs.get(id).then(tab=>tab.status),tabId)).toBe('complete');
  await page.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['editBridge.js']}),tabId);
  const before=await page.evaluate(id=>chrome.tabs.sendMessage(id,{action:'readIntro',profileUrl:'https://www.linkedin.com/in/example/'}),tabId);
  expect(before.ok).toBe(true);
  const stale=await page.evaluate(({id,values})=>chrome.tabs.sendMessage(id,{action:'submitIntro',profileUrl:'https://www.linkedin.com/in/example/',before:{...values,headline:'stale'},target:{headline:'Changed',location:'Toronto',industry:'Technology'}}),{id:tabId,values:before.value});
  expect(stale.ok).toBe(false);expect(stale.error).toContain('changed since');
  const saved=await page.evaluate(({id,values})=>chrome.tabs.sendMessage(id,{action:'submitIntro',profileUrl:'https://www.linkedin.com/in/example/',before:values,target:{headline:'Changed',location:'Toronto',industry:'Technology'}}),{id:tabId,values:before.value});
  expect(saved).toEqual({ok:true,submitted:true});
  const value=await page.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>document.body.dataset.saved}))[0].result,tabId);expect(value).toBe('Changed');
  await page.evaluate(id=>chrome.tabs.remove(id),tabId);
  const educationTab=await page.evaluate(async()=>{const tab=await chrome.tabs.create({url:'https://www.linkedin.com/in/example/details/education/edit/forms/123/',active:false});return tab.id!});
  await expect.poll(async()=>page.evaluate(id=>chrome.tabs.get(id).then(tab=>tab.status),educationTab)).toBe('complete');
  await page.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['editBridge.js']}),educationTab);
  const beforeEducation={school:'Example University',degree:'BA',fieldOfStudy:'History',startYear:2020,endYear:null,grade:'',activities:'',description:'',startMonth:9,endMonth:null};
  const denied=await page.evaluate(({id,before})=>chrome.tabs.sendMessage(id,{action:'deleteEducation',profileUrl:'https://www.linkedin.com/in/example/',id:'123',before}),{id:educationTab,before:beforeEducation});
  expect(denied.ok).toBe(false);expect(denied.error).toContain('network notifications');
  await page.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},func:()=>document.querySelector('[role=switch]')!.setAttribute('aria-checked','false')}),educationTab);
  const unknownAttachments=await page.evaluate(({id,before})=>chrome.tabs.sendMessage(id,{action:'deleteEducation',profileUrl:'https://www.linkedin.com/in/example/',id:'123',before}),{id:educationTab,before:beforeEducation});
  expect(unknownAttachments.ok).toBe(false);expect(unknownAttachments.error).toContain('attachments could not be verified');
  await page.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},func:()=>{for(const label of ['Education skills','Education media']){const list=document.createElement('div');list.setAttribute('role','list');list.setAttribute('aria-label',label);list.setAttribute('aria-setsize','0');document.querySelector('main')!.append(list)}}}),educationTab);
  const staleEducation=await page.evaluate(({id,before})=>chrome.tabs.sendMessage(id,{action:'deleteEducation',profileUrl:'https://www.linkedin.com/in/example/',id:'123',before:{...before,grade:'changed'}}),{id:educationTab,before:beforeEducation});
  expect(staleEducation.ok).toBe(false);expect(staleEducation.error).toContain('changed since');
  const deleted=await page.evaluate(({id,before})=>chrome.tabs.sendMessage(id,{action:'deleteEducation',profileUrl:'https://www.linkedin.com/in/example/',id:'123',before}),{id:educationTab,before:beforeEducation});
  expect(deleted).toEqual({ok:true,submitted:true});
  expect(await page.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>document.body.dataset.deleted}))[0].result,educationTab)).toBe('yes');
  await page.evaluate(id=>chrome.tabs.remove(id),educationTab);
  const newTab=await page.evaluate(async()=>{const tab=await chrome.tabs.create({url:'https://www.linkedin.com/in/example/edit/forms/education/new/',active:false});return tab.id!});
  await expect.poll(async()=>page.evaluate(id=>chrome.tabs.get(id).then(tab=>tab.status),newTab)).toBe('complete');
  await page.evaluate(id=>chrome.scripting.executeScript({target:{tabId:id},files:['editBridge.js']}),newTab);
  const created=await page.evaluate(id=>chrome.tabs.sendMessage(id,{action:'submitEducation',profileUrl:'https://www.linkedin.com/in/example/',target:{school:'University of Toronto',degree:'BA',fieldOfStudy:'History',startYear:2020,endYear:null,grade:'',activities:'',description:'',startMonth:9,endMonth:null}}),newTab);
  expect(created).toEqual({ok:true,submitted:true});
  expect(await page.evaluate(async id=>(await chrome.scripting.executeScript({target:{tabId:id},func:()=>document.body.dataset.saved}))[0].result,newTab)).toBe('yes');
  await page.evaluate(id=>chrome.tabs.remove(id),newTab);



 } finally {await context?.close();await new Promise<void>(resolve=>server.close(()=>resolve()));await fs.rm(dir,{recursive:true,force:true})}
});
