const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../..');
const current=process.env.LISTUDY_EDITOR_FIXTURES||'/tmp/listudy-editor-after',baseline=process.env.LISTUDY_EDITOR_BASELINE||'/tmp/listudy-editor-before';
(async()=>{
 let failSave=true,saved;
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;saved=JSON.parse(body);res.setHeader('Content-Type','application/json');res.statusCode=failSave?409:200;res.end(JSON.stringify(failSave?{error:'Study changed'}:{revision:'saved',url:'/saved'}));return;
  }
  if(['/edit','/repertoire','/tactics'].includes(url.pathname)){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(path.join(url.searchParams.has('baseline')?baseline:current,url.pathname.slice(1)+'.html')));return;}
  if(url.pathname==='/saved'){res.end('Saved');return;}
  const file=path.join(root,'priv/static',url.pathname);
  if(!file.startsWith(root+'/priv/static/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
  res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const base=`http://127.0.0.1:${server.address().port}`;
  const visit=async(route,old=false)=>{await page.goto(base+route+(old?'?baseline=1':''));await page.waitForSelector('#editor_board cg-board');};
  const geometry=()=>page.evaluate(()=>Object.fromEntries(['.site-header','main.container','.chapter-editor-layout','#editor_board','.chapter-editor-details'].map(selector=>{const node=document.querySelector(selector),r=node.getBoundingClientRect();return[selector,{x:r.x,width:r.width,columns:getComputedStyle(node).gridTemplateColumns}];})));
  for(const width of [1280,900,390,320]){
   await page.setViewportSize({width,height:900});
   for(const route of ['/edit','/repertoire','/tactics'])for(const theme of ['light','dark']){
    await visit(route);await page.evaluate(value=>localStorage.setItem('data-theme',value),theme);await visit(route);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} ${width}px overflow`);
    const after=await geometry();await page.screenshot({path:`/tmp/listudy-bootstrap-editor-${route.slice(1)}-${width}-${theme}.png`,fullPage:true});
    await visit(route,true);const before=await geometry();
    for(const [selector,bounds]of Object.entries(before)){
     assert(Math.abs(bounds.x-after[selector].x)<=1&&Math.abs(bounds.width-after[selector].width)<=1,`${width}px ${route} ${selector}: board/sidebar layout`);
     assert.equal(after[selector].columns,bounds.columns);
    }
   }
  }
  await page.setViewportSize({width:1280,height:900});await visit('/edit');
  assert.equal(await page.locator('script[src*="/js/app.js"],link[href*="/css/app.css"]').count(),0);
  const state=()=>page.evaluate(()=>{const c=Alpine.$data(document.getElementById('chapter_editor'));return{pgn:c.exportPgn,dirty:c.dirty,canUndo:c.canUndo};});
  await page.evaluate(()=>{const c=Alpine.$data(document.getElementById('chapter_editor'));c.play('e2','e4');c.play('e7','e5');c.play('g1','f3');});
  await page.locator('#editor_comment').fill('Keep this variation and comment');
  const draft=await state();assert(draft.dirty&&draft.canUndo);
  const prefs=page.locator('.site-menu').filter({has:page.locator('#toggle_dark_mode')});await prefs.locator(':scope > summary').click();await page.locator('#board_settings').click();
  await page.waitForFunction(()=>document.activeElement.id==='board_settings_modal');
  await page.keyboard.press('Control+z');await page.keyboard.press('ArrowLeft');assert.deepEqual(await state(),draft,'Dialog keyboard events must not edit the chapter');
  const copied=await page.locator('#board_settings_modal').evaluate(node=>{const data=new DataTransfer();node.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,clipboardData:data}));return data.getData('text/plain');});assert.equal(copied,'');
  await page.keyboard.press('Escape');await page.locator('#board_settings_modal').waitFor({state:'hidden'});assert.deepEqual(await state(),draft);
  await page.locator('#editor_save').click();await page.locator('#editor_status').filter({hasText:'Study changed'}).waitFor();assert.equal((await state()).pgn,draft.pgn);
  failSave=false;await page.locator('#editor_save').click();await page.locator('#editor_status').filter({hasText:'Chapter saved'}).waitFor();assert.equal((await state()).dirty,false);assert(JSON.stringify(saved.tree).includes('Keep this variation and comment'));
  assert.deepEqual(errors,[]);
  console.log('Bootstrap editor: board/sidebar columns, themes, blank creation resources, modal shortcut/copy isolation, draft retention and save recovery passed');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
