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
                .replace('<div class="option_item study-depth-setting">', '<div id="study_depth_settings" class="option_item study-depth-setting">')
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
        for (const [kind, id] of [['smart', 'smart_run_status'], ['weak', 'weak_run_status'], ['failed', 'failed_positions_status']]) {
            const message = '<img src=x onerror=alert(1)> ' + kind;
            await page.evaluate(({kind, message}) => window.dispatchEvent(new CustomEvent('study-run-status-updated', {
                detail: {kind, message, visible: true}
            })), {kind, message});
            await page.waitForFunction(({id, message}) => {
                const node = document.getElementById(id);
                return !node.hidden && node.textContent === message;
            }, {id, message});
            assert.equal(await page.locator('#' + id + ' img').count(), 0, 'Run messages are rendered as plain text');
            await page.evaluate(kind => window.dispatchEvent(new CustomEvent('study-run-status-updated', {
                detail: {kind, message: '', visible: false}
            })), kind);
            await page.waitForFunction(id => document.getElementById(id).hidden, id);
        }
        await page.keyboard.press('ArrowRight');
        const beforeDepthChange = await page.evaluate(() => chess.fen());
        assert(await page.evaluate(() => chess.history().length > 0));
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
        await page.locator('#max_depth_sub').click();
        assert.equal(await page.locator('#max_depth_label').textContent(), '1');
        assert(await page.locator('#max_depth_sub').isDisabled());
        assert(await page.locator('#max_depth_container').evaluate(node => node.classList.contains('option-highlighted')));
        await page.locator('#max_depth_range').fill('2');await page.locator('#max_depth_range').dispatchEvent('change');
        assert.equal(await page.evaluate(() => chess.fen()), beforeDepthChange, 'Depth edits do not restart the line while settings are open');
        assert(await page.locator('#max_depth_add').isDisabled());
        assert(!await page.locator('#max_depth_container').evaluate(node => node.classList.contains('option-highlighted')));
        assert.equal(await page.evaluate(() => localStorage.getItem(`max_depth_${study_id}_0`)), '-1');
        for(let i=0;i<15;i++){await page.keyboard.press('Tab');assert(await settings.evaluate(node=>node.contains(document.activeElement)));}
        await page.keyboard.press('Escape');assert(await settings.isHidden());
        assert.equal(await page.evaluate(() => chess.history().length), 0, 'Closing settings applies depth changes to Full lines');
        assert(await page.locator('#open_study_settings').evaluate(node=>node===document.activeElement));
        assert.equal(await page.evaluate(()=>localStorage.getItem('smart_session_goal')),'25');
        await page.locator('#study_mode').click();
        await page.locator('#study_next_move').click();
        const readingFen = await page.evaluate(() => chess.fen());
        await page.locator('#open_study_settings').click();
        assert.equal(await page.locator('#settings_tab_general').getAttribute('aria-selected'),'true');
        await page.locator('#settings_tab_practice').click();
        await page.locator('#max_depth_sub').click();
        await settings.locator('[data-bs-dismiss]').click();
        assert.equal(await page.evaluate(() => chess.fen()), readingFen, 'Closing settings never resets the Read position');
        await page.locator('#next_chapter_btn').click();
        await page.locator('#open_study_settings').click();
        await page.locator('#settings_tab_practice').click();
        assert(!await page.locator('#limit_practice_depth').isChecked());
        assert(await page.locator('#max_depth_range').isDisabled());
        await page.keyboard.press('Escape');
        await page.locator('#prev_chapter_btn').click();
        await page.locator('#open_study_settings').click();
        await page.locator('#settings_tab_practice').click();
        assert(await page.locator('#limit_practice_depth').isChecked());
        assert.equal(await page.locator('#max_depth_range').inputValue(), '1');
        await page.keyboard.press('Escape');
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
        await page.locator('#practice_smart').click();
        await page.waitForFunction(() => document.getElementById('practice_smart').getAttribute('aria-pressed') === 'true');
        await page.evaluate(() => {
            window.depthChapterSelections = 0;
            document.getElementById('chapter_select').addEventListener('change', () => window.depthChapterSelections++);
        });
        await page.locator('#open_study_settings').click();
        await page.locator('#settings_tab_practice').click();
        await page.locator('#limit_practice_depth').check();
        const nextDepth = await page.locator('#max_depth_range').inputValue() === '1' ? '2' : '1';
        await page.locator('#max_depth_range').fill(nextDepth);
        await page.locator('#max_depth_range').dispatchEvent('change');
        assert.equal(await page.evaluate(() => window.depthChapterSelections), 0, 'Smart keeps its target while settings are open');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => window.depthChapterSelections > 0);
        assert.deepEqual(errors,[]);
        console.log('Training Bootstrap layout, settings tabs, depth, goals, details/comments, history, progress navigation, focus and mobile passed');
    } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
