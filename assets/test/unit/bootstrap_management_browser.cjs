const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
const current=process.env.LISTUDY_MANAGEMENT_FIXTURES||'/tmp/listudy-management-after';
const baseline=process.env.LISTUDY_MANAGEMENT_BASELINE||'/tmp/listudy-management-before';
(async()=>{
 let submitted='',failSave=false,posts=0;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='POST'){
   posts++;submitted='';for await(const chunk of req)submitted+=chunk;
   res.setHeader('Content-Type','application/json');res.statusCode=failSave?422:200;
   res.end(JSON.stringify(failSave?{error:'Please try saving again.'}:{action:url.pathname,study_url:'/en/studies/test',save_url:'/save-chapters',editor_url:'/editor',pgn_changed:false}));return;
  }
  if(['/repertoire','/tactics','/edit','/edit-error'].includes(url.pathname)){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(url.searchParams.has('baseline')?baseline:current,url.pathname.slice(1)+'.html')));return;
  }
  const file=path.join(root,'priv/static',url.pathname);
  if(!file.startsWith(root+'/priv/static/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  page.on('dialog',dialog=>dialog.accept());
  const base=`http://127.0.0.1:${server.address().port}`;
  const visit=async(route,old=false)=>{await page.goto(base+route+(old?'?baseline=1':''));await page.waitForFunction(()=>window.Alpine&&document.querySelector('[x-data="studyOpeningPicker"]')?.classList.contains('study-opening-picker'));await page.waitForTimeout(80);};
  for(const width of [1280,900,390,320]){
   await page.setViewportSize({width,height:900});
   for(const route of ['/repertoire','/tactics','/edit'])for(const theme of ['light','dark']){
    await visit(route);await page.evaluate(value=>localStorage.setItem('data-theme',value),theme);await visit(route);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} ${width}px overflow`);
    const selector=route==='/edit'?'.study-maintenance':'.study-create-layout';
    const geometry=()=>page.locator(selector).evaluate(node=>{const bounds=node.getBoundingClientRect();return{x:bounds.x,width:bounds.width,columns:getComputedStyle(node).gridTemplateColumns};});
    const after=await geometry();
    await page.screenshot({path:`/tmp/listudy-bootstrap-management-${route.slice(1)}-${width}-${theme}.png`,fullPage:true});
    await visit(route,true);const before=await geometry();
    assert(Math.abs(before.x-after.x)<=1&&Math.abs(before.width-after.width)<=1,`${route}: existing layout width/position`);
    assert.equal(after.columns,before.columns,`${route}: existing columns`);
   }
  }
  await page.setViewportSize({width:1280,height:900});
  for(const route of ['/repertoire','/edit']){
   await visit(route);
   assert.equal(await page.locator('script[src*="jquery"],script[src*="select2"],script[src*="/js/app.js"],link[href*="/css/app.css"]').count(),0);
   assert.equal(await page.locator('dialog').count(),0);
   const draft='Unsaved metadata draft';await page.locator('#study_title').fill(draft);
   if(route==='/edit')await page.locator('.study-maintenance-title input').first().fill('Unsaved chapter draft');
   const trigger=page.locator('#study_opening_picker_button'),modal=page.locator('#study_opening_picker'),search=modal.locator('input[type="search"]');
   const previous=await page.locator('#study_opening_id').inputValue();
   await trigger.click();assert.equal(await modal.getAttribute('aria-modal'),'true');
   assert(await search.evaluate(node=>node===document.activeElement),'Opening search receives initial focus');
   await search.fill('no-such-opening-xyz');await page.locator('.study-opening-empty').waitFor({state:'visible'});
   await page.keyboard.press('Enter');assert.equal(posts,0,'Search Enter must not submit the study form');
   await page.keyboard.press('Escape');assert(await modal.isHidden());assert(await trigger.evaluate(node=>node===document.activeElement));
   assert.equal(await page.locator('#study_opening_id').inputValue(),previous);
   await trigger.click();assert.equal(await search.inputValue(),'');
   const option=modal.locator('.study-opening-options button').filter({hasNotText:'Choose opening'});
   const choice=await option.evaluateAll((nodes,old)=>{const node=nodes.find(node=>node.dataset.id!==old);return{id:node.dataset.id,name:node.dataset.name};},previous);
   await search.fill(choice.name.toUpperCase());
   await modal.locator(`button[data-id="${choice.id}"]`).click();
   assert(await modal.isHidden());assert.equal(await page.locator('#study_opening_id').inputValue(),choice.id);
   assert.equal(await page.locator('#study_title').inputValue(),draft);
   assert((await trigger.textContent()).includes(choice.name));
   if(route==='/edit'){
    assert.equal(await page.locator('.study-maintenance-title input').first().inputValue(),'Unsaved chapter draft');
    failSave=true;await page.locator('.study-form-actions button').click();await page.waitForFunction(()=>document.querySelector('.study-management-status').textContent==='Please try saving again.');
    assert.equal(await page.locator('#study_title').inputValue(),draft);failSave=false;
    await page.locator('.study-form-actions button').click();await page.waitForFunction(()=>document.querySelector('.study-management-status').textContent==='Study saved');
    assert(submitted.includes(choice.id));assert(submitted.includes(draft));
    assert.equal(await page.locator('.study-maintenance-title input').first().inputValue(),'Unsaved chapter draft');
   }
   await trigger.click();for(let i=0;i<15;i++){await page.keyboard.press('Tab');assert(await modal.evaluate(node=>node.contains(document.activeElement)));}
   await modal.click({position:{x:2,y:2}});assert(await modal.isHidden());
   for(const width of [390,320]){await page.setViewportSize({width,height:700});await trigger.click();const rect=await modal.locator('.modal-content').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width);await modal.locator('[data-bs-dismiss]').click();}
   await page.setViewportSize({width:1280,height:900});
  }
  await visit('/edit-error');
  assert.equal(await page.locator('#study_title').inputValue(),'a');
  assert(await page.locator('.invalid-feedback[phx-feedback-for="study_title"]').isVisible(),'Server validation feedback remains visible');
  assert.deepEqual(errors,[]);
  console.log('Bootstrap management: preserved columns, themes, opening search/selection, dismissal, focus, metadata/chapter drafts, save recovery and mobile passed');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
