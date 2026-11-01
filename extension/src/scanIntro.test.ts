import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./ownership',()=>({resolveOwnProfile:vi.fn(async()=> 'https://www.linkedin.com/in/example/'),assertOwner:(a:string,b:string)=>{if(a!==b)throw Error('Wrong owner')}}));
import {scanIntro} from './scanIntro';
const content={headline:'',location:'',industry:'',about:'Original',education:[]};
const fields=[['First name','A'],['Last name','B'],['Headline','Headline'],['Country/Region','Canada'],['City','Toronto'],['Industry','Technology']].map(([label,value])=>({label,value,tag:'input',type:'text'}));
const remove=vi.fn(async()=>{});
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('chrome',{tabs:{create:vi.fn(async()=>({id:42})),get:vi.fn(async()=>({id:42,status:'complete'})),remove},scripting:{executeScript:vi.fn(async()=>[{result:{url:'https://www.linkedin.com/in/example/edit/intro/',title:'LinkedIn',fields}}])}})});
it('opens the owner editor, imports intro, and closes the tab',async()=>{const result=await scanIntro(content);expect(result.content).toMatchObject({headline:'Headline',location:'Toronto',about:'Original'});expect(remove).toHaveBeenCalledWith(42)});
it('never imports a different profile and closes the tab',async()=>{chrome.scripting.executeScript=vi.fn(async()=>[{result:{url:'https://www.linkedin.com/in/other/edit/intro/',title:'LinkedIn',fields}}]) as unknown as typeof chrome.scripting.executeScript;await expect(scanIntro(content,20)).rejects.toThrow();expect(remove).toHaveBeenCalledWith(42)});
