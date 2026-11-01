import {it,expect,vi} from 'vitest';
import {scanProfile,type ScanResult} from './scanProfile';
const base:ScanResult={profileUrl:'https://www.linkedin.com/in/example/',content:{headline:'H',location:'',industry:'',about:'',education:[]}};
it('scans in order and preserves section results',async()=>{const calls:string[]=[];const result=await scanProfile(x=>calls.push(x),{intro:async()=>base,about:async input=>({...base,content:{...input,about:'About'}}),education:async input=>({...base,content:input})});expect(result.content).toMatchObject({headline:'H',about:'About'});expect(calls).toEqual(['Reading intro','Reading About','Reading education','Scan finished'])});
it('rejects account changes and does not continue',async()=>{const education=vi.fn();await expect(scanProfile(()=>{},{intro:async()=>base,about:async()=>({...base,profileUrl:'https://www.linkedin.com/in/other/'}),education})).rejects.toThrow();expect(education).not.toHaveBeenCalled()});
