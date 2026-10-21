// Render with LISTUDY_STUDY_GAME_PREVIEW in analysis_training_test.exs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const current = process.env.LISTUDY_STUDY_GAME_PREVIEW || '/tmp/listudy-bootstrap-study-after.html';
const baseline = process.env.LISTUDY_STUDY_BASELINE || '/tmp/listudy-bootstrap-study-before.html';
const pgn = '[Event "First chapter"]\n\n1. e4 e5 2. Nf3 Nc6 *\n\n[Event "Second chapter"]\n\n1. d4 d5 2. c4 e6 *';
(async () => {
    let collections={active:'Default',collections:{Default:[]}}, collectionRevision=0;
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/api/collections') {
            if(req.method==='PUT') {
                let body='';for await(const chunk of req)body+=chunk;
                collections=JSON.parse(body).data;collectionRevision++;
            }
            res.setHeader('Content-Type','application/json');
            res.end(JSON.stringify({revision:String(collectionRevision),data:collections}));return;
        }
        if (url.pathname.startsWith('/api/') || url.pathname.includes('/analysis/studies/')) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(url.pathname === '/api/collections' ? {version:1,collections:[]} : url.pathname.includes('/positions') ? {positions:[]} : {}));return;
        }
        if (url.pathname.startsWith('/en/studies/')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fs.readFileSync(url.searchParams.has('baseline') ? baseline : current, 'utf8')
                .replace(/var pgn = clean_pgn\(`[\s\S]*?`\);/, () => 'var pgn = ' + JSON.stringify(pgn) + ';'));return;
        }
        const file = path.join(root, 'priv/static', url.pathname);
        if (!file.startsWith(root+'/priv/static/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.statusCode=404;res.end();return;}
        res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(fs.readFileSync(file));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
    try {
        const page=await browser.newPage();
        const errors=[];page.on('pageerror',error=>errors.push(error.message));
        await page.addInitScript(()=>{localStorage.setItem('puzzleRunMode','off');localStorage.setItem('sound_enabled','false');});
        const visit=async previous=>{
            await page.goto(`http://127.0.0.1:${server.address().port}/en/studies/test`+(previous?'?baseline=1':''));
            await page.waitForFunction(()=>document.querySelector('#chapter_select')?.options.length===2 && document.querySelector('#study_more_actions')?.dataset.initialized);
            await page.waitForTimeout(150);
        };
        const geometry=()=>page.evaluate(()=>Object.fromEntries([
            '.site-header','main.container','.study-session-controls','.study-context','#study_layout','#chessground','.sidebar','.site-footer'
        ].map(selector=>{const rect=document.querySelector(selector).getBoundingClientRect();return [selector,{x:rect.x,y:rect.y,width:rect.width,height:rect.height}];})));
        const differences=[];
        for(const width of [1280,900,390,320]) {
            await page.setViewportSize({width,height:900});
            for(const theme of ['light','dark']) {
                await visit(false);await page.evaluate(value=>localStorage.setItem('data-theme',value),theme);await visit(false);
                assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}px overflow`);
                const after=await geometry();
                await page.screenshot({path:`/tmp/listudy-bootstrap-study-${width}-${theme}.png`,fullPage:true});
                await visit(true);const before=await geometry();
                for(const [selector,bounds] of Object.entries(before))for(const dimension of ['x','y','width','height']) {
                    if(Math.abs(bounds[dimension]-after[selector][dimension])>2)differences.push({width,theme,selector,dimension,before:bounds[dimension],after:after[selector][dimension]});
                }
            }
        }
        assert.deepEqual(differences,[],'Training keeps the existing board/sidebar layout');
        await page.setViewportSize({width:1280,height:900});await visit(false);
        const scripts=await page.locator('script[src]').evaluateAll(nodes=>nodes.map(node=>node.src));
        assert(scripts.some(src=>src.includes('/js/bootstrap_study.js')));
        assert(!scripts.some(src=>src.includes('/js/app.js')||src.includes('/js/bootstrap_ui.js')));
        assert.equal(await page.locator('dialog, .modal_open, .modal_close').count(),0);
        const settings=page.locator('#study_settings_dialog');
        await page.locator('#open_study_settings').click();
        assert.equal(await settings.getAttribute('aria-modal'),'true');
        assert.equal(await page.locator('#settings_tab_practice').getAttribute('aria-selected'),'true');
        await page.locator('#settings_tab_practice').focus();await page.keyboard.press('Home');
        assert.equal(await page.locator('#settings_tab_general').getAttribute('aria-selected'),'true');
        await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#settings_tab_practice').getAttribute('aria-selected'),'true');
        await page.keyboard.press('End');
        assert.equal(await page.locator('#settings_tab_sparring').getAttribute('aria-selected'),'true');
        await page.locator('[data-sparring="strength"]').selectOption('3');
        await page.locator('#settings_tab_practice').click();
        await page.locator('#study_session_goal').fill('25');await page.locator('#study_session_goal').dispatchEvent('change');
        await page.locator('#limit_practice_depth').check();
        await page.locator('#max_depth_range').fill('2');await page.locator('#max_depth_range').dispatchEvent('change');
        for(let i=0;i<15;i++){await page.keyboard.press('Tab');assert(await settings.evaluate(node=>node.contains(document.activeElement)));}
        await page.keyboard.press('Escape');assert(await settings.isHidden());
        assert(await page.locator('#open_study_settings').evaluate(node=>node===document.activeElement));
        assert.equal(await page.evaluate(()=>localStorage.getItem('smart_session_goal')),'25');
        await page.locator('#study_mode').click();await page.locator('#open_study_settings').click();
        assert.equal(await page.locator('#settings_tab_general').getAttribute('aria-selected'),'true');
        await settings.locator('[data-bs-dismiss]').click();
        await page.locator('#study_more_actions > summary').click();
        await page.locator('[data-study-comments]').click();
        assert(await page.locator('#study_discussion').evaluate(node=>node.open));
        await page.keyboard.press('Escape');
        assert(await page.locator('#study_more_actions > summary').evaluate(node=>node===document.activeElement));
        await page.locator('#study_more_actions > summary').click();
        await page.locator('[data-study-dialog="study_sparring_history_dialog"]').click();
        assert.equal(await page.locator('#study_sparring_history_dialog').getAttribute('aria-modal'),'true');
        assert(await page.locator('[data-sparring="history-empty"]').isVisible());
        await page.keyboard.press('Escape');
        await page.locator('#progress').click();
        assert.equal(await page.locator('.chapter-progress-summary').count(),2);
        await page.locator('.chapter-progress-summary').nth(1).click();
        assert(await page.locator('#progress_modal').isHidden());
        assert.equal(await page.locator('#chapter_select').inputValue(),'1');
        assert.equal(await page.locator('.modal-backdrop').count(),0);
        assert(!await page.evaluate(()=>document.body.classList.contains('modal-open')));
        for(const width of [390,320]) {
            await page.setViewportSize({width,height:700});
            await page.locator('#open_study_settings').click();
            assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
            const rect=await settings.locator('.modal-content').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width);
            await settings.locator('[data-bs-dismiss]').click();
        }
        await page.reload();await page.waitForFunction(()=>document.querySelector('#study_more_actions')?.dataset.initialized);
        await page.locator('#open_study_settings').click();await page.locator('#settings_tab_practice').click();
        assert.equal(await page.locator('#study_session_goal').inputValue(),'25');
        await page.keyboard.press('Escape');
        await page.locator('#study_more_actions > summary').click();
        await page.locator('#add_to_collection').click();
        await page.locator('#study_more_actions > summary').click();
        await page.locator('#manage_collection').click();
        assert(await page.locator('#collection_modal').isVisible());
        assert.equal(await page.locator('#collection_list .collection-row').count(),1);
        const collectionBounds=await page.locator('.collection-dialog').boundingBox();
        assert(collectionBounds.x>=0&&collectionBounds.x+collectionBounds.width<=320);
        await page.keyboard.press('Escape');
        assert(await page.locator('#collection_modal').isHidden());
        assert.deepEqual(errors,[]);
        console.log('Training Bootstrap layout, settings tabs, depth, goals, details/comments, history, progress navigation, focus and mobile passed');
    } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
