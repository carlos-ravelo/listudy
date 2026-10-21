const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fixture = path.join(process.env.LISTUDY_TACTICS_PREVIEW || '/tmp/listudy-bootstrap-tactics', 'collection.html');
(async () => {
    const server = http.createServer((req,res) => {
        const url = new URL(req.url,'http://localhost');
        if(url.pathname.startsWith('/api/') || url.pathname.includes('/analysis/studies/')) {
            res.setHeader('Content-Type','application/json');res.end(JSON.stringify(url.pathname.includes('/positions')?{positions:[]}:{}));return;
        }
        if(url.pathname.startsWith('/en/tactics/collections/')) {res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(fixture));return;}
        const file=path.join(root,'priv/static',url.pathname);
        if(!file.startsWith(root+'/priv/static/')||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;res.end();return;}
        res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
    try {
        const page=await browser.newPage({viewport:{width:390,height:844}});
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/en/tactics/collections/test?mode=smart`);
        await page.waitForFunction(()=>window.ground&&window.trees?.length);
        await page.evaluate(()=>localStorage.setItem('show_comments',i18n.comments_always_on));
        assert.equal(await page.locator('#practice_lines').getAttribute('aria-pressed'),'true');
        assert(await page.locator('#practice_smart').isHidden());assert(await page.locator('#practice_sparring').isHidden());
        assert.equal(await page.evaluate(()=>ground.state.orientation),'black');
        await page.locator('#open_study_settings').click();
        assert.equal(await page.locator('#study_settings_dialog').getAttribute('aria-modal'),'true');
        assert(await page.locator('#settings_tab_sparring').isHidden());assert(await page.locator('#settings_tab_sparring').isDisabled());
        await page.locator('#settings_tab_practice').focus();await page.keyboard.press('End');
        assert.equal(await page.locator('#settings_tab_practice').getAttribute('aria-selected'),'true');
        await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#settings_tab_general').getAttribute('aria-selected'),'true');
        assert.equal(await page.locator('#comments_toggle').textContent(),await page.evaluate(()=>i18n.comments_hidden));
        await page.locator('#comments_toggle').click();await page.locator('#comments_toggle').click();
        assert.equal(await page.evaluate(()=>localStorage.getItem('tactics_show_comments')),await page.evaluate(()=>i18n.comments_always_on));
        await page.keyboard.press('Escape');await page.reload();
        await page.waitForFunction(()=>window.ground&&window.trees?.length);
        assert((await page.locator('#comments').textContent()).includes('Black controls the centre'));
        await page.locator('#open_study_settings').click();await page.locator('#settings_tab_general').click();await page.locator('#comments_toggle').click();
        assert.equal(await page.evaluate(()=>localStorage.getItem('show_comments')),await page.evaluate(()=>i18n.comments_always_on));
        await page.keyboard.press('Escape');
        await page.evaluate(()=>{ground.selectSquare('e7');ground.selectSquare('e5');});
        await page.waitForFunction(()=>chess.history().length===2);
        assert.deepEqual(await page.evaluate(()=>chess.history()),['e5','Nf3']);
        await page.locator('#study_mode').click();await page.locator('#open_study_settings').click();
        assert.equal(await page.locator('#settings_tab_general').getAttribute('aria-selected'),'true');
        await page.keyboard.press('Escape');await page.locator('#progress').click();
        assert(await page.locator('.chapter-progress-summary').isVisible());await page.keyboard.press('Escape');
        assert.equal(await page.locator('.modal-backdrop').count(),0);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert.deepEqual(errors,[]);
        console.log('Tactics Bootstrap dialogs, hidden Sparring keyboard exclusion, preferences, black-side play, reading and progress passed');
    } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
