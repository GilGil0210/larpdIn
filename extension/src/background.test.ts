import {expect,it,vi} from 'vitest';
const deps=vi.hoisted(()=>({execute:vi.fn(),load:vi.fn(),recover:vi.fn()}));
vi.mock('./switchCoordinator',()=>({executeSwitch:deps.execute,restoreInterrupted:deps.recover}));
vi.mock('./liveSwitch',()=>({liveSwitch:{}}));
vi.mock('./storage',()=>({profileKey:(url:string)=>`profile:${new URL(url).pathname.replace(/\/$/,'')}`,loadPersonas:deps.load}));
it('acknowledges promptly and rejects duplicate and untrusted commands',async()=>{
 const data:Record<string,any>={};let listener:any;let finish!:(value:any)=>void;
 deps.execute.mockReturnValue(new Promise(resolve=>{finish=resolve}));deps.load.mockResolvedValue([{id:'00000000-0000-4000-8000-000000000000',name:'Example',description:'',content:{}}]);
 const get=async(key:string|null)=>key===null?{...data}:{[key]:data[key]};
 vi.stubGlobal('chrome',{sidePanel:{setPanelBehavior:vi.fn()},storage:{session:{setAccessLevel:async()=>{}},local:{setAccessLevel:async()=>{},get,set:async(values:object)=>Object.assign(data,values)}},runtime:{id:'extension-id',getURL:(s:string)=>`chrome-extension://extension-id/${s}`,onMessage:{addListener:(fn:any)=>{listener=fn}}}});
 try {
  await import('./background');const request={type:'start-switch',profileUrl:'https://www.linkedin.com/in/example/',selection:{kind:'persona',id:'00000000-0000-4000-8000-000000000000'}};
  expect(listener(request,{id:'extension-id',url:'https://www.linkedin.com/'},()=>{})).toBe(false);
  const send=()=>new Promise<any>(resolve=>listener(request,{id:'extension-id',url:'chrome-extension://extension-id/index.html'},resolve));
  expect(await send()).toEqual({ok:true});expect((await send()).error).toMatch(/already running/);
  await vi.waitFor(()=>expect(deps.execute).toHaveBeenCalledOnce());finish({id:'op',status:'complete'});await vi.waitFor(()=>expect(data['switch-job:profile:/in/example']?.status).toBe('complete'));
 }finally{vi.unstubAllGlobals()}
});
