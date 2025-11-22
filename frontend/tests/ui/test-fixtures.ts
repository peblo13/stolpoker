import { test as base, expect, Page, APIRequestContext, Browser } from '@playwright/test';

export type UITestFixtures = {
  emitSmartBet: (page: Page, amount: number) => Promise<any>;
  waitForCurrentPlayer: (page: Page, seat: number, timeout?: number) => Promise<boolean>;
  findActorPage: (page1: Page, page2: Page) => Promise<Page>;
  ensurePageOpen: (page: Page, seatHint?: number | null, nickHint?: string | null) => Promise<Page>;
};

export const test = base.extend<UITestFixtures>({
  emitSmartBet: async ({}, use: (fn: (page: Page, amount: number) => Promise<any>) => Promise<void>) => {
    await use(async (page: Page, amount: number) => {
      return page.evaluate((amt: number) => {
        try {
          const helper = (window as any).__testHelpers;
          if (helper && helper.emitSmartBet) {
            return helper.emitSmartBet(amt);
          }
          return null;
        } catch (e) {
          return null;
        }
      }, amount);
    });
  },
  waitForCurrentPlayer: async ({ request }, use) => {
    await use(async (page: Page, seat: number, timeout = 60000) => {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          const r = await request.get('/api/debug/state');
          if (r.status() === 200) {
            const j = await r.json();
            if (j && j.gameState && j.gameState.currentPlayer === seat) return true;
          }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 150));
      }
      return false;
    });
  },
  findActorPage: async ({ request }, use) => {
    await use(async (page1: Page, page2: Page) => {
      // Prefer the debug API if available
      try {
        const r = await request.get('/api/debug/state');
        if (r.status() === 200) {
          const j = await r.json();
          const current = j.gameState.currentPlayer;
          const mySeat1 = await page1.evaluate(() => (window as any).__mySeat || null);
          if (mySeat1 === current) return page1;
          const mySeat2 = await page2.evaluate(() => (window as any).__mySeat || null);
          if (mySeat2 === current) return page2;
        }
      } catch (e) { }
      // Fallback: whichever has bet button enabled
      const enable1 = await page1.locator('button[data-action="bet"]').isEnabled().catch(() => false);
      const enable2 = await page2.locator('button[data-action="bet"]').isEnabled().catch(() => false);
      if (enable2 && !enable1) return page2;
      return page1;
    });
  }
  ,
  ensurePageOpen: async ({ browser, request }: { browser: Browser, request: APIRequestContext }, use: (fn: (page: Page, seatHint?: number | null, nickHint?: string | null) => Promise<Page>) => Promise<void>) => {
    await use(async (page: Page, seatHint: number | null = null, nickHint: string | null = null) => {
      try {
        if (page && !(await page.isClosed())) return page;
      } catch (e) { /* cannot query closed page */ }
      const ctx = await browser.newContext();
      const newPage = await ctx.newPage();
      newPage.on('close', () => console.log('PAGE-REOPENED: close event'));
      newPage.on('crash', () => console.log('PAGE-REOPENED: crash event'));
      newPage.on('console', (msg) => console.log('PAGE-REOPENED LOG:', msg.text()));
      newPage.on('pageerror', (err) => console.log('PAGE-REOPENED ERR:', err));
      const query = [] as string[];
      if (nickHint) query.push(`testNick=${encodeURIComponent(nickHint)}`);
      if (seatHint) query.push(`testSeat=${encodeURIComponent(String(seatHint))}`);
      const BASE = process.env.PW_URL || 'http://localhost:5173';
      await newPage.goto(BASE + (query.length ? `?${query.join('&')}` : ''));
      // If we've opened a specific seat and nick but our join didn't happen, attempt a server-side kick of the occupying player and rejoin
      if (seatHint !== null) {
        try {
          const rstate = await request.get('/api/debug/state');
          if (rstate.ok()) {
            const j = await rstate.json();
            const occupying = (j.gameState.players || []).find((p: any) => p.seat === seatHint);
            const amIIn = (await newPage.evaluate(() => (window as any).__mySeat || null)) === seatHint;
            if (occupying && !amIIn) {
              console.log('ensurePageOpen: seat is occupied, attempting debug kick for seat', seatHint, 'occupant:', occupying.id);
              try {
                await request.post('/api/debug/action', { data: { action: 'kick', seat: seatHint } });
                // Wait briefly for server to process
                await new Promise(r => setTimeout(r, 300));
                // Retry navigation to rejoin
                await newPage.goto(BASE + (query.length ? `?${query.join('&')}` : ''));
                if (nickHint) {
                  try { await newPage.locator('.player-name', { hasText: nickHint }).waitFor({ state: 'visible', timeout: 8000 }); } catch (e) { }
                }
              } catch (e) { console.log('ensurePageOpen: debug kick failed:', e); }
            }
          }
        } catch (e) { /* ignore */ }
      }
      if (nickHint) {
        try { await newPage.locator('.player-name', { hasText: nickHint }).waitFor({ state: 'visible', timeout: 8000 }); } catch (e) { }
      }
      return newPage;
    });
  }
});

export { expect };
