const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');

class BrowserManager {
  constructor() {
    this.browsers = new Map();
    this.browserPool = null;
    this.MAX_BROWSERS = 10;
    this.SCREENSHOT_WIDTH = 1280;
    this.SCREENSHOT_HEIGHT = 720;
  }

  async initialize() {
    if (!this.browserPool) {
      this.browserPool = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
    }
  }

  async createBrowser(sessionId, url = 'about:blank') {
    await this.initialize();

    if (this.browsers.size >= this.MAX_BROWSERS) {
      throw new Error('Maximum concurrent browsers reached');
    }

    const browserId = uuidv4();
    try {
      const page = await this.browserPool.newPage();
      await page.setViewport({
        width: this.SCREENSHOT_WIDTH,
        height: this.SCREENSHOT_HEIGHT
      });

      const browserData = {
        id: browserId,
        sessionId,
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

      await browser.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      browser.url = url;
      browser.lastActivity = new Date();
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
      await browser.page.click({ x, y });
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
      await browser.page.type('body', text);
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
      await browser.page.goBack({ waitUntil: 'networkidle2', timeout: 30000 });
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
      await browser.page.goForward({ waitUntil: 'networkidle2', timeout: 30000 });
      browser.lastActivity = new Date();
    } catch (error) {
      throw new Error(`Forward navigation failed: ${error.message}`);
    }
  }

  async screenshot(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error('Browser not found');
    }

    try {
      const screenshot = await browser.page.screenshot({ encoding: 'base64' });
      browser.lastActivity = new Date();
      return screenshot;
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
      await browser.page.close();
      this.browsers.delete(browserId);
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

    if (this.browserPool) {
      await this.browserPool.close();
      this.browserPool = null;
    }
  }
}

module.exports = BrowserManager;
