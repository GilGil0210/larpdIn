import {expect,it} from 'vitest';
import {assertRetainedSchoolIdentities} from './liveEducation';
import type {Snapshot} from '../snapshot';
it('rejects a missing or changed identity for a retained school',()=>{const record={id:'1',school:'Example',schoolIdentity:'https://www.linkedin.com/school/123'};const snapshot={educationRecords:[record]} as unknown as Snapshot;expect(()=>assertRetainedSchoolIdentities(snapshot,[record] as Snapshot['educationRecords'])).not.toThrow();expect(()=>assertRetainedSchoolIdentities(snapshot,[{...record,schoolIdentity:'https://www.linkedin.com/school/456'}] as Snapshot['educationRecords'])).toThrow('identity');expect(()=>assertRetainedSchoolIdentities(snapshot,[{id:'1',school:'Example'}] as Snapshot['educationRecords'])).toThrow('identity')});
