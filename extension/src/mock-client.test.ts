import {expect,it} from 'vitest';
import {createMockClient} from './mock-client';
it('supports a complete review, save, preview, switch and undo flow',async()=>{
 const client=createMockClient();const updates:string[]=[];const stop=client.subscribe(s=>updates.push(s.operation?.status||'idle'));
 await client.connectProfile();await client.scanProfile();await client.generate('Toronto');
 const candidate=(await client.getState()).candidates[0];await client.savePersona(candidate);
 const id=(await client.getState()).personas[0].id;expect((await client.preview(id)).after).toEqual(candidate.content);
 await client.apply(id);expect((await client.getState()).activePersonaId).toBe(id);await client.undo();expect((await client.getState()).activePersonaId).toBeNull();expect(updates).toContain('complete');stop();
});
it('redacts profile content from diagnostics',async()=>{const client=createMockClient();await client.connectProfile();await client.scanProfile();expect(await client.exportDiagnostics()).not.toContain('Example headline')});
