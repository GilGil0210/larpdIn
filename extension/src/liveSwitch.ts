import {captureSnapshot} from './captureSnapshot';
import {makeIntroAdapter} from './adapters/liveIntro';
import {makeAboutAdapter} from './adapters/about';
import {makeEducationAdapter} from './adapters/liveEducation';
import {browserLock,type SwitchDependencies} from './switchCoordinator';
/** LinkedIn dependencies stay gated by captureSnapshot's completeness checks. */
export const liveSwitch:SwitchDependencies={
 capture:profileUrl=>captureSnapshot(profileUrl,undefined,{passes:1}),
 run:{revalidate:false,trustCaptureForNoop:true,parallel:true},
 lock:browserLock,
 adapters(before,destination,operationId){return {intro:makeIntroAdapter(before.profileUrl,before.introDetails,destination),about:makeAboutAdapter(before.profileUrl,before.content),education:makeEducationAdapter(before.profileUrl,before,destination,operationId,{checkEachStep:false})}}
};
