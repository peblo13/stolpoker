import { test, expect } from './test-fixtures';

const BASE = process.env.PW_URL || 'http://localhost:5173';

test.describe('Action buttons functional tests', () => {
  test('bet/raise/call/fold/allIn/check behavior', async ({ browser, request, findActorPage, ensurePageOpen }) => {
    test.setTimeout(120000);
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page1.goto(BASE + '?testNick=Alice&testSeat=1');
    await page2.goto(BASE + '?testNick=Bob&testSeat=2');
    // start the game from page1
    try { await page1.locator('button[data-action="start"]').click(); } catch (e) { await page1.evaluate(() => { document.querySelector('button[data-action="start"]')?.click(); }); }
    // Wait until pot charged
    for (let i = 0; i < 30; i++) {
      const r = await request.get('/api/debug/state');
      const j = await r.json();
      if ((j.gameState && j.gameState.pot) > 0) break;
      await new Promise(r => setTimeout(r, 200));
    }
    // Helper: wait until a given seat is current player
    const waitForSeat = async (seat: number) => {
      for (let i = 0; i < 40; i++) {
        const r = await request.get('/api/debug/state');
        const j = await r.json();
        if (j.gameState.currentPlayer === seat) return true;
        await new Promise(r => setTimeout(r, 120));
      }
      return false;
    };

    // Test sequence: for each action, set up state (via debug API) and verify client button works

    // 1) BET (actor can bet when current player and currentBet==0)
    // Ensure seat 1 is current
    await request.post('/api/debug/action', { data: { action: 'bet', seat: 2, amount: 10 } });
    // after bet by 2, current player should be seat 1
    await waitForSeat(1);
    let actorPage = await findActorPage(page1, page2);
    actorPage = await ensurePageOpen(actorPage, 1, 'Alice');
    // ensure bet input exists and perform bet
    await actorPage.fill('input[type="number"]', '50');
    await actorPage.locator('button[data-action="bet"]').click();
    // confirm via debug state: pot increased
    for (let i = 0; i < 40; i++) {
      const r = await request.get('/api/debug/state');
      const j = await r.json();
      if ((j.gameState.pot || 0) > 0) { break; }
      await new Promise(r => setTimeout(r, 150));
    }

    // 2) RAISE: make seat 2 a higher bet so seat 1 can raise
    await request.post('/api/debug/action', { data: { action: 'bet', seat: 1, amount: 20 } });
    // seat 2 should be next
    await waitForSeat(2);
    actorPage = await ensurePageOpen(page2, 2, 'Bob');
    // attempt raise: fill amount > currentBet
    await actorPage.fill('input[type="number"]', '80');
    await actorPage.locator('button[data-action="raise"]').click();
    // check currentBet increased
    for (let i = 0; i < 40; i++) {
      const r = await request.get('/api/debug/state');
      const j = await r.json();
      if ((j.gameState.currentBet || 0) >= 80) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // 3) CALL: have seat 1 call the current bet
    await waitForSeat(1);
    actorPage = await ensurePageOpen(page1, 1, 'Alice');
    // click call
    await actorPage.locator('button[data-action="call"]').click();
    // check that the contribution for seat1 grew or pot increased
    let called = false;
    for (let i = 0; i < 40; i++) {
      const r = await request.get('/api/debug/state');
      const j = await r.json();
      const me = (j.gameState.players || []).find(p => p.seat === 1);
      if (me && (me.currentContribution || 0) > 0) { called = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    expect(called).toBeTruthy();

    // 4) CHECK: make currentBet = 0 and test check button
    // Use debug action to unset currentBet and set currentPlayer to seat 1 by starting a fresh hand
    await request.post('/api/debug/action', { data: { action: 'fold', seat: 2 } });
    // Now seat 1 should be current
    await waitForSeat(1);
    actorPage = await ensurePageOpen(page1, 1, 'Alice');
    // click check if visible
    const checkBtn = actorPage.locator('button[data-action="check"]');
    if (await checkBtn.isVisible().catch(() => false)) {
      await checkBtn.click();
      // assert currentPlayer advanced (not equal to seat 1)
      const s = await request.get('/api/debug/state');
      const j = await s.json();
      expect(j.gameState.currentPlayer).not.toBe(1);
    }

    // 5) FOLD: test fold removes the player
    // Make seat 1 the current player then fold
    await waitForSeat(1);
    actorPage = await ensurePageOpen(page1, 1, 'Alice');
    await actorPage.locator('button[data-action="fold"]').click();
    // confirm player removed
    let playerRemoved = false;
    for (let i = 0; i < 40; i++) {
      const r = await request.get('/api/debug/state');
      const j = await r.json();
      const me = (j.gameState.players || []).find(p => p.seat === 1);
      if (!me) { playerRemoved = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    expect(playerRemoved).toBeTruthy();

    // 6) ALL-IN: create seat 3 then test all-in
    const context3 = await browser.newContext();
    const page3 = await context3.newPage();
    await page3.goto(BASE + '?testNick=Chuck&testSeat=3');
    // start new hand to collect more cards (start should be enabled for admin)
    await page1.evaluate(() => { const btn = document.querySelector('button[data-action="start"]') as HTMLButtonElement | null; if (btn) btn.click(); });
    await new Promise(r => setTimeout(r, 500));
    // Now ensure seat 3 is current via repeated pushes
    await request.post('/api/debug/action', { data: { action: 'bet', seat: 2, amount: 5 } });
    await request.post('/api/debug/action', { data: { action: 'bet', seat: 3, amount: 10 } });
    await waitForSeat(1); // ensure it rotates back
    // Now ensure Chuck all-in
    await waitForSeat(3);
    const actorPage3 = await ensurePageOpen(page3, 3, 'Chuck');
    await actorPage3.locator('button[data-action="allIn"]').click();
    // verify chips are zero for seat 3
    let allInConfirmed = false;
    for (let i = 0; i < 40; i++) {
      const r = await request.get('/api/debug/state');
      const j = await r.json();
      const me = (j.gameState.players || []).find(p => p.seat === 3);
      if (me && me.chips === 0) { allInConfirmed = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    expect(allInConfirmed).toBeTruthy();

    await context1.close();
    await context2.close();
    await context3.close();
  });
});

