import {it,expect,vi} from 'vitest';
import {reconcileWorkerJobs} from './workerRecovery';
it('marks only jobs from the stopped worker interrupted and leaves checkpoints intact',async()=>{
 const data:Record<string,any>={'switch-job:profile:/in/a':{status:'running',startedAt:'now'},'switch-job:profile:/in/b':{status:'complete'},'operation:profile:/in/a':{status:'running',sections:{intro:'submitting'}}};
 vi.stubGlobal('chrome',{storage:{local:{get:async()=>({...data}),set:async(values:Record<string,unknown>)=>Object.assign(data,values)}}});
 try{await reconcileWorkerJobs();expect(data['switch-job:profile:/in/a'].status).toBe('interrupted');expect(data['switch-job:profile:/in/b'].status).toBe('complete');expect(data['operation:profile:/in/a'].sections.intro).toBe('submitting')}finally{vi.unstubAllGlobals()}
});
