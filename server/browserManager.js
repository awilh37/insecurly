const { chromium } = require('playwright');
const { v4: uuidv4 } = require('uuid');

class BrowserManager {
  constructor() {
    this.browsers = new Map();
    this.browserInstance = null;
    this.MAX_BROWSERS = 10;
    this.SCREENSHOT_WIDTH = 1280;
    this.SCREENSHOT_HEIGHT = 720;
  }

  async initialize() {
    if (!this.browserInstance) {
      try {
        console.log('[BROWSER] Launching Playwright Chromium...');
        this.browserInstance = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
          ]
        });
        console.log('[BROWSER] Playwright Chromium launched successfully');
      } catch (error) {
        console.error('[BROWSER ERROR] Failed to launch Playwright:', error);
        throw new Error(`Failed to launch browser: ${error.message}`);
      }
    }
  }

  async createBrowser(sessionId, url = 'about:blank') {
    await this.initialize();

    if (this.browsers.size >= this.MAX_BROWSERS) {
      throw new Error('Maximum concurrent browsers reached');
    }

    const browserId = uuidv4();
    try {
      const context = await this.browserInstance.newContext({
        viewport: {
          width: this.SCREENSHOT_WIDTH,
          height: this.SCREENSHOT_HEIGHT
        }
      });
      
      const page = await context.newPage();

      const browserData = {
        id: browserId,
        sessionId,
        browser: this.browserInstance,
        context,
        page,
        url: 'about:blank',
        createdAt: new Date(),
        lastActivity: new Date()
      };

      this.browsers.set(browserId, browserData);

      // Navigate to the initial URL
      if (url !== 'about:blank') {
        await this.navigate(browserId, url);
      }

      console.log(`[BROWSER] Created browser ${browserId} for session ${sessionId}`);
      return browserId;
    } catch (error) {
      throw new Error(`Failed to create browser: ${error.message}`);
    }
  }

  async navigate(browserId, url) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      // Validate URL format
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }

      console.log(`[BROWSER] Navigating to ${url}`);
      await browser.page.goto(url, { waitUntil: 'networkidle' });
      browser.url = url;
      browser.lastActivity = new Date();
      console.log(`[BROWSER] Navigation complete`);
    } catch (error) {
      throw new Error(`Navigation failed: ${error.message}`);
    }
  }

  async click(browserId, x, y) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      await browser.page.mouse.click(x, y);
      browser.lastActivity = new Date();
    } catch (error) {
      throw new Error(`Click failed: ${error.message}`);
    }
  }

  async type(browserId, text) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      await browser.page.keyboard.type(text, { delay: 50 });
      browser.lastActivity = new Date();
    } catch (error) {
      throw new Error(`Type failed: ${error.message}`);
    }
  }

  async scroll(browserId, x, y) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      await browser.page.evaluate((scrollX, scrollY) => {
        window.scrollBy(scrollX, scrollY);
      }, x, y);
      browser.lastActivity = new Date();
    } catch (error) {
      throw new Error(`Scroll failed: ${error.message}`);
    }
  }

  async goBack(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      await browser.page.goBack({ waitUntil: 'networkidle' });
      browser.lastActivity = new Date();
    } catch (error) {
      throw new Error(`Back navigation failed: ${error.message}`);
    }
  }

  async goForward(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      await browser.page.goForward({ waitUntil: 'networkidle' });
      browser.lastActivity = new Date();
    } catch (error) {
      throw new Error(`Forward navigation failed: ${error.message}`);
    }
  }

  async keyboard(browserId, type, key, keyCode, ctrlKey, shiftKey, altKey, metaKey) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      const modifiers = [];
      if (ctrlKey) modifiers.push('Control');
      if (shiftKey) modifiers.push('Shift');
      if (altKey) modifiers.push('Alt');
      if (metaKey) modifiers.push('Meta');

      if (type === 'keydown') {
        await browser.page.keyboard.down(key);
      } else if (type === 'keyup') {
        await browser.page.keyboard.up(key);
      }
      browser.lastActivity = new Date();
    } catch (error) {
      throw new Error(`Keyboard event failed: ${error.message}`);
    }
  }

  async doubleClick(browserId, x, y) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      await browser.page.mouse.dblclick(x, y);
      browser.lastActivity = new Date();
    } catch (error) {
      throw new Error(`Double-click failed: ${error.message}`);
    }
  }

  async rightClick(browserId, x, y) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      await browser.page.mouse.click(x, y, { button: 'right' });
      browser.lastActivity = new Date();
    } catch (error) {
      throw new Error(`Right-click failed: ${error.message}`);
    }
  }

  async screenshot(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      const screenshot = await browser.page.screenshot();
      browser.lastActivity = new Date();
      return screenshot.toString('base64');
    } catch (error) {
      throw new Error(`Screenshot failed: ${error.message}`);
    }
  }

  async closeBrowser(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      await browser.context.close();
      this.browsers.delete(browserId);
      console.log(`[BROWSER] Closed browser ${browserId}`);
    } catch (error) {
      throw new Error(`Failed to close browser: ${error.message}`);
    }
  }

  async closeAll() {
    const promises = [];
    for (const [browserId] of this.browsers) {
      promises.push(this.closeBrowser(browserId).catch(err => 
        console.error(`Error closing browser ${browserId}:`, err)
      ));
    }
    await Promise.all(promises);

    if (this.browserInstance) {
      await this.browserInstance.close();
      this.browserInstance = null;
      console.log('[BROWSER] All browsers closed');
    }
  }
}

module.exports = BrowserManager;
