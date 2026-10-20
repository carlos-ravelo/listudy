const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const webpack = require('webpack');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'listudy-sparring-'));
const render = source => source.replace(/<%=\s*dgettext[^%]*%>/g,
    expression => expression.match(/"(?:\\.|[^"\\])*"/g)[1].slice(1, -1)).replace(/<%[\s\S]*?%>/g, '');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const infoBoxes = read('lib/listudy_web/templates/component/infoboxes.html.eex').replace(/<%[\s\S]*?%>/g, '');
const html = `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/assets/css/colors.css">
<link rel="stylesheet" href="/assets/static/css/chessground.css">
<link rel="stylesheet" href="/assets/css/features/chapter_editor.css">
<link rel="stylesheet" href="/assets/css/features/study_presentation.css">
<link rel="stylesheet" href="/assets/css/features/sparring.css">
<style>:root{--study-divider:#bbb}.study-board-frame{width:min(500px,90vw)}#chessground{width:100%;height:auto;aspect-ratio:1}#study_sparring{max-width:360px}.success{background:var(--success-bg);color:var(--success-color)}.error{background:var(--error-bg);color:var(--error-color)}.info{background:var(--info-bg);color:var(--info-color)}.hidden{display:none}</style></head><body>
<div class="study-workspace">
<button type="button" id="open_study_settings" data-study-dialog="study_settings_dialog">Settings</button>
<details id="study_more_actions" class="study-tools-menu"><summary>More</summary><button type="button" data-study-dialog="study_sparring_history_dialog">Sparring history</button></details>
<div class="study-session-controls"><button id="practice_sparring">Sparring</button><button id="practice_smart">Smart</button><button id="practice_lines">Lines</button></div>
<div class="study-primary-actions"><button id="hints">Hint</button><button id="reset_line" data-reset-game="Reset game">Reset line</button></div>
${render(read('lib/listudy_web/templates/study/_sparring_status.html.eex'))}
<div class="study-board-frame"><div id="chessground" class="cg-wrap" tabindex="-1"></div>
${render(read('lib/listudy_web/templates/component/promotion_picker.html.eex'))}</div>
<nav aria-label="Move navigation"><button id="study_previous_move" aria-label="Previous move">←</button><button id="study_next_move" aria-label="Next move">→</button></nav>
<div class="study-feedback" role="status" aria-live="polite" aria-label="Move feedback">${infoBoxes}</div>
${render(read('lib/listudy_web/templates/study/_sparring.html.eex'))}
${render(read('lib/listudy_web/templates/study/_study_settings.html.eex').replace('<%= render "_sparring_settings.html" %>', read('lib/listudy_web/templates/study/_sparring_settings.html.eex')))}
${render(read('lib/listudy_web/templates/study/_sparring_history.html.eex'))}</div>
<script>window.sound_enabled=true;window.sound_volume=0.5;window.playedSounds=[];
window.Audio=class {constructor(src){this.src=src}load(){}cloneNode(){return this}play(){playedSounds.push(this.src);return Promise.resolve()}};</script>
<script src="/bundle.js"></script><script>
window.engineTrace = []; window.workerCommands = []; window.workerUrls = [];
window.Worker = class extends Worker {
  constructor(url) { super(url); workerUrls.push(url); this.commands = []; workerCommands.push(this.commands); this.addEventListener('message', event => engineTrace.push(String(event.data))); }
  postMessage(message) { this.commands.push(message); engineTrace.push('> ' + message); super.postMessage(message); }
};
window.chapter = {headers: {Event:'Test chapter'},root:[{move:'e4',children:[{move:'e5',children:[{move:'Nf3',children:[]}]}]}]};
window.savedResults={};window.decisions=[];window.stops=0;window.moveNavigation={update(){}};
window.board=Sparring.Chessground(document.getElementById('chessground'),{drawable:{brushes:{normal:{key:'n',color:'#3333ff',opacity:0.6,lineWidth:10}}},movable:{free:false,events:{after:(from,to)=>controller.move(from,to)}}});
Sparring.setupStudyFeedback({durationMs:400});
window.controller=Sparring.setupStudySparring({getPlayer:()=> 'white',getChapters:()=>window.studyChapters || [chapter],getTitle:()=> 'Test study',getBoard:()=>board,
 onPosition(){moveNavigation.update()},
 createEngine:options=>window.fakeEngine || Sparring.createSparringEngine(options),
 readStrength:()=>localStorage.getItem('test_strength'),writeStrength:level=>localStorage.setItem('test_strength',level),
 readPreferences:()=>JSON.parse(localStorage.getItem('test_sparring_preferences')||'{}'),writePreferences:value=>localStorage.setItem('test_sparring_preferences',JSON.stringify(value)),
 showHints(routes){window.hintRoutes=routes;board.setShapes([{orig:'e2',dest:'e4',brush:'green'}])},
 onDecision(record){decisions.push(record)},saveResult(record){savedResults[record.id]=record},getHistory:()=>Object.values(savedResults)});
moveNavigation=Sparring.setupStudyMoveNavigation({goBack:()=>controller.back(),goForward:()=>controller.forward(),getState:()=>controller.navigation()});
Sparring.setupStudyToolsMenu();Sparring.setupStudyDialogs();
for (const [id,text] of Object.entries({arrows_toggle:'New moves (2 times)',comments_toggle:'When hints are visible',arrow_type:'Moves and annotations',move_delay:'Instant',line_review:'Fast review'})) document.getElementById(id).textContent=text;
document.getElementById('hints').onclick=()=>controller.hint();
document.getElementById('reset_line').onclick=()=>controller.start();
document.getElementById('practice_lines').onclick=()=>{controller.stop();stops++};
</script></body></html>`;
const fixtureEntry = path.join(temp, 'fixture.cjs');
fs.writeFileSync(fixtureEntry, `module.exports={...require(${JSON.stringify(path.join(root, 'assets/js/modules/sparring/study_adapter.js'))}),...require(${JSON.stringify(path.join(root, 'assets/js/modules/sparring/uci_engine.js'))}),...require(${JSON.stringify(path.join(root, 'assets/js/modules/stockfish.js'))}),...require(${JSON.stringify(path.join(root, 'assets/js/modules/study_page_controls.js'))}),...require(${JSON.stringify(path.join(root, 'assets/js/modules/study_feedback.js'))}),...require(${JSON.stringify(path.join(root, 'assets/js/modules/info_boxes.js'))}),Chessground:require(${JSON.stringify(path.join(root, 'assets/node_modules/chessground'))}).Chessground}`);

(async () => {
    await new Promise((resolve, reject) => webpack({ mode: 'development',
        context: path.join(root, 'assets'), entry: fixtureEntry,
        output: { path: temp, filename: 'bundle.js', library: 'Sparring' }
    }, (error, stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString())) : resolve()));
    const server = http.createServer((request, response) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); return; }
        const file = pathname === '/bundle.js' ? path.join(temp, 'bundle.js')
            : pathname.startsWith('/stockfish/') ? path.join(root, 'assets/node_modules/stockfish/bin', path.basename(pathname))
            : path.join(root, pathname);
        if (!file.startsWith(root + path.sep) && !file.startsWith(temp + path.sep) || !fs.existsSync(file)) {
            response.statusCode = 404; response.end(); return;
        }
        response.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm'
            : file.endsWith('.css') ? 'text/css' : 'text/javascript');
        response.end(fs.readFileSync(file));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
            headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage({ acceptDownloads: true });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('requestfailed', request => errors.push(request.url() + ': ' + request.failure().errorText));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        assert.equal(await page.textContent('#reset_line'), 'Reset line');
        await page.click('#study_more_actions > summary');
        await page.click('[data-study-dialog="study_sparring_history_dialog"]');
        assert.equal(await page.locator('[data-sparring="history-empty"]').isVisible(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.parentElement.id), 'study_more_actions');
        await page.click('#practice_sparring');
        assert.equal(await page.textContent('#reset_line'), 'Reset game');
        await page.waitForSelector('cg-board piece');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.textContent('[data-sparring="phase"]'), 'Repertoire');
        assert.equal(await page.textContent('[data-sparring="status"]'), 'Your move');
        assert.equal(await page.locator('#sparring_title, [data-sparring="leave"]').count(), 0);
        assert.equal(await page.locator('[data-sparring="history"]').isHidden(), true);
        assert.equal(await page.textContent('[data-sparring="analyze"]'), 'Pause and review');
        assert.equal(await page.getAttribute('[data-sparring="resign"]','aria-label'), 'Resign game');
        assert.equal(await page.locator('cg-board').count(), 1);
        assert.equal(await page.locator('[data-sparring="back"], [data-sparring="forward"]').count(),0);
        assert.equal(await page.inputValue('[data-sparring="strength"]'), '2');
        assert.equal(await page.locator('#study_sparring [data-sparring="strength"], #study_sparring [data-sparring="history"]').count(),0);
        assert.equal(await page.locator('#study_sparring .sparring-note').filter({hasText:'six decisions'}).count(),0);
        await page.click('#open_study_settings');
        assert.equal(await page.getAttribute('#settings_tab_sparring','aria-selected'),'true');
        await page.locator('#settings_tab_sparring').focus();
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.getAttribute('#settings_tab_practice','aria-selected'),'true');
        assert.equal(await page.locator('#settings_panel_sparring').isHidden(),true);
        await page.screenshot({path:'/tmp/listudy-settings-practice-desktop.png'});
        await page.keyboard.press('Home');
        assert.equal(await page.getAttribute('#settings_tab_general','aria-selected'),'true');
        await page.screenshot({path:'/tmp/listudy-general-settings-desktop.png'});
        await page.setViewportSize({width:320,height:844});
        await auditButtons();
        assert(await page.locator('#settings_panel_general').evaluate(panel=>panel.scrollWidth<=panel.clientWidth+1));
        await page.screenshot({path:'/tmp/listudy-general-settings-mobile.png'});
        await page.setViewportSize({width:1280,height:900});
        await page.locator('#settings_tab_general').focus();
        await page.keyboard.press('End');
        assert.equal(await page.getAttribute('#settings_tab_sparring','aria-selected'),'true');
        await page.setViewportSize({width:320,height:844});
        await page.screenshot({path:'/tmp/listudy-settings-sparring-mobile.png'});
        await page.evaluate(()=>document.documentElement.dataset.theme='dark');
        await page.screenshot({path:'/tmp/listudy-settings-sparring-dark.png'});
        await page.evaluate(()=>delete document.documentElement.dataset.theme);
        await auditButtons();
        await page.setViewportSize({width:1280,height:900});
        assert.equal(await page.locator('.sparring-help > p').first().isVisible(),false);
        await auditButtons();
        await page.selectOption('[data-sparring="strength"]', '1');
        assert.equal(await page.inputValue('[data-sparring="review-every"]'),'0');
        assert.equal(await page.locator('[data-sparring="pause-blunder"]').isChecked(),false);
        await page.selectOption('[data-sparring="review-every"]','10');
        await page.check('[data-sparring="pause-blunder"]');
        assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('test_sparring_preferences'))),{reviewEvery:10,pauseOnBlunder:true,live:true});
        await page.selectOption('[data-sparring="review-every"]','0');
        await page.uncheck('[data-sparring="pause-blunder"]');
        await page.screenshot({path:'/tmp/listudy-sparring-review-settings.png'});
        await page.locator('#study_settings_dialog button').filter({hasText:'Close'}).click();
        assert.equal(await page.evaluate(()=>document.activeElement.id),'open_study_settings');
        assert.equal(await page.evaluate(() => localStorage.getItem('test_strength')), '1');
        async function auditButtons() {
            const dialog = page.locator('dialog[open]');
            const buttons = await dialog.count() ? dialog.locator('button:visible, summary:visible')
                : page.locator('#study_sparring button:visible, [data-promotion-picker]:visible button, #practice_sparring, #hints, #reset_line');
            await page.keyboard.press('Tab');
            for (let index = 0; index < await buttons.count(); index++) {
                const button = buttons.nth(index);
                const name = await button.getAttribute('aria-label') || await button.textContent();
                assert(name.trim(), 'Every button needs an accessible name');
                const bounds = await button.boundingBox();
                assert(bounds.width >= 43.9 && bounds.height >= 43.9, `${name}: target smaller than 44px`);
                assert(bounds.x >= 0 && bounds.x + bounds.width <= await page.evaluate(() => innerWidth) + 1, `${name}: overflows viewport`);
                if (await button.isEnabled()) {
                    await button.focus();
                    assert(await button.evaluate(element => getComputedStyle(element).outlineStyle !== 'none'), `${name}: missing keyboard focus`);
                }
            }
        }
        async function downloadPGN(button) {
            const pending = page.waitForEvent('download');
            await button.click();
            const download = await pending;
            assert.equal(download.suggestedFilename(), 'listudy-sparring.pgn');
            const pgn = fs.readFileSync(await download.path(), 'utf8');
            assert(pgn.includes('[Event "Test study"]'));
            assert(pgn.includes('1. e4 e5'));
        }
        async function auditActionLayout() {
            const state = await page.locator('.sparring-actions').evaluate(group=>{
                const primary=group.querySelector('[data-primary="true"]');
                const other=[...group.children].find(button=>!button.hidden && button!==primary && !button.classList.contains('sparring-resign'));
                return {primary:primary.getAttribute('data-sparring'),first:group.firstElementChild===primary,
                    columns:getComputedStyle(group).display,theory:group.dataset.theory==='true',
                    sameRow:!other || Math.abs(primary.getBoundingClientRect().top-other.getBoundingClientRect().top)<1,
                    primaryWidth:primary.getBoundingClientRect().width,groupWidth:group.getBoundingClientRect().width,
                    flagWidth:group.querySelector('.sparring-resign').getBoundingClientRect().width,hasOther:!!other};
            });
            assert.equal(state.columns,'grid');
            assert.equal(state.first,true);
            assert.equal(state.flagWidth,44);
            if(state.theory) assert(state.sameRow);
            else if(state.hasOther) assert(Math.abs(state.primaryWidth-state.groupWidth)<1);
        }
        await auditButtons();
        await auditActionLayout();
        await page.setViewportSize({width:320,height:844});
        await auditActionLayout();
        await auditButtons();
        await page.screenshot({path:'/tmp/listudy-sparring-actions-mobile.png'});
        await page.setViewportSize({width:1280,height:900});
        async function move(from, to) {
            await page.locator('#chessground').scrollIntoViewIfNeeded();
            await page.evaluate(() => board.state.dom.bounds.clear());
            const bounds = await page.locator('#chessground').boundingBox();
            for (const square of [from, to]) await page.mouse.click(
                bounds.x + (square.charCodeAt(0) - 97 + 0.5) * bounds.width / 8,
                bounds.y + (8 - Number(square[1]) + 0.5) * bounds.height / 8, { delay: 70 });
        }
        const actionTop = () => page.locator('.sparring-actions').evaluate(element=>element.getBoundingClientRect().top+scrollY);
        const initialActionTop = await actionTop();
        await move('d2', 'd4');
        await page.waitForFunction(() => document.getElementById('error_text').textContent.includes('Outside your repertoire'));
        assert.equal(await page.locator('.study-feedback').evaluate(element=>getComputedStyle(element).position),'fixed');
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#error').isVisible(),true,'Errors must not disappear on a timer');
        const feedbackAvoidsBoard = () => page.evaluate(()=>{
            const notice=document.querySelector('.study-feedback').getBoundingClientRect();
            return ['#chessground','.sparring-actions','#study_previous_move','#study_next_move'].every(selector=>{
                const target=document.querySelector(selector).getBoundingClientRect();
                return notice.right<=target.left || notice.left>=target.right || notice.bottom<=target.top || notice.top>=target.bottom;
            });
        });
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert(await feedbackAvoidsBoard());
        await page.setViewportSize({width:320,height:844});
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        assert(await feedbackAvoidsBoard(),'Mobile notifications must avoid the board and play controls');
        await page.screenshot({path:'/tmp/listudy-floating-feedback-mobile.png'});
        await page.setViewportSize({width:1280,height:900});
        assert.equal(await page.evaluate(()=>document.activeElement.closest('.study-feedback')),null);
        assert(Math.abs(await actionTop()-initialActionTop)<1,'Error feedback must not shift controls');
        await page.evaluate(()=>{
            document.getElementById('error_text').textContent='Long translated feedback '.repeat(100);
            document.getElementById('success_text').textContent='A second message';
            document.getElementById('success').classList.remove('hidden');
        });
        assert(Math.abs(await actionTop()-initialActionTop)<1,'Long and simultaneous messages must not shift controls');
        await page.waitForFunction(()=>document.querySelector('.study-feedback').scrollHeight>document.querySelector('.study-feedback').clientHeight);
        await page.evaluate(()=>controller.render());
        await page.click('#hints');
        assert.equal(await page.evaluate(() => board.state.drawable.shapes[0].dest), 'e4');
        await move('e2', 'e4');
        await page.waitForFunction(() => board.state.pieces.get('e5')?.color === 'black');
        assert(Math.abs(await actionTop()-initialActionTop)<1,'Success feedback must not shift controls');
        assert.equal(await page.locator('[data-sparring="moves"] [data-grade="theory"]').count(), 1);
        await page.mouse.move(0,0);
        await page.waitForFunction(()=>document.getElementById('success').classList.contains('hidden'));
        assert.equal(await page.locator('.study-feedback').evaluate(element=>element.getBoundingClientRect().height),0);
        await page.evaluate(()=>Sparring.set_text('success','Confirmation'));
        await page.locator('#success .close_button').focus();
        await page.waitForTimeout(500);
        assert.equal(await page.locator('#success').isVisible(),true,'Focused messages must stay available');
        await page.keyboard.press('Enter');
        assert.equal(await page.locator('#success').isHidden(),true);
        await page.evaluate(()=>Sparring.set_text('error','Persistent error'));
        await page.locator('#error .close_button').click();
        assert.equal(await page.locator('#error').isHidden(),true);
        assert(Math.abs(await actionTop()-initialActionTop)<1,'Dismissing notifications must not shift controls');
        const liveFen = await page.evaluate(() => board.state.pieces.get('e4')?.color);
        await page.click('#study_previous_move');
        assert.equal(await page.evaluate(() => controller.navigation().canGoForward), true);
        assert.equal(await page.evaluate(() => board.state.movable.dests.size), 0);
        await page.evaluate(() => controller.move('g1', 'f3'));
        assert.equal(await page.evaluate(() => board.state.pieces.get('f3')?.role || null), null);
        await page.click('[data-sparring="latest"]');
        assert.equal(await page.evaluate(() => board.state.pieces.get('e4')?.color), liveFen);
        assert.equal(await page.locator('[data-sparring="latest"]').isHidden(), true);

        await move('g1', 'f3');
        await page.waitForFunction(() => document.querySelector('[data-sparring="phase"]').textContent === 'Against Stockfish' && document.querySelector('[data-sparring="status"]').textContent === 'Your move',
            null, { timeout: 30000 });
        assert.equal(await page.textContent('[data-sparring="phase"]'), 'Against Stockfish', await page.evaluate(() => engineTrace.slice(-12).join('; ')));
        assert((await page.evaluate(() => playedSounds.length)) >= 4);
        assert(await page.evaluate(() => workerCommands.some(commands =>
            commands.includes('setoption name UCI_LimitStrength value true') && commands.includes('setoption name UCI_Elo value 1320'))));
        // Make a legal engine-phase decision, then review before the checkpoint.
        const next = await page.evaluate(() => {
            const [from, tos] = [...board.state.movable.dests][0]; return [from, tos[0]];
        });
        await move(...next);
        await page.waitForFunction(() => !document.querySelector('[data-sparring="analyze"]').disabled ||
            !document.querySelector('[data-sparring="summary"]').hidden, null, { timeout: 30000 });
        assert(await page.evaluate(() => workerCommands.some(commands =>
            commands.includes('setoption name Skill Level value 20') &&
            commands.includes('setoption name UCI_LimitStrength value false') && !commands.some(command=>command.startsWith('setoption name UCI_Elo')))));
        assert.equal(await page.locator('#error_text, #success_text, #info_text').evaluateAll(elements =>
            elements.some(element => /percentage|winning chances|pp|3\.0/.test(element.textContent))), false);
        if (await page.locator('[data-sparring="summary"]').isHidden()) await page.click('[data-sparring="analyze"]');
        await page.waitForSelector('[data-sparring="summary"]', { state: 'visible' });
        await auditActionLayout();
        const reviewCount = await page.evaluate(() => Object.values(savedResults)[0].reviews.length);
        assert([0, 1].includes(reviewCount));
        assert.equal(Boolean(await page.textContent('[data-sparring="coverage"]')), reviewCount === 0);
        assert.equal(await page.textContent('[data-sparring="theory-score"]'), '1/2');
        assert.equal(await page.textContent('[data-sparring="engine-score"]'), `${reviewCount}/1`);
        const gradedMove = page.locator('[data-sparring="moves"] button[data-grade]:not([data-grade=""]):not([data-grade="theory"])').first();
        assert.equal(await gradedMove.count(), reviewCount);
        assert.equal(await page.locator('[data-sparring="grade-counts"] [role="listitem"]').count(), 5);
        assert.equal(await page.locator('[data-sparring="grade-counts"] strong').count(),5);
        await page.locator('[data-sparring="summary"]').screenshot({path:'/tmp/listudy-sparring-results-colour.png'});
        assert.equal(await page.evaluate(() => Object.keys(savedResults).length), 1);
        assert.equal(await page.evaluate(() => Object.values(savedResults)[0].gradingVersion), 'lichess-style-depth-v2');
        assert.equal(await page.evaluate(() => Object.values(savedResults)[0].opponentLevels.at(-1).level), 1);
        await auditButtons();
        await downloadPGN(page.locator('[data-sparring="download"]'));
        assert.equal(await page.locator('[data-sparring="history"]').isHidden(), true);
        if (reviewCount) {
        await gradedMove.click();
        assert.equal(await page.locator('[data-sparring="move-detail"]').isVisible(), true);
        assert((await page.textContent('[data-sparring="move-evaluation"]')).includes('→'),
            await page.evaluate(() => JSON.stringify({rows:Object.values(savedResults)[0].reviews,card:document.querySelector('[data-sparring="move-detail"]').textContent,selected:document.querySelector('[data-sparring="moves"] [aria-current]')?.outerHTML})));
        assert((await page.textContent('[data-sparring="move-recommendation"]')).includes('Best continuation'));
        await page.click('[data-sparring="show-best"]');
        assert(await page.evaluate(() => board.state.drawable.shapes.length > 0));
        await gradedMove.focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => document.activeElement.classList.contains('study-tree-move')), true);
        await page.click('[data-sparring="continue"]');
        await page.waitForFunction(() => !document.querySelector('[data-sparring="analyze"]').disabled);
        assert.equal(await page.locator('[data-sparring="summary"]').isHidden(), true);
        assert.equal(await page.locator('[data-sparring="retry"]').count(), 0);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'chessground');
        await page.click('#open_study_settings');
        await page.uncheck('[data-sparring="live"]');
        assert.equal(await page.locator('[data-sparring="show-best"]').isHidden(), true);
        assert.equal(await page.locator('[data-sparring="moves"] [data-grade="blunder"], [data-sparring="moves"] [data-grade="best"], [data-sparring="moves"] [data-grade="acceptable"], [data-sparring="moves"] [data-grade="inaccuracy"], [data-sparring="moves"] [data-grade="mistake"]').count(), 0);
        await page.check('[data-sparring="live"]');
        await page.keyboard.press('Escape');
        await page.click('[data-sparring="analyze"]');
        await gradedMove.click();
        await page.click('[data-sparring="retry-selected"]');
        assert.equal(await page.locator('[data-sparring="summary"]').isHidden(), true);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'chessground');
        await page.click('[data-sparring="analyze"]');
        assert.equal(await page.textContent('[data-sparring="engine-score"]'), `${reviewCount}/1`);
        }
        page.once('dialog', dialog => dialog.dismiss());
        await page.click('[data-sparring="resign"]');
        assert.equal(await page.locator('[data-sparring="resign"]').isDisabled(), false);
        page.once('dialog', dialog => dialog.accept());
        await page.click('[data-sparring="resign"]');
        assert((await page.textContent('[data-sparring="outcome"]')).includes('0-1'));
        assert.equal(await page.locator('[data-sparring="resign"]').isDisabled(), true);
        assert.equal(await page.locator('[data-sparring="resign"]').isHidden(), true);
        await auditButtons();
        await page.click('#practice_lines');
        assert.equal(await page.textContent('#reset_line'), 'Reset line');
        assert.equal(await page.locator('[data-sparring-board-status]').isHidden(), true);
        assert.equal(await page.evaluate(() => stops), 1);
        await page.click('#study_more_actions > summary');
        await page.click('[data-study-dialog="study_sparring_history_dialog"]');
        assert.equal(await page.locator('[data-sparring="recent"] > details').count(),1);
        assert.equal(await page.locator('[data-sparring="history-empty"]').isHidden(),true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('cg-board').count(), 1);
        assert.equal(await page.inputValue('[data-sparring="strength"]'), '1');
        // Reuse the editor's promotion picker; cancel and underpromote.
        await page.setViewportSize({ width: 320, height: 844 });
        await page.evaluate(() => { chapter={headers:{FEN:'k7/7P/8/8/8/8/8/K7 w - - 0 1'},root:[{move:'h8=N',children:[]}]}; });
        await page.click('#practice_sparring');
        await move('h7', 'h8');
        await page.waitForSelector('[data-promotion-picker]', { state: 'visible' });
        await auditButtons();
        await page.locator('[data-promotion-cancel]').click();
        assert.equal(await page.locator('[data-promotion-picker]').isHidden(), true);
        await move('h7', 'h8');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('[data-promotion-picker]').isHidden(), true);
        assert.equal(await page.evaluate(() => board.state.pieces.get('h7').role), 'pawn');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'chessground');
        await move('h7', 'h8');
        await page.click('[data-promotion="n"]');
        await page.waitForFunction(() => board.state.pieces.get('h8')?.role === 'knight');
        assert.equal(await page.textContent('[data-sparring="status"]'), 'Session finished');
        assert.equal(await page.locator('[data-sparring="summary"]').isVisible(), true);
        await auditButtons();
        await page.click('#study_more_actions > summary');
        await page.click('[data-study-dialog="study_sparring_history_dialog"]');
        await page.locator('[data-sparring="recent"] details > summary').first().click();
        await auditButtons();
        await downloadPGN(page.locator('[data-sparring="recent"] button').first());
        await page.keyboard.press('Escape');
        // Theory exit, empty review and retrying an unavailable engine.
        await page.click('#practice_lines');
        assert.equal(await page.locator('[data-sparring-board-status]').isHidden(), true);
        await page.evaluate(() => {
            chapter = { headers: {Event:'Test chapter'}, root: [{move:'e4',children:[]}] };
            fakeEngine = { async analyze() { throw new Error('offline'); }, async bestMove() { return 'e7e5'; }, cancel() {}, dispose() {} };
        });
        await page.click('#practice_sparring');
        await page.click('[data-sparring="continue"]');
        assert.equal(await page.textContent('[data-sparring="phase"]'), 'Against Stockfish');
        await page.click('[data-sparring="analyze"]');
        assert.equal(await page.locator('[data-sparring="empty-analysis"]').isVisible(), true);
        assert.equal(await page.locator('[data-sparring="download"]').isDisabled(), true);
        await page.click('[data-sparring="continue"]');
        await move('e2', 'e4');
        await page.waitForFunction(() => document.querySelector('[data-sparring="continue"]').textContent === 'Retry Stockfish');
        await auditButtons();
        await page.click('[data-sparring="continue"]');
        await page.waitForFunction(() => board.state.pieces.get('e5')?.color === 'black');
        await page.click('[data-sparring="analyze"]');
        assert((await page.textContent('[data-sparring="coverage"]')).includes('unavailable'));
        await page.setViewportSize({ width: 390, height: 844 });
        const dimensions = await page.locator('#chessground').boundingBox();
        assert(Math.abs(dimensions.width - dimensions.height) < 2);
        assert(dimensions.x >= 0 && dimensions.x + dimensions.width <= 390);
        const badge = await page.locator('[data-sparring-board-status]').boundingBox();
        assert(badge.y < dimensions.y);
        // Study scope: the currently selected chapter is not the repertoire boundary.
        await page.click('#practice_lines');
        await page.evaluate(() => {
            const line = moves => moves.length ? [{move:moves[0],children:line(moves.slice(1))}] : [];
            studyChapters = [
                {headers:{Event:'Promotion',FEN:'k7/7P/8/8/8/8/8/K7 w - - 0 1'},root:line(['h8=N'])},
                {headers:{Event:'Italian',ListudyChapterId:'italian'},root:line(['e4','e5','Nf3','Nc6','Bc4'])},
                {headers:{Event:'Scotch',ListudyChapterId:'scotch'},root:line(['e4','e5','Nf3','Nc6','d4'])},
                {headers:{Event:'Short line'},root:line(['e4'])},
                {headers:{Event:'Queen'},root:line(['d4','d5','c4'])}
            ];
            unionEngineCalls = 0;
            fakeEngine = {async bestMove(){unionEngineCalls++;return 'e5d4'},cancel(){},dispose(){}};
        });
        await page.click('#practice_sparring');
        assert.equal(await page.locator('[data-sparring="start-control"]').getAttribute('hidden'), null);
        assert.equal(await page.locator('[data-sparring="start"] option').count(), 2);
        assert.equal(await page.locator('[data-sparring="start"] option:checked').textContent(), 'Initial position');
        await move('d2','d4');
        await page.waitForFunction(() => board.state.pieces.get('d5')?.color === 'black');
        assert.equal(await page.textContent('[data-sparring="phase"]'), 'Repertoire');
        await page.click('#reset_line');
        await move('e2','e4');
        await page.waitForFunction(() => board.state.pieces.get('e5')?.color === 'black');
        assert.equal(await page.evaluate(() => unionEngineCalls), 0);
        assert.equal(await page.textContent('[data-sparring="phase"]'), 'Repertoire');
        await move('g1','f3');
        await page.waitForFunction(() => board.state.pieces.get('c6')?.role === 'knight');
        await page.click('#hints');
        assert.deepEqual(await page.evaluate(() => hintRoutes.map(route => route.chapter)), [1,2]);
        await move('d2','d4');
        await page.waitForFunction(() => document.querySelector('[data-sparring="phase"]').textContent === 'Against Stockfish');
        assert.equal(await page.evaluate(() => unionEngineCalls), 1);
        await page.click('[data-sparring="analyze"]');
        assert.equal(await page.evaluate(() => Object.values(savedResults).some(record => record.scope === 'study' && record.sources.some(source => source.id === 'scotch'))), true);
        await page.click('#open_study_settings');
        await page.selectOption('[data-sparring="start"]','k7/7P/8/8/8/8/8/K7 w - - 0 1');
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => board.state.pieces.get('h7')?.role === 'pawn');
        assert.equal(await page.textContent('[data-sparring="phase"]'), 'Repertoire');
        await move('h7','h8');
        await page.click('[data-promotion="n"]');
        await page.waitForFunction(() => document.querySelector('[data-sparring="phase"]').textContent === 'Session finished');
        assert.equal(await page.evaluate(() => crossOriginIsolated), false);
        assert.equal(await page.evaluate(() => workerUrls.every(url=>url==='/stockfish/19.0.1/stockfish-19-lite-single.js')), true);
        assert((await page.evaluate(() => engineTrace.find(line=>line.startsWith('id name ')))).includes('Stockfish 19 Lite WASM'));
        // The shared loader also serves Play Stockfish and Endgames, without global script tags.
        const shared = await page.evaluate(async()=>{
            const first=[],second=[];
            let callback=false;
            const worker=await Sparring.load_stockfish(line=>first.push(line),()=>callback=true);
            await Sparring.load_stockfish(line=>second.push(line));
            await new Promise((resolve,reject)=>{
                const timer=setTimeout(()=>reject(new Error('Shared engine timeout')),15000);
                const handler=event=>{if(event.data.startsWith('bestmove ')){clearTimeout(timer);worker.removeEventListener('message',handler);resolve()}};
                worker.addEventListener('message',handler);
                worker.postMessage('position startpos moves e2e4');worker.postMessage('go depth 3');
            });
            worker.terminate();
            return {callback,first:first.length,second:second.some(line=>line.startsWith('bestmove '))};
        });
        assert.deepEqual(shared,{callback:true,first:0,second:true});
        const fallback=await page.evaluate(()=>new Promise((resolve,reject)=>{
            const worker=Sparring.createStockfishWorker({forceFallback:true});
            const timer=setTimeout(()=>{worker.terminate();reject(new Error('Fallback timeout'))},20000);
            const lines=[];
            worker.onmessage=event=>{
                lines.push(String(event.data));
                if(event.data==='uciok'){
                    worker.postMessage('setoption name UCI_LimitStrength value true');
                    worker.postMessage('setoption name UCI_Elo value 1320');
                    worker.postMessage('position startpos moves e2e4');worker.postMessage('go depth 2');
                }
                if(event.data.startsWith('bestmove ')){clearTimeout(timer);worker.terminate();resolve(lines)}
            };
            worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error('Fallback unavailable'))};
            worker.postMessage('uci');
        }));
        assert(fallback.some(line=>line.startsWith('id name Stockfish 19')));
        assert(fallback.some(line=>line.startsWith('option name UCI_Elo')));
        assert(fallback.some(line=>/^bestmove [a-h][1-8][a-h][1-8]/.test(line)));
        await page.evaluate(async () => {
            const engine = Sparring.createSparringEngine({strength: 8, deviceMemory: 1});
            try {
                const result = await engine.analyze({initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', moves: []}, {movetime: 150});
                if (!result.score) throw Error('No analysis with reduced Hash');
            } finally {engine.dispose();}
        });
        assert(await page.evaluate(() => workerCommands.some(commands =>
            commands.includes('setoption name Hash value 4') &&
            commands.indexOf('setoption name Hash value 4') < commands.indexOf('isready'))));
        console.log('Shared loader, native Elo, independent full-strength analysis and same-release JS fallback passed');
        console.log('Bundled engine:', await page.evaluate(() => engineTrace.find(line => line.startsWith('id name '))));
        await page.evaluate(async () => {
            controller.stop();
            studyChapters = [{headers: {}, root: []}];
            window.analysisResolvers = [];
            let calls = 0;
            fakeEngine = {
                analyze(state) {
                    const value = {targetReached: true, depth: 18, score: {type: 'cp', value: 0},
                        uci: state.turn === 'w' ? state.moves.length === 0 ? 'd2d4' : 'g1f3' : 'e7e5', pv: []};
                    if (++calls <= 2) return Promise.resolve(value);
                    return new Promise(resolve => analysisResolvers.push(() => resolve(value)));
                },
                async bestMove(state) { return state.moves.length === 1 ? 'e7e5' : 'b8c6'; },
                canReuseAnalysisMove: () => false, cancel() {}, dispose() {}
            };
            document.querySelector('[data-sparring="live"]').checked = true;
            document.querySelector('[data-sparring="review-every"]').value = '0';
            document.querySelector('[data-sparring="pause-blunder"]').checked = false;
            await controller.start();
            await controller.move('e2', 'e4');
        });
        const gradeLabels = await page.locator('[data-sparring="status"]').evaluate(element => ({
            acceptable: element.dataset.acceptable, best: element.dataset.best
        }));
        assert.equal(await page.textContent('#info_text'), gradeLabels.acceptable);
        await page.evaluate(() => { window.nextMove = controller.move('g1', 'f3'); });
        await page.waitForFunction(() => analysisResolvers.length === 1);
        assert.equal(await page.textContent('#info_text'), '', 'Previous move grade must disappear during the next analysis');
        assert.equal(await page.textContent('#success_text'), '');
        await page.evaluate(() => analysisResolvers[0]());
        await page.waitForFunction(() => analysisResolvers.length === 2);
        assert.equal(await page.textContent('#info_text'), '');
        assert.equal(await page.textContent('#success_text'), '', 'The new grade must wait for the after-move evaluation');
        await page.evaluate(async () => { analysisResolvers[1](); await nextMove; });
        assert.equal(await page.textContent('#success_text'), gradeLabels.best);
        console.log('Live feedback clears the previous move grade and waits for both evaluations');
        assert.deepEqual(errors, []);
        console.log('All Sparring buttons: labels, keyboard focus, touch targets, continue, retry, downloads, history, resignation and promotion passed');
        console.log('Study-wide chapters, merged hints, delayed engine transition, provenance and independent custom starts passed');
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
