import { expect, test, type Page } from '@playwright/test';
import { around, drag, mapState, nodeCenter, openMap, settle } from './helpers';

type TouchEventType = 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel';

test.describe('with a mouse', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse gestures');

  test('a flick keeps the orbit spinning; a lazy drag stops where it is let go', async ({ page }) => {
    await openMap(page, 'instant');
    const arc = (from: number) => Array.from({ length: 11 }, (_, step) => around(page, from + step * 9, 280));
    // 90° in 80 ms, released while moving.
    await drag(page, arc(200), 8);
    const released = (await mapState(page)).angle;
    await page.waitForTimeout(500);
    expect((await mapState(page)).angle - released).toBeGreaterThan(200);

    await page.waitForFunction(() => (window as unknown as { map: { spinPhysics: { mode: string } } }).map.spinPhysics.mode === 'idle', null, { timeout: 15_000 });
    // The same arc over 600 ms, then a 150 ms rest before letting go.
    await drag(page, arc(200), 60, 150);
    const lazyRelease = (await mapState(page)).angle;
    await page.waitForTimeout(400);
    expect(Math.abs((await mapState(page)).angle - lazyRelease)).toBeLessThan(2);
  });

  test('a click on a spinning orbit catches it instead of opening a planet', async ({ page }) => {
    await openMap(page, 'instant');
    await page.evaluate(() => (window as unknown as { map: { spin(speed: number): void } }).map.spin(1200));
    await page.waitForTimeout(150);
    const target = await nodeCenter(page, 'growth');
    await page.mouse.click(target.x, target.y);
    const state = await mapState(page);
    expect(state.spin).toBe('idle');
    expect(state.focus).toBe('product-roadmap-2027');
  });

  test('scrolling toward a planet enters it; scrolling out leaves', async ({ page }) => {
    await openMap(page, 'instant');
    const build = await nodeCenter(page, 'build');
    await page.mouse.move(build.x, build.y);

    for (let notch = 0; notch < 6 && (await mapState(page)).focus !== 'build'; notch += 1) {
      await page.mouse.wheel(0, -100);
      await page.waitForTimeout(120);
    }

    expect((await mapState(page)).focus).toBe('build');
    await settle(page);
    await page.mouse.move(640, 400);

    for (let notch = 0; notch < 6 && (await mapState(page)).focus === 'build'; notch += 1) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(120);
    }

    expect((await mapState(page)).focus).toBe('product-roadmap-2027');
  });

  test('a small zoom out springs back', async ({ page }) => {
    await openMap(page, 'instant');
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, 60);
    await expect.poll(async () => (await mapState(page)).zoom, { timeout: 3000 }).toBeCloseTo(1, 2);
    expect((await mapState(page)).focus).toBe('product-roadmap-2027');
  });

  test('a planet click flies in and lands centered on it', async ({ page }) => {
    await openMap(page);
    await settle(page);
    await page.locator('[data-orbit-node-id="discovery"]').click();
    expect((await mapState(page)).flying).toBe(true);
    await settle(page);
    const center = await nodeCenter(page, 'discovery');
    expect(Math.abs(center.x - 640)).toBeLessThan(2);
    expect(Math.abs(center.y - 400)).toBeLessThan(2);
    await expect(page.locator('.orbit-breadcrumbs__item[aria-current="location"]')).toHaveText('Discovery');
  });

  test('the overview pans with momentum and a click flies into a node', async ({ page }) => {
    await openMap(page, 'view=all&instant');
    const before = await page.evaluate(() => (window as unknown as { map: { camera: { x: number } } }).map.camera.x);
    await drag(page, Array.from({ length: 9 }, (_, step) => ({ x: 300 + step * 20, y: 600 })), 8);
    const cameraX = () => page.evaluate(() => (window as unknown as { map: { camera: { x: number } } }).map.camera.x);
    const released = await cameraX();
    expect(released).toBeLessThan(before);
    // It keeps gliding after the release.
    await expect.poll(cameraX, { timeout: 1500 }).toBeLessThan(released - 20);
    await page.getByRole('button', { name: 'Fit the map' }).click();
    await page.locator('[data-orbit-node-id="growth"]').click();
    await settle(page);
    expect(await mapState(page)).toMatchObject({ mode: 'focus', focus: 'growth' });
  });

  test('the keyboard reaches every node', async ({ page }) => {
    await openMap(page, 'instant');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('data-orbit-node-id', 'product-roadmap-2027');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(':focus')).toHaveAttribute('data-orbit-node-id', 'design');
    await page.keyboard.press('Enter');
    await settle(page);
    expect((await mapState(page)).focus).toBe('design');
    await page.keyboard.press('Escape');
    await settle(page);
    expect((await mapState(page)).focus).toBe('product-roadmap-2027');
    await expect(page.locator(':focus')).toHaveAttribute('data-orbit-node-id', 'design');
  });

  test('the detail sheet opens from a content button and Escape returns focus', async ({ page }) => {
    await openMap(page, 'focus=discovery&instant');
    const button = page.getByRole('button', { name: 'Read note' });
    await button.click();
    const sheet = page.locator('dialog.orbit-sheet[open]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Six weeks of research');
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test('in a scrolling page, a plain scroll scrolls the page and Ctrl + scroll zooms the map', async ({ page }) => {
    await page.goto('/embedded.html');
    await page.waitForFunction(() => document.body.dataset.ready === 'true');
    // The map flies in as it appears, and a wheel during a flight doesn't zoom.
    await settle(page);
    const box = await page.locator('#map').boundingBox();
    await page.mouse.move(box!.x + 100, box!.y + 100);
    await page.mouse.wheel(0, 300);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(200);
    await expect(page.locator('.orbit-hint--visible')).toContainText('scroll to zoom');
    const scrolled = await page.evaluate(() => window.scrollY);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect.poll(() => page.evaluate(() => (window as unknown as { map: { zoomLevel(): number } }).map.zoomLevel())).toBeGreaterThan(1.1);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  });
});

test.describe('with touch', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch gestures');

  test('a tap opens a planet', async ({ page }) => {
    await openMap(page, 'instant');
    await page.locator('[data-orbit-node-id="build"]').tap();
    await settle(page);
    expect((await mapState(page)).focus).toBe('build');
  });

  test('a flick spins the orbit and a touch catches it', async ({ page }) => {
    await openMap(page, 'instant');
    const radius = Math.min(page.viewportSize()!.width, page.viewportSize()!.height) * 0.36;
    await drag(page, Array.from({ length: 11 }, (_, step) => around(page, 180 + step * 9, radius)), 8, 0, 'touch');
    const released = (await mapState(page)).angle;
    await page.waitForTimeout(400);
    const state = await mapState(page);
    expect(state.spin).toBe('coasting');
    expect(state.angle - released).toBeGreaterThan(60);
    // A real touch on the spinning orbit catches it and opens nothing.
    const catchPoint = around(page, 0, radius);
    await page.touchscreen.tap(catchPoint.x, catchPoint.y);
    expect((await mapState(page)).spin).toBe('idle');
    expect((await mapState(page)).focus).toBe('product-roadmap-2027');
  });

  test('a pinch zooms the overview', async ({ page }) => {
    await openMap(page, 'view=all&instant');
    const client = await page.context().newCDPSession(page);
    const viewport = page.viewportSize()!;
    const middle = { x: viewport.width / 2, y: viewport.height / 2 };
    const pinch = (type: TouchEventType, spread: number) => client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [
        { x: middle.x - spread, y: middle.y, id: 1 },
        { x: middle.x + spread, y: middle.y, id: 2 },
      ],
    });
    await pinch('touchStart', 40);

    for (let spread = 50; spread <= 120; spread += 10) {
      await pinch('touchMove', spread);
    }

    await pinch('touchEnd', 0);
    expect((await mapState(page)).zoom).toBeGreaterThan(2);
  });
});

test.describe('links between nodes', () => {
  test('the link button and a link in a note fly to the linked planet', async ({ page }) => {
    await openMap(page, 'sample=format&focus=another-planet&instant');
    await settle(page);
    await page.getByRole('button', { name: 'Go to Headings nest' }).click();
    await settle(page);
    expect((await mapState(page)).focus).toBe('headings-nest');

    await page.evaluate(() => (window as unknown as { map: { flyTo(id: string): void } }).map.flyTo('another-planet'));
    await settle(page);
    await page.getByRole('button', { name: 'Read note' }).click();
    const sheet = page.locator('dialog.orbit-sheet[open]');
    await sheet.getByRole('link', { name: 'Lists' }).click();
    await expect(sheet).toHaveCount(0);
    await settle(page);
    expect((await mapState(page)).focus).toBe('lists');
  });
});

test.describe('your own node types and actions', () => {
  test('people show their initials; a milestone offers its details and its own action', async ({ page }) => {
    await openMap(page, 'sample=types&focus=team&instant');
    await settle(page);
    await expect(page.locator('.orbit-node-content[data-orbit-for="ana-torres"]')).toHaveText('AT');

    await page.evaluate(() => (window as unknown as { map: { flyTo(id: string): void } }).map.flyTo('beta'));
    await settle(page);

    await page.evaluate(() => {
      const target = window as unknown as { actions: string[]; map: { on(name: string, listener: (detail: { action: string }) => void): void } };
      target.actions = [];
      target.map.on('action', (detail) => target.actions.push(detail.action));
    });

    await page.getByRole('button', { name: 'Celebrate' }).click();
    expect(await page.evaluate(() => (window as unknown as { actions: string[] }).actions)).toEqual(['celebrate']);

    await page.getByRole('button', { name: 'Show details' }).click();
    const sheet = page.locator('dialog.orbit-sheet[open]');
    await expect(sheet.locator('.orbit-sheet__details')).toHaveText('Due May 2');
    await expect(sheet.locator('.orbit-sheet__chip--type')).toHaveText('Milestone');
  });
});

test.describe('context menus', () => {
  /** Records `node-context` events, and whether the browser's own menu was kept closed. */
  const recordContexts = async (page: Page): Promise<void> => {
    await page.evaluate(() => {
      const target = window as unknown as {
        contexts: string[];
        browserMenus: boolean[];
        map: { on(name: string, listener: (detail: { node: { id: string } }) => void): void };
      };

      target.contexts = [];
      target.browserMenus = [];
      target.map.on('node-context', (detail) => target.contexts.push(detail.node.id));
      window.addEventListener('contextmenu', (event) => target.browserMenus.push(event.defaultPrevented));
    });
  };

  const recorded = (page: Page): Promise<{ contexts: string[]; browserMenus: boolean[] }> => {
    return page.evaluate(() => {
      const target = window as unknown as { contexts: string[]; browserMenus: boolean[] };
      return { contexts: target.contexts, browserMenus: target.browserMenus };
    });
  };

  test('a right click reports the node and keeps the browser\'s menu closed', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    await openMap(page, 'instant');
    await recordContexts(page);
    const build = await nodeCenter(page, 'build');
    await page.mouse.click(build.x, build.y, { button: 'right' });
    expect(await recorded(page)).toEqual({ contexts: ['build'], browserMenus: [true] });
    expect((await mapState(page)).focus).toBe('product-roadmap-2027');
  });

  test('a long press reports the node once and doesn\'t open it; a tap still does', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'touch');
    await openMap(page, 'instant');
    await recordContexts(page);
    const build = await nodeCenter(page, 'build');
    const client = await page.context().newCDPSession(page);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: build.x, y: build.y, id: 1 }] });
    await page.waitForTimeout(900);
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(100);
    const { contexts, browserMenus } = await recorded(page);
    expect(contexts).toEqual(['build']);
    expect(browserMenus.every(Boolean)).toBe(true);
    expect((await mapState(page)).focus).toBe('product-roadmap-2027');
    // Chrome counts the release as a click: wait out the double click before tapping.
    await page.waitForTimeout(600);
    await page.locator('[data-orbit-node-id="build"]').tap();
    await settle(page);
    expect((await mapState(page)).focus).toBe('build');
  });
});

test.describe('typing on the map', () => {
  /** The texts of the root's children. */
  const branches = (page: Page): Promise<string[]> => {
    return page.evaluate(() => (window as unknown as { map: { getDocument(): { root: { children: { text: string }[] } } } })
      .map.getDocument().root.children.map((child) => child.text));
  };

  test('the + in the orbit takes one idea after another, typed in place', async ({ page, isMobile }) => {
    await openMap(page, 'instant&editable');
    const before = await branches(page);
    const plus = page.locator('[data-orbit-add]');

    if (isMobile) {
      await plus.tap();
    } else {
      await plus.click();
    }

    const field = page.locator('textarea.orbit-editor');
    await expect(field).toBeFocused();
    await page.keyboard.type('Night markets');
    await page.keyboard.press('Enter');
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('');
    await page.keyboard.type('Ferry ride');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(field).toBeHidden();
    expect(await branches(page)).toEqual([...before, 'Night markets', 'Ferry ride']);
    await settle(page);
    await expect(page.locator('.orbit-label[data-orbit-for="night-markets"]')).toBeVisible();
  });

  test('a right click edits a node\'s text where it is', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    await openMap(page, 'instant&editable');
    const build = await nodeCenter(page, 'build');
    await page.mouse.click(build.x, build.y, { button: 'right' });
    const field = page.locator('textarea.orbit-editor');
    await expect(field).toHaveValue('Build');
    await page.keyboard.type('Make it');
    await page.keyboard.press('Enter');
    expect(await branches(page)).toContain('Make it');
    expect((await mapState(page)).focus).toBe('product-roadmap-2027');
  });
});
