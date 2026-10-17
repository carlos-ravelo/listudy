// Generate the rendered fixture with LISTUDY_LIBRARY_PREVIEW=/tmp/listudy-library-preview.html
// when running study_library_controller_test.exs before this browser smoke test.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
let html = fs.readFileSync(process.env.LISTUDY_LIBRARY_PREVIEW || '/tmp/listudy-library-preview.html', 'utf8').replace(/<script\b[\s\S]*?<\/script>/gi, '');
const rows = [...html.matchAll(/<li class="study-library-row"[\s\S]*?<\/li>/g)].map(match => match[0]);
const ids = rows.map(row => row.match(/data-study-id="(\d+)"/)[1]);
const names = ['White repertoire — Daily summary', 'Black repertoire — Daily summary', 'Endgame essentials'];
const recolor = row => row.replace('data-color="white"', 'data-color="black"').replace(/title="White"/g, 'title="Black"').replace(/>White</g, '>Black<').replace(/♔/g, '♚');
const first = rows.map((row, i) => { const named = row.replace(/Repertoire \d+/g, names[i]); return i === 1 ? recolor(named) : named; });
const references = ['Queen’s Gambit Declined', 'Slav Defense', 'Semi-Slav', 'Catalan', 'Nimzo-Indian', 'King’s Indian',
    'Grünfeld', 'Queen’s Indian', 'Benoni', 'Benko Gambit', 'Dutch Defense', 'London System', 'Trompowsky',
    'Réti Opening', 'English Opening', 'Sicilian Najdorf', 'Sicilian Dragon', 'French Defense', 'Caro-Kann',
    'Scandinavian', 'Pirc Defense', 'Modern Defense', 'Ruy Lopez', 'Italian Game', 'Scotch Game', 'Petroff', 'Philidor'];
const extra = references.map((name, i) => rows[2].replace(/data-study-id="\d+"/, `data-study-id="${2000+i}"`)
    .replace(/Repertoire \d+/g, name).replace(/Keep this source/g, 'Reference lines and annotated ideas'));
html = html.replace(/<ul class="study-library-list">[\s\S]*?<\/ul>/, `<ul class="study-library-list">${first.join('')}${extra.join('')}</ul>`);
html = html.replace('</head>', `<style>${fs.readFileSync(path.join(root, 'assets/css/features/study_library.css'), 'utf8')}${fs.readFileSync(path.join(root, 'assets/css/features/practice_theme.css'), 'utf8')}</style></head>`)
    .replace('</body>', '<script type="module" src="/assets/js/components/site_navigation.js"></script><script type="module" src="/assets/js/components/study_library.js"></script></body>');
let state = { version: 1, groups: { white: 'White repertoire', black: 'Black repertoire', endgames: 'Endgames' }, studies: {} };
ids.forEach((id, i) => state.studies[id] = { location: 'daily', group: ['white', 'black', 'endgames'][i] });
references.forEach((_, i) => state.studies[2000+i] = { location: 'library', group: i % 2 ? 'black' : 'white' });
const initial = structuredClone(state);
let failNext = false;
const escape = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
(async () => {
 const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html.replace(/data-library-state="[^"]*"/, `data-library-state="${escape(JSON.stringify(state))}"`)); return;
    }
    const file = url.pathname.startsWith('/assets/') ? path.join(root, url.pathname) : path.join(root, 'priv/static', url.pathname);
    if (!file.startsWith(root + '/') || !fs.existsSync(file)) { res.statusCode=404; res.end(); return; }
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser = await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 try {
    const page = await browser.newPage({viewport:{width:1280,height:900}});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/study-library',async route=>{
        if (failNext) { failNext=false; await route.fulfill({status:503,json:{error:'Could not save your organization. Try again.'}}); return; }
        const op=route.request().postDataJSON();
        if(op.action==='move') for(const id of op.study_ids){
            state.studies[id] ||= {location:'daily',group:null};
            if('location' in op)state.studies[id].location=op.location;
            if('group' in op)state.studies[id].group=op.group;
        }
        if(op.action==='create_group')state.groups['group-'+Object.keys(state.groups).length]=op.name;
        if(op.action==='rename_group')state.groups[op.group]=op.name;
        if(op.action==='delete_group'){
            delete state.groups[op.group];
            for(const entry of Object.values(state.studies))if(entry.group===op.group)entry.group=null;
        }
        await route.fulfill({json:{data:state}});
    });
    const goto=async()=>{await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForSelector('[data-study-library][data-initialized]');};
    const visible=page.locator('[data-library-row]:visible');
    const saved=()=>page.waitForFunction(()=>document.querySelector('[data-library-save-status]').textContent==='Organization saved.');
    await goto();
    assert.equal(await visible.count(),3);
    await page.locator('[data-library-color]').selectOption('black');
    assert.equal(await visible.count(),1);
    await page.locator('[data-library-color]').selectOption('all');
    await page.screenshot({path:'/tmp/listudy-library-desktop.png',fullPage:true});
    await page.locator('[data-library-view="library"]').click();
    assert.equal(await visible.count(),27);
    await page.screenshot({path:'/tmp/listudy-library-references.png',fullPage:true});
    await page.locator('[data-library-search]').fill('grunfeld');
    assert.equal(await visible.count(),1);
    assert(page.url().includes('q=grunfeld'));
    await page.locator('[data-library-search]').fill('');
    await page.locator('[data-library-view="daily"]').click();
    await page.locator('[data-library-organize]').click();
    await page.locator('[data-library-select-all]').check();
    await visible.first().locator('[data-library-check]').uncheck();
    assert((await page.locator('[data-library-selected]').textContent()).startsWith('2 '));
    await page.locator('[data-library-bulk-location="library"]').click();
    await saved();
    assert.equal(await visible.count(),1);
    await page.locator('[data-library-view="library"]').click();
    assert.equal(await visible.count(),29);
    await visible.first().locator('summary').click();
    await visible.first().locator('[data-library-move-location]').click();
    await saved();
    assert.equal(await visible.count(),28);
    await page.locator('[data-library-view="daily"]').click();
    assert.equal(await visible.count(),2);
    await page.locator('[data-library-manage-groups]').click();
    await page.locator('#library_group_name').fill('Tournament preparation');
    await page.locator('[data-library-create-group] button').click();
    await saved();
    assert.equal(await page.locator('.study-library-group-row').count(),4);
    await page.keyboard.press('Escape');
    await visible.first().locator('summary').click();
    await page.keyboard.press('Escape');
    assert.equal(await visible.first().locator('details').getAttribute('open'),null);
    await visible.first().locator('summary').click();
    await visible.first().locator('[data-library-move-to-group]').click();
    await page.locator('[data-library-move-group]').selectOption('group-3');
    await page.locator('[data-library-move-form] button').click();
    await saved();
    assert.equal(await visible.first().locator('[data-library-row-group]').textContent(),'Tournament preparation');
    await page.locator('[data-library-group]').selectOption('group-3');
    assert.equal(await visible.count(),1);
    await page.locator('[data-library-manage-groups]').click();
    await page.locator('.study-library-group-row').filter({hasText:'Tournament preparation'}).getByRole('button',{name:'Edit: Tournament preparation',exact:true}).click();
    const rename=page.getByRole('textbox',{name:'Group name: Tournament preparation',exact:true});
    await rename.fill('Main repertoire');
    await rename.locator('..').locator('button[type="submit"]').click();
    await saved();
    await page.keyboard.press('Escape');
    assert.equal(await visible.first().locator('[data-library-row-group]').textContent(),'Main repertoire');
    failNext=true;
    await visible.first().locator('summary').click();
    await visible.first().locator('[data-library-move-location]').click();
    await page.waitForFunction(()=>document.querySelector('[data-library-save-status]').classList.contains('is-error'));
    assert.equal(await visible.count(),1);
    await page.reload();
    await page.waitForSelector('[data-study-library][data-initialized]');
    assert.equal(await visible.count(),1);
    await page.locator('[data-library-manage-groups]').click();
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('.study-library-group-row').filter({hasText:'Main repertoire'}).getByRole('button',{name:'Remove group: Main repertoire',exact:true}).click();
    await saved();
    await page.keyboard.press('Escape');
    assert.equal(await visible.count(),2);
    assert.equal(Object.values(state.studies).filter(entry=>entry.location==='library').length,28);
    state.groups={};
    for(const entry of Object.values(state.studies))entry.group=null;
    await goto();
    await visible.first().locator('summary').click();
    await visible.first().locator('[data-library-move-to-group]').click();
    assert.equal(await page.locator('[data-library-groups-dialog]').isVisible(),true);
    await page.locator('#library_group_name').fill('First group');
    await page.locator('[data-library-create-group] button').click();
    await saved();
    await page.waitForFunction(()=>document.querySelector('[data-library-move-dialog]').open);
    assert.equal(await page.locator('[data-library-move-group]').inputValue(),'group-0');
    await page.locator('[data-library-move-form] button').click();
    await saved();
    assert.equal(await visible.first().locator('[data-library-row-group]').textContent(),'First group');
    await page.locator('[data-library-search]').fill('missing-study');
    assert.equal(await visible.count(),0);
    await page.locator('[data-library-show-all]').click();
    assert.equal(await visible.count(),30);
    state=structuredClone(initial);
    await goto();
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'/tmp/listudy-library-mobile.png',fullPage:true});
    for(const width of [320,390,768,1280]){
        await page.setViewportSize({width,height:844});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    }
    await page.setViewportSize({width:390,height:844});
    await visible.first().locator('summary').click();
    await page.screenshot({path:'/tmp/listudy-library-menu.png',fullPage:true});
    await page.keyboard.press('Escape');
    await page.locator('[data-library-manage-groups]').click();
    await page.screenshot({path:'/tmp/listudy-library-groups.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));
    await page.screenshot({path:'/tmp/listudy-library-dark.png',fullPage:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    console.log('Daily/reference views, bulk moves, grouping, rename/removal, failures, persistence, keyboard and responsive checks passed');
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
