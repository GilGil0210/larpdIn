import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{await page.goto('/');});
test('intro preparation preserves other fields in a browser',async({page})=>{
 await page.setContent('<label>First name<input value="Ada"></label><label>Last name<input value="Lovelace"></label><label>Headline<textarea>Old</textarea></label><label>Country/Region<input value="Canada"></label><label>City<input value="Toronto"></label><label>Industry<input value="Technology"></label><button>Save</button>');
 const result=await page.evaluate(async()=>{const {prepareHeadline}=await import('/src/adapters/intro.ts');return prepareHeadline(document,'New headline')});
 expect(result.headline).toBe('Old');await expect(page.getByLabel('Headline')).toHaveValue('New headline');await expect(page.getByLabel('City')).toHaveValue('Toronto');
});
test('selects exact autocomplete option and rejects ambiguity',async({page})=>{
 await page.setContent('<label>School<input aria-controls="schools"></label><div id="schools" role="listbox"><div role="option">University of Toronto</div></div>');
 await page.evaluate(()=>{const input=document.querySelector('input')!;document.querySelector('[role=option]')!.addEventListener('click',()=>{input.value='University of Toronto'; input.dataset.selected='yes';input.setAttribute('aria-expanded','false')})});
 await page.evaluate(async()=>{const {findField,selectAutocomplete}=await import('/src/form.ts');await selectAutocomplete(findField(document,'School'),'University of Toronto',500)});
 await expect(page.locator('input')).toHaveAttribute('data-selected','yes');
 await page.locator('#schools').evaluate(el=>el.insertAdjacentHTML('beforeend','<div role="option">University of Toronto</div>'));
 const error=await page.evaluate(async()=>{const {findField,selectAutocomplete}=await import('/src/form.ts');try{await selectAutocomplete(findField(document,'School'),'University of Toronto',500);return ''}catch(e){return String(e)}});
 expect(error).toContain('Ambiguous');
});
test('rejects missing expected form controls before changing headline',async({page})=>{
 await page.setContent('<textarea aria-label="Headline">Old</textarea>');
 const error=await page.evaluate(async()=>{const {prepareHeadline}=await import('/src/adapters/intro.ts');try{prepareHeadline(document,'New');return ''}catch(e){return String(e)}});
 expect(error).toContain('Expected one');await expect(page.getByLabel('Headline')).toHaveValue('Old');
});

test('inspects labelled intro controls on a LinkedIn-shaped page',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><label>First name<input value="Ada"></label><label>Last name<input value="Lovelace"></label><label>Headline<textarea>Mathematician</textarea></label><label>Country/Region<input value="Canada"></label><label>City<input value="Toronto"></label><label>Industry<input value="Technology"></label></main>'}));
 await page.goto('https://www.linkedin.com/in/example/edit/intro/');
 const {inspectLinkedInForm}=await import('../src/inspection');
 const result=await page.evaluate(inspectLinkedInForm);
 expect(result.fields.find(x=>x.label==='Headline')?.value).toBe('Mathematician');
 expect(result.url).toBe('https://www.linkedin.com/in/example/edit/intro/');
});

test('prepares an education record and rejects a missing date option before editing',async({page})=>{
 await page.setContent('<label>School<input aria-controls="schools"></label><div id="schools"><div role="option">University of Toronto</div></div><label>Degree<input></label><label>Field of study<input></label><label>Grade<input></label><label>Activities and societies<textarea></textarea></label><label>Description<textarea></textarea></label><select id="sm"><option>Month</option><option>9</option></select><select id="sy"><option>Year</option><option>2020</option></select><select id="em"><option>Month</option></select><select id="ey"><option>Year</option><option>2024</option></select><button>Save</button>');
 await page.evaluate(()=>{const school=document.querySelector('input')!;document.querySelector('[role=option]')!.addEventListener('click',()=>{school.value='University of Toronto';school.setAttribute('aria-expanded','false')})});
 const result=await page.evaluate(async()=>{const {prepareEducation}=await import('/src/adapters/education.ts');const dates={startMonth:document.querySelector('#sm') as HTMLSelectElement,startYear:document.querySelector('#sy') as HTMLSelectElement,endMonth:document.querySelector('#em') as HTMLSelectElement,endYear:document.querySelector('#ey') as HTMLSelectElement};const item={school:'University of Toronto',degree:'BA',fieldOfStudy:'History',startYear:2020,endYear:2024,grade:'',activities:'',description:''};await prepareEducation(document,item,dates,{startMonth:9,endMonth:null});return {school:(document.querySelector('input') as HTMLInputElement).value,year:dates.startYear.value,degree:(document.querySelectorAll('input')[1] as HTMLInputElement).value}});
 expect(result).toEqual({school:'University of Toronto',year:'2020',degree:'BA'});
 await page.getByLabel('Degree').fill('Original');
 const error=await page.evaluate(async()=>{const {prepareEducation}=await import('/src/adapters/education.ts');const dates={startMonth:document.querySelector('#sm') as HTMLSelectElement,startYear:document.querySelector('#sy') as HTMLSelectElement,endMonth:document.querySelector('#em') as HTMLSelectElement,endYear:document.querySelector('#ey') as HTMLSelectElement};try{await prepareEducation(document,{school:'University of Toronto',degree:'Changed',fieldOfStudy:'',startYear:1999,endYear:null,grade:'',activities:'',description:''},dates);return ''}catch(e){return String(e)}});
 expect(error).toContain('1999');await expect(page.getByLabel('Degree')).toHaveValue('Original');
});

test('reads education editor fields and date controls',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><label>School*<input value="Example University"></label><label>Degree<input value="BA"></label><label>Field of study<input value="History"></label><select aria-label="Start date month"><option>September</option></select><select aria-label="Start date year"><option>2020</option></select><select aria-label="End date month"><option>Month</option></select><select aria-label="End date year"><option>Year</option></select><label>Grade<input></label><label>Activities and societies<textarea>Club</textarea></label><label>Description<textarea>Study</textarea></label></main>'}));
 await page.goto('https://www.linkedin.com/in/example/details/education/edit/forms/123/');
 const {readEducationEditor}=await import('../src/scanEducation');const result=await page.evaluate(readEducationEditor);
 expect(result).toMatchObject({id:'123',startMonth:9,endMonth:null,content:{school:'Example University',startYear:2020,endYear:null,activities:'Club'}});
});

test('About form submission checks owner and the original before saving',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><textarea>Original</textarea><button>Save</button><output></output><script>document.querySelector("button").onclick=()=>document.querySelector("output").textContent=document.querySelector("textarea").value</script></main>'}));
 await page.goto('https://www.linkedin.com/in/example/edit/forms/summary/new/');
 const {submitAboutForm}=await import('../src/adapters/about');
 await expect(page.evaluate(submitAboutForm,{owner:'https://www.linkedin.com/in/example/',expected:'stale',target:'Changed'})).rejects.toThrow('changed since');await expect(page.locator('textarea')).toHaveValue('Original');await expect(page.locator('output')).toHaveText('');
 const ok=await page.evaluate(submitAboutForm,{owner:'https://www.linkedin.com/in/example/',expected:'Original',target:'Changed'});expect(ok).toBe(true);await expect(page.locator('output')).toHaveText('Changed');
});

test('prepares intro using confirmed exact suggestions while preserving identity',async({page})=>{
 await page.setContent('<input aria-label="First name" value="Ada"><input aria-label="Last name" value="Lovelace"><input aria-label="Additional name"><select aria-label="Pronouns"><option>None</option></select><select aria-label="Education"><option>School</option></select><textarea aria-label="Headline">Old</textarea><input aria-label="Country/Region" value="Canada"><input aria-label="City" value="Ottawa" aria-controls="cities"><div id="cities"><div role="option">Toronto</div></div><input aria-label="Industry" value="Tech"><button>Save</button>');
 await page.evaluate(()=>{const city=document.querySelector<HTMLInputElement>('[aria-label="City"]')!;document.querySelector('#cities [role=option]')!.addEventListener('click',()=>{city.value='Toronto';city.setAttribute('aria-expanded','false')})});
 await page.evaluate(async()=>{const {readCompleteIntro,prepareIntro}=await import('/src/adapters/intro.ts');const before=readCompleteIntro(document);await prepareIntro(document,before,{headline:'New',location:'Toronto',industry:'Tech'})});
 await expect(page.getByLabel('City')).toHaveValue('Toronto');await expect(page.getByLabel('First name')).toHaveValue('Ada');await expect(page.getByLabel('Headline')).toHaveValue('New');
});

test('education list completeness requires consistent set metadata',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><div role="list"><div role="listitem" aria-setsize="2" aria-posinset="1"><a href="/in/example/details/education/edit/forms/1/">First</a></div><div role="listitem" aria-setsize="2" aria-posinset="2"><a href="/in/example/details/education/edit/forms/2/">Second</a></div></div></main>'}));
 await page.goto('https://www.linkedin.com/in/example/details/education/');
 const {educationListIsComplete}=await import('../src/scanEducation');
 expect(await page.evaluate(educationListIsComplete)).toBe(true);
 await page.locator('[role=listitem]').last().evaluate(el=>el.setAttribute('aria-setsize','3'));
 expect(await page.evaluate(educationListIsComplete)).toBe(false);
});

test('LinkedIn lazy-mounted education entries do not prove the whole list is loaded',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><div data-testid="profile_EducationDetailsSection_example" data-component-type="LazyColumn"><div data-lazy-mount-id="header"></div><div data-lazy-mount-id="entry"><div componentkey="entity-collection-item--example"><a href="/in/example/details/education/edit/forms/1/" aria-label="Edit education Example University">Edit</a></div></div><div data-lazy-mount-id="unmounted"></div></div></main>'}));
 await page.goto('https://www.linkedin.com/in/example/details/education/');
 const {educationListIsComplete}=await import('../src/scanEducation');
 expect(await page.evaluate(educationListIsComplete)).toBe(false);
});

test('education attachments are complete only with explicit empty lists',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><label>School<input value="School"></label><label>Degree<input></label><label>Field of study<input></label><select aria-label="Start month"><option>Month</option></select><select aria-label="Start year"><option>Year</option></select><select aria-label="End month"><option>Month</option></select><select aria-label="End year"><option>Year</option></select><input aria-label="Grade, maximum 80 characters"><textarea aria-label="Activities and societies, maximum 500 characters"></textarea><textarea aria-label="Description, maximum 1,000 characters"></textarea><div role="list" aria-label="Education skills" aria-setsize="0"></div><div role="list" aria-label="Education media" aria-setsize="0"></div></main>'}));
 await page.goto('https://www.linkedin.com/in/example/details/education/edit/forms/123/');const {readEducationEditor}=await import('../src/scanEducation');expect((await page.evaluate(readEducationEditor)).attachmentsInspected).toBe(true);
 await page.getByRole('list',{name:'Education media'}).evaluate(el=>el.insertAdjacentHTML('beforeend','<a href="https://example.com">Attachment</a>'));expect((await page.evaluate(readEducationEditor)).attachmentsInspected).toBe(false);
});

test('recognizes the observed empty LinkedIn education attachment containers',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<dialog open><label>School<input value="School"></label><label>Degree<input></label><label>Field of study<input></label><select aria-label="Start month"><option>Month</option></select><select aria-label="Start year"><option>Year</option></select><select aria-label="End month"><option>Month</option></select><select aria-label="End year"><option>Year</option></select><label>Grade<input></label><label>Activities and societies<textarea></textarea></label><label>Description<textarea></textarea></label><ul componentkey="skillsComponentRef" data-component-type="LazyColumn"><div id="DndDescribedBy-1" style="display:none">Drag help</div><div id="DndLiveRegion-1" role="status"></div></ul><button componentkey="addSkillButtonRef">Add skill</button><div data-component-type="LazyColumn" data-testid="auto-binding-id-education.dataAwareAddEducationFormComponent-education-mediaUiCollection"></div><button componentkey="example_education_addMedia">Add media</button></dialog>'}));
 await page.goto('https://www.linkedin.com/in/example/details/education/edit/forms/123/');const {readEducationEditor}=await import('../src/scanEducation');expect((await page.evaluate(readEducationEditor)).attachmentsInspected).toBe(true);
 await page.locator('ul[componentkey="skillsComponentRef"]').evaluate(el=>el.insertAdjacentHTML('beforeend','<li>Skill</li>'));expect((await page.evaluate(readEducationEditor)).attachmentsInspected).toBe(false);
});

test('collection traversal expands load-more and rejects unresolved pagination and loading',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><div role="list"><div role="listitem" aria-setsize="1" aria-posinset="1"><a href="/in/example/details/education/edit/forms/1/">Edit</a></div></div><button onclick="this.remove()">Load more</button></main>'}));
 await page.goto('https://www.linkedin.com/in/example/details/education/');const {educationListIsComplete,advanceEducationCollection}=await import('../src/scanEducation');
 expect(await page.evaluate(educationListIsComplete)).toBe(false);expect(await page.evaluate(advanceEducationCollection)).toBe(true);expect(await page.evaluate(educationListIsComplete)).toBe(true);
 await page.locator('main').evaluate(el=>el.insertAdjacentHTML('beforeend','<div aria-busy="true"></div>'));expect(await page.evaluate(educationListIsComplete)).toBe(false);
});

test('collection discovery deduplicates links to one record and rejects ambiguous controls',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><div role="list"><div role="listitem" aria-setsize="1" aria-posinset="1"><a href="/in/example/details/education/edit/forms/1/">Record</a><a href="/in/example/details/education/edit/forms/1/?tracking=yes">Edit</a></div></div><button>Load more</button><button>Show more</button></main>'}));
 await page.goto('https://www.linkedin.com/in/example/details/education/');const {findEducationEditors,advanceEducationCollection}=await import('../src/scanEducation');expect(await page.evaluate(findEducationEditors)).toHaveLength(1);await expect(page.evaluate(advanceEducationCollection)).rejects.toThrow(/ambiguous/);
});

test('autocomplete ignores hidden matches and other fields suggestion lists',async({page})=>{
 await page.setContent('<label>School<input aria-controls="owned"></label><div id="owned"><div role="option" style="display:none">Example University</div><div role="option" id="visible">Example University</div></div><div id="other"><div role="option">Example University</div></div>');
 await page.locator('#visible').evaluate(el=>el.addEventListener('click',()=>{const input=document.querySelector('input')!;input.value='Example University';input.setAttribute('aria-expanded','false')}));
 await page.evaluate(async()=>{const {findField,selectAutocomplete}=await import('/src/form.ts');await selectAutocomplete(findField(document,'School'),'Example University',500)});await expect(page.getByLabel('School')).toHaveValue('Example University');
});
test('captures a school identity only from the same education record',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><div role="listitem"><a href="/school/123/">School</a><a href="/in/example/details/education/edit/forms/1/">Edit</a></div></main>'}));
 await page.goto('https://www.linkedin.com/in/example/details/education/');const {findEducationSchoolIdentities}=await import('../src/scanEducation');expect(await page.evaluate(findEducationSchoolIdentities)).toEqual({identities:{'1':'https://www.linkedin.com/school/123'}});
 await page.locator('[role=listitem]').evaluate(el=>el.insertAdjacentHTML('beforeend','<a href="/school/456/">Other</a>'));await expect(page.evaluate(findEducationSchoolIdentities)).rejects.toThrow(/ambiguous/);
});
test('education deletion confirms only a unique confirmation dialog',async({page})=>{
 await page.route('https://www.linkedin.com/**',route=>route.fulfill({contentType:'text/html',body:'<main><button>Delete education</button></main><div role="dialog">Delete education?<button id="confirm">Delete</button><button>Cancel</button></div><script>document.querySelector("#confirm").onclick=()=>document.body.dataset.confirmed="yes"</script>'}));await page.goto('https://www.linkedin.com/in/example/details/education/');const {confirmEducationDeletion}=await import('../src/adapters/liveEducation');expect(await page.evaluate(confirmEducationDeletion)).toBe(true);await expect(page.locator('body')).toHaveAttribute('data-confirmed','yes');
});
test('preflights a cross-country intro change through field-owned suggestions',async({page})=>{
 await page.setContent('<label>First name<input value="A"></label><label>Last name<input value="B"></label><label>Additional name<input></label><label>Pronouns<select><option>None</option></select></label><label>Education<select><option>School</option></select></label><label>Headline<textarea>Old</textarea></label><label>Country/Region<input value="Canada" aria-controls="countries"></label><div id="countries"><div role="option">United States</div></div><label>City<input value="Toronto" aria-controls="cities"></label><div id="cities"><div role="option">Seattle, Washington, United States</div></div><label>Industry<input value="Technology"></label><button>Save</button>');
 await page.evaluate(()=>document.querySelectorAll('[role=option]').forEach(option=>option.addEventListener('click',()=>{const parent=option.parentElement!;const input=document.querySelector<HTMLInputElement>(`input[aria-controls="${parent.id}"]`)!;input.value=option.textContent||'';input.setAttribute('aria-expanded','false')})));
 await page.evaluate(async()=>{const {prepareIntro,readCompleteIntro}=await import('/src/adapters/intro.ts');const before=readCompleteIntro(document);await prepareIntro(document,before,{headline:'New',location:'Seattle, Washington, United States',country:'United States',industry:'Technology'})});await expect(page.getByLabel('Country/Region')).toHaveValue('United States');await expect(page.getByLabel('City')).toHaveValue('Seattle, Washington, United States');
});
