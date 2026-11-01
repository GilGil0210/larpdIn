// @vitest-environment jsdom
import {it,expect} from 'vitest';
import {readEducation,parseDatePart} from './education';
it('reads all contract fields without asserting attachment completeness',()=>{document.body.innerHTML='<input aria-label="School" value="Example"><input aria-label="Degree" value="BA"><input aria-label="Field of study" value="Art"><input aria-label="Grade"><textarea aria-label="Activities and societies"></textarea><textarea aria-label="Description"></textarea><button>Save</button>';const record=readEducation(document,'123',{startMonth:9,startYear:2020,endMonth:null,endYear:null});expect(record).toMatchObject({school:'Example',degree:'BA',startMonth:9,attachmentsInspected:false});});
it('rejects invalid dates instead of silently dropping them',()=>{expect(parseDatePart('Year','year')).toBeNull();expect(parseDatePart('12','month')).toBe(12);expect(()=>parseDatePart('13','month')).toThrow();expect(()=>parseDatePart('unknown','year')).toThrow()});
