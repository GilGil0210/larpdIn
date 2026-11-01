// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest';
import {findField,findButton,setText,selectOption} from './form';
describe('form matching',()=>{
 it('finds exact labels, sets text and emits events',()=>{document.body.innerHTML='<label for="headline">Headline*</label><textarea id="headline"></textarea><button>Save</button>';const f=findField(document,'Headline');const input=vi.fn();f.addEventListener('input',input);setText(f,'New headline');expect(f.value).toBe('New headline');expect(input).toHaveBeenCalledOnce();expect(findButton(document,'Save').textContent).toBe('Save')});
 it('rejects duplicate controls and missing buttons',()=>{document.body.innerHTML='<input aria-label="School"><input aria-label="School">';expect(()=>findField(document,'School')).toThrow('found 2');expect(()=>findButton(document,'Save')).toThrow('found 0')});
 it('selects an exact option and rejects ambiguous options',()=>{document.body.innerHTML='<label>Year<select><option value="">Year</option><option value="2025">2025</option></select></label>';const f=findField(document,'Year');selectOption(f,'2025');expect(f.value).toBe('2025');expect(()=>selectOption(f,'2026')).toThrow()});
});
