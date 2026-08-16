import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import process from 'node:process';
import {chromium} from 'playwright';

const port = Number(process.env.POC_PORT || 43127);
const baseUrl = `http://127.0.0.1:${port}`;
const serverEntry = 'dist/angular-protobuf-transfercache-poc/server/server.mjs';
const evidenceDir = 'evidence';

await mkdir(evidenceDir, {recursive: true});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn(process.execPath, [serverEntry], {
  env: {...process.env, PORT: String(port)},
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stdout.on('data', (chunk) => (serverLog += chunk));
server.stderr.on('data', (chunk) => (serverLog += chunk));

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) {
      throw new Error(`SSR server exited early (${server.exitCode})\n${serverLog}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/__origin-log`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await delay(100);
  }
  throw new Error(`SSR server did not start\n${serverLog}`);
}

let browser;
try {
  await waitForServer();
  await fetch(`${baseUrl}/api/__reset`, {method: 'POST'});

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage();
  const browserPosts = [];
  const pageErrors = [];

  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      request.url() === `${baseUrl}/api/rpc/document-query`
    ) {
      browserPosts.push({
        method: request.method(),
        url: request.url(),
        contentType: request.headers()['content-type'],
      });
    }
  });
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  const navigation = await page.goto(baseUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  if (!navigation) throw new Error('Navigation returned no HTTP response');
  const ssrHtml = await navigation.text();

  await page.locator('#status').filter({hasText: 'VULNERABLE'}).waitFor({
    state: 'visible',
    timeout: 15_000,
  });

  const browserState = await page.evaluate(() => {
    const text = (selector) =>
      document.querySelector(selector)?.textContent?.trim() ?? null;
    return {
      status: text('#status'),
      vulnerable: document
        .querySelector('#result')
        ?.getAttribute('data-vulnerable'),
      firstId: text('#cached-first .id'),
      secondId: text('#cached-second .id'),
      bypassId: text('#bypass-second .id'),
      firstCapability: text('#cached-first .capability'),
      secondCapability: text('#cached-second .capability'),
      bypassCapability: text('#bypass-second .capability'),
      ngVersion: document.querySelector('app-root')?.getAttribute('ng-version'),
    };
  });

  await page.screenshot({
    path: `${evidenceDir}/playwright.png`,
    fullPage: true,
  });

  const originLog = await fetch(`${baseUrl}/api/__origin-log`).then((response) => {
    if (!response.ok) throw new Error(`Origin log failed: ${response.status}`);
    return response.json();
  });

  const assertions = {
    ssrResponseAlreadyVulnerable: ssrHtml.includes('data-vulnerable="true"'),
    hydratedDomVulnerable:
      browserState.status === 'VULNERABLE' &&
      browserState.vulnerable === 'true',
    cachedSecondReplayedFirst:
      browserState.secondId === 'documentId=100' &&
      browserState.secondCapability === browserState.firstCapability,
    bypassControlCorrect:
      browserState.bypassId === 'documentId=200' &&
      browserState.bypassCapability !== browserState.firstCapability,
    browserOnlySentBypassPost: browserPosts.length === 1,
    originSawNoCachedSecond:
      JSON.stringify(originLog.calls.map(({documentId}) => documentId)) ===
      JSON.stringify([100, 200, 200]),
    originSawExpectedWireBytes:
      JSON.stringify(originLog.calls.map(({bodyHex}) => bodyHex)) ===
      JSON.stringify(['0864', '08c801', '08c801']),
    noPageErrors: pageErrors.length === 0,
  };

  const result = {
    browser: browserState,
    browserPosts,
    originLog: originLog.calls,
    pageErrors,
    assertions,
    passed: Object.values(assertions).every(Boolean),
  };

  await writeFile(
    `${evidenceDir}/playwright-validation.json`,
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result, null, 2));

  if (!result.passed) process.exitCode = 1;
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const serverExited = new Promise((resolve) => server.once('exit', resolve));
    server.kill();
    await Promise.race([serverExited, delay(3_000)]);
  }
  if (server.exitCode === null) server.kill('SIGKILL');
  await writeFile(`${evidenceDir}/playwright-server.log`, serverLog);
}
