const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
const fixture=process.env.LISTUDY_STUDY_GAME_PREVIEW||'/tmp/listudy-bootstrap-study-after.html';
const pgn='[Event "Alpha"]\n\n1. e4 e5 *\n\n[Event "Beta"]\n\n1. d4 d5 *';
(async()=>{
 let data={active:'Default',collections:{Default:[]}},revision=0,failSave=false,created;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
  if(url.pathname==='/api/collections'){
   if(req.method==='PUT'){
    let body='';for await(const chunk of req)body+=chunk;
    if(failSave){failSave=false;res.statusCode=503;return json({error:'Could not save collections.'});}
    data=JSON.parse(body).data;revision++;
   }
   return json({revision:String(revision),data});
  }
  if(url.pathname==='/api/collections/study'){
   let body='';for await(const chunk of req)body+=chunk;created=JSON.parse(body);
   res.statusCode=503;return json({error:'Please try creating the study again.'});
  }
  if(url.pathname.startsWith('/api/')||url.pathname.includes('/analysis/studies/'))return json(url.pathname.includes('/positions')?{positions:[]}:{});
  if(url.pathname==='/en/studies/test'){
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.end(fs.readFileSync(fixture,'utf8').replace(/var pgn = clean_pgn\(`[\s\S]*?`\);/,()=> 'var pgn = '+JSON.stringify(pgn)+';'));return;
  }
  if(url.pathname==='/baseline/bootstrap_study.css'&&process.env.LISTUDY_COLLECTION_BASELINE_CSS){
   res.setHeader('Content-Type','text/css');res.end(fs.readFileSync(process.env.LISTUDY_COLLECTION_BASELINE_CSS));return;
  }
  const file=path.join(root,'priv/static',url.pathname);
  if(!file.startsWith(root+'/priv/static/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{localStorage.setItem('puzzleRunMode','off');localStorage.setItem('sound_enabled','false');});
  await page.goto(`http://127.0.0.1:${server.address().port}/en/studies/test`);
  await page.waitForFunction(()=>document.querySelector('#chapter_select')?.options.length===2&&document.querySelector('#collection_save_status')?.textContent==='Saved to your account');
  const more=page.locator('#study_more_actions > summary'),modal=page.locator('#collection_modal');
  const add=async()=>{await more.click();await page.locator('#add_to_collection').click();};
  const open=async()=>{await more.click();await page.locator('#manage_collection').click();await modal.waitFor({state:'visible'});};
  await add();await page.locator('#next_chapter_btn').click();await add();await open();
  assert.equal(await modal.getAttribute('aria-modal'),'true');assert.equal(await page.locator('.modal[aria-modal="true"]').count(),1);
  assert.equal(await page.locator('.collection-row').count(),2);
  for(let i=0;i<20;i++){await page.keyboard.press('Tab');assert(await modal.evaluate(node=>node.contains(document.activeElement)));}
  await page.locator('.collection-row').nth(1).getByRole('button',{name:'Move up',exact:true}).click();
  assert((await page.locator('.collection-row').first().textContent()).includes('Beta'));
  page.once('dialog',dialog=>dialog.accept('Tactics'));await page.locator('#btn_new_collection').click();
  await page.locator('.collection-choice').filter({hasText:'Default'}).click();
  await page.locator('.collection-row').first().locator('select').selectOption('Tactics');
  assert.equal(await page.locator('.collection-row').count(),1);
  await page.locator('.collection-choice').filter({hasText:'Tactics'}).click();
  failSave=true;await page.locator('#collection_active_name').fill('Tournament');await page.locator('#collection_active_name').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#collection_save_status').textContent.includes('Could not save'));
  assert((await page.locator('.collection-row').textContent()).includes('Beta'));
  await page.locator('#collection_retry_save').click();
  await page.waitForFunction(()=>document.querySelector('#collection_save_status').textContent==='Saved to your account');
  const downloaded=page.waitForEvent('download');await page.locator('#modal_download').click();
  const exported=await downloaded;assert.equal(exported.suggestedFilename(),'tournament.pgn');
  assert.equal(fs.readFileSync(await exported.path(),'utf8'),data.collections.Tournament.map(item=>item.pgn).join('\n\n'));
  await page.locator('#collection_create_study').click();await page.locator('#collection_study_title').fill('My tournament draft');
  await page.locator('#collection_study_color').selectOption('black');
  await page.keyboard.press('Escape');assert(await modal.isHidden());assert(await more.evaluate(node=>node===document.activeElement));
  await open();assert.equal(await page.locator('#collection_study_title').inputValue(),'My tournament draft');
  assert.equal(await page.locator('#collection_study_color').inputValue(),'black');
  await page.locator('#collection_study_form button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelector('#collection_save_status').textContent.includes('Please try creating'));
  assert.equal(created.title,'My tournament draft');assert.equal(created.color,'black');assert.equal(created.collection,'Tournament');
  assert.equal(await page.locator('#collection_study_title').inputValue(),'My tournament draft');
  assert(await modal.evaluate(node=>node.contains(document.activeElement)),'Create failure must leave focus inside the modal');
  await page.keyboard.press('Escape');assert(await modal.isHidden());await open();
  await page.locator('#collection_cancel_study').click();
  for(const width of [1280,900,390,320]){
   await page.setViewportSize({width,height:700});
   for(const theme of ['light','dark']){
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;document.documentElement.dataset.bsTheme=value;},theme);
    await modal.evaluate(root=>Promise.all(root.getAnimations({subtree:true}).filter(animation=>Number.isFinite(animation.effect.getComputedTiming().endTime)).map(animation=>animation.finished.catch(()=>{}))));
    const bounds=await modal.locator('.collection-dialog').boundingBox();assert(bounds.x>=0&&bounds.x+bounds.width<=width);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.env.LISTUDY_COLLECTION_BASELINE_CSS){
     const snapshot=()=>modal.evaluate(root=>[...root.querySelectorAll('.collection-dialog,.collection-workspace,.collection-body,.collection-footer,.collection-row,.collection-move,.collection-choice,.collection-title-input')].map(node=>{
      const style=getComputedStyle(node),r=node.getBoundingClientRect();
      return {classes:node.className,x:r.x,y:r.y,width:r.width,height:r.height,styles:Object.fromEntries(['display','grid-template-columns','flex-direction','flex-wrap','justify-content','gap','padding','margin','color','background-color','border','border-radius','box-shadow','font-size','line-height','max-height','overflow-y'].map(key=>[key,style.getPropertyValue(key)]))};
     }));
     const after=await snapshot();
     const stylesheet=page.locator('link[href*="bootstrap_study.css"]');
     const currentHref=await stylesheet.getAttribute('href');
     const load=href=>stylesheet.evaluate((link,href)=>new Promise((resolve,reject)=>{link.onload=()=>requestAnimationFrame(()=>requestAnimationFrame(resolve));link.onerror=reject;link.href=href;}),href);
     await load('/baseline/bootstrap_study.css');
     assert.deepEqual(after,await snapshot(),`${width}px ${theme}: collection layout and controls match before cleanup`);
     await load(currentHref);
    }
    await page.screenshot({path:`/tmp/listudy-bootstrap-collections-${width}-${theme}.png`});
   }
  }
  await modal.locator('[data-bs-dismiss]').click();assert(await modal.isHidden());assert.equal(await page.locator('.modal-backdrop').count(),0);
  await open();await modal.click({position:{x:2,y:2}});assert(await modal.isHidden());
  await page.reload();await page.waitForFunction(()=>document.querySelector('#collection_save_status')?.textContent==='Saved to your account');await open();
  assert.equal(await page.locator('#collection_active_name').inputValue(),'Tournament');assert.equal(await page.locator('.collection-row').count(),1);
  data.collections.Tournament=Array.from({length:40},(_,index)=>({...data.collections.Tournament[0],title:`Chapter ${index+1}`,pgn:`[Event "Chapter ${index+1}"]\n\n1. e4 *`}));revision++;
  await page.reload();await page.waitForFunction(()=>document.querySelector('#collection_save_status')?.textContent==='Saved to your account');await open();
  for(const width of [1280,390,320]){
   await page.setViewportSize({width,height:700});
   const scroll=await page.locator('.collection-body').evaluate(node=>({height:node.clientHeight,total:node.scrollHeight}));
   assert(scroll.total>scroll.height,'Long chapter lists scroll inside the collection');
   const footer=await page.locator('.collection-footer').boundingBox();assert(footer.y>=0&&footer.y+footer.height<=700);
   await page.locator('.collection-body').evaluate(node=>{node.scrollTop=node.scrollHeight;});
   assert(await modal.locator('[data-bs-dismiss]').isVisible());
  }
  assert.deepEqual(errors,[]);
  console.log('Bootstrap collections: grouping, moving, rename, save recovery, PGN export, draft preservation, create failure, focus, dismissal, persistence and responsive themes passed');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
