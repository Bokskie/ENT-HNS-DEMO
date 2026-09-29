// Verifies the v28c report-header cleanup on the real report pages.
// Run: python -m http.server 8731  (from the project root)  then  node scripts/test_header_v28c_pw.js
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8731/';
const results = [];
const ok = (name, cond, extra) => {
    results.push((cond ? 'PASS ' : 'FAIL ') + name + (extra === undefined ? '' : ' | ' + extra));
    return !!cond;
};

(async () => {
    const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL || 'chrome' });

    // ---------- Desktop: real cf4Form.html, scripts running ----------
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e && e.message)));
    await page.goto(BASE + 'cf4Form.html', { waitUntil: 'load' });
    await page.waitForTimeout(2500);

    const dom = await page.evaluate(() => {
        const cs = (el) => (el ? getComputedStyle(el) : null);
        const g = (id) => document.getElementById(id);
        const header = document.querySelector('.report-header');
        const actions = document.querySelector('.header-actions');
        let recordsSaved = false;
        try {
            window.PatientRecords.recordSave('cf4', { family_name: 'Test', given_name: 'Patient' }, { format: 'Draft' });
            recordsSaved = (window.PatientRecords.getAll() || []).length > 0;
        } catch (e) { recordsSaved = 'threw: ' + e.message; }
        return {
            hasRecordsBtn: !!g('patientRecordsBtn'),
            hasPopover: !!document.querySelector('.patient-records-popover'),
            recordsSaved: String(recordsSaved),
            headerDisplay: cs(header).display,
            headerHeight: Math.round(header.getBoundingClientRect().height),
            headerOverflow: cs(header).overflow,
            wrap: cs(actions).flexWrap,
            pdfBg: cs(g('savePdfBtn')).backgroundColor,
            pdfImage: cs(g('savePdfBtn')).backgroundImage.slice(0, 40),
            pdfAnim: cs(g('savePdfBtn')).animationName,
            printBg: cs(g('printBtn')).backgroundColor,
            newFormBg: cs(g('newFormBtn')).backgroundColor,
            newFormImage: cs(g('newFormBtn')).backgroundImage.slice(0, 40),
            dbRecColor: cs(g('dbRecordsBtn')).color,
            dbRecImage: cs(g('dbRecordsBtn')).backgroundImage,
            draftsBg: cs(g('localDraftsBtn')).backgroundColor,
            saveDbImage: cs(g('saveToDbBtn')).backgroundImage,
            menuTransform: cs(document.querySelector('.header-actions .back-button')).textTransform,
            menuBg: cs(document.querySelector('.header-actions .back-button')).backgroundColor,
            groupLabelShown: getComputedStyle(document.querySelector('.group-label')).display
        };
    });

    ok('Records button is gone', !dom.hasRecordsBtn, 'hasRecordsBtn=' + dom.hasRecordsBtn);
    ok('Records popover not built', !dom.hasPopover, 'hasPopover=' + dom.hasPopover);
    ok('PatientRecords API still logs', dom.recordsSaved === 'true', dom.recordsSaved);
    ok('header is a block (two rows)', dom.headerDisplay === 'block', dom.headerDisplay);
    ok('header not clamped to 36-42px', dom.headerHeight > 70, 'height=' + dom.headerHeight);
    ok('header overflow visible', dom.headerOverflow === 'visible', dom.headerOverflow);
    ok('toolbar wraps', dom.wrap === 'wrap', dom.wrap);
    ok('Save PDF is not legacy green', !/39, 174, 96/.test(dom.pdfBg + dom.pdfImage), dom.pdfBg + ' / ' + dom.pdfImage);
    ok('Save PDF has no pulse animation', dom.pdfAnim === 'none', dom.pdfAnim);
    ok('Print is not legacy purple', !/142, 68, 173/.test(dom.printBg), dom.printBg);
    ok('New Form is not legacy amber', !/245, 158, 11/.test(dom.newFormBg + dom.newFormImage), dom.newFormBg + ' / ' + dom.newFormImage);
    ok('DB Records text is brand sky', dom.dbRecColor === 'rgb(3, 105, 161)', dom.dbRecColor);
    ok('DB Records chip is sky gradient', /14, 165, 233/.test(dom.dbRecImage), dom.dbRecImage);
    ok('My Drafts is neutral panel', dom.draftsBg === 'rgb(255, 255, 255)', dom.draftsBg);
    ok('Save to Database is brand gradient', /2, 132, 199/.test(dom.saveDbImage), dom.saveDbImage);
    ok('Menu link is sentence case', dom.menuTransform === 'none', dom.menuTransform + ' / bg=' + dom.menuBg);
    ok('group labels visible', dom.groupLabelShown !== 'none', dom.groupLabelShown);
    ok('no page errors on CF4', errors.length === 0, errors.join(' ; ').slice(0, 200));

    // Hover the DB Records button -> should fill solid brand blue
    await page.hover('#dbRecordsBtn');
    await page.waitForTimeout(250);
    const hover = await page.evaluate(() => {
        const s = getComputedStyle(document.getElementById('dbRecordsBtn'));
        return { bg: s.backgroundImage, color: s.color };
    });
    ok('DB Records hover fills solid sky', /14, 165, 233/.test(hover.bg) && hover.color === 'rgb(255, 255, 255)', hover.bg.slice(0, 60) + ' ' + hover.color);

    // Dark mode readability
    await page.evaluate(() => document.getElementById('theme-toggle').click());
    await page.waitForTimeout(400);
    const dark = await page.evaluate(() => getComputedStyle(document.getElementById('dbRecordsBtn')).color);
    ok('DB Records readable in dark mode', dark === 'rgb(125, 211, 252)', dark);

    // ---------- Phone: buttons share rows, header stays short ----------
    const phone = await browser.newPage({ viewport: { width: 420, height: 780 } });
    await phone.goto(BASE + 'cf4Form.html', { waitUntil: 'load' });
    await phone.waitForTimeout(2200);
    const mob = await phone.evaluate(() => {
        const group = document.querySelector('.header-btn-group');
        const btns = [...group.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().width));
        return {
            groupWidth: Math.round(group.getBoundingClientRect().width),
            btnWidths: btns,
            headerHeight: Math.round(document.querySelector('.report-header').getBoundingClientRect().height),
            actionsDir: getComputedStyle(document.querySelector('.header-actions')).flexDirection
        };
    });
    ok('phone: group spans the toolbar', mob.groupWidth > 330, JSON.stringify(mob));
    ok('phone: buttons share the row', mob.btnWidths.length > 1 && mob.btnWidths[0] < 300, JSON.stringify(mob.btnWidths));
    ok('phone: header stays under 320px', mob.headerHeight < 320, 'height=' + mob.headerHeight);
    ok('phone: toolbar stays a row', mob.actionsDir === 'row', mob.actionsDir);

    // ---------- Other report pages ----------
    for (const f of ['nasalEndoscopy.html', 'laryngealEndoscopy.html']) {
        const p = await browser.newPage({ viewport: { width: 1180, height: 820 } });
        await p.goto(BASE + f, { waitUntil: 'load' });
        await p.waitForTimeout(2200);
        const r = await p.evaluate(() => {
            const b = document.getElementById('dbRecordsBtn');
            return {
                hasRecordsBtn: !!document.getElementById('patientRecordsBtn'),
                dbColor: b ? getComputedStyle(b).color : 'missing',
                headerH: Math.round(document.querySelector('.report-header').getBoundingClientRect().height)
            };
        });
        ok(f + ': Records button gone', !r.hasRecordsBtn, JSON.stringify(r));
        ok(f + ': DB Records sky chip', r.dbColor === 'rgb(3, 105, 161)', r.dbColor);
        await p.close();
    }

    await browser.close();
    console.log(results.join('\n'));
    const failed = results.filter((r) => r.startsWith('FAIL'));
    console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });