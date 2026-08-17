import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import process from 'node:process';
import {chromium} from 'playwright';

const expectedMode =
  process.argv.find((argument) => argument.startsWith('--expect='))?.split('=')[1] ??
  'vulnerable';

if (!['vulnerable', 'fixed'].includes(expectedMode)) {
  throw new Error('Expected --expect=vulnerable or --expect=fixed');
}

const port = Number(process.env.POC_PORT || 43127);
const baseUrl = `http://127.0.0.1:${port}`;
const serverEntry = 'dist/angular-protobuf-transfercache-poc/server/server.mjs';
const evidenceDir = process.env.POC_EVIDENCE_DIR || 'evidence';

await mkdir(evidenceDir, {recursive: true});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sameValues = (actual, expected) =>
  JSON.stringify(actual) === JSON.stringify(expected);

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

async function runCase(browser, bodyType) {
  await fetch(`${baseUrl}/api/__reset`, {method: 'POST'});

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

  try {
    const navigation = await page.goto(`${baseUrl}/${bodyType}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    });
    if (!navigation) throw new Error(`Navigation to /${bodyType} returned no response`);

    const ssrHtml = await navigation.text();
    await page.locator('#result').waitFor({state: 'visible', timeout: 15_000});

    const browserState = await page.evaluate(() => {
      const text = (selector) =>
        document.querySelector(selector)?.textContent?.trim() ?? null;
      return {
        status: text('#status'),
        bodyType: document.querySelector('main')?.getAttribute('data-body-type'),
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
      path: `${evidenceDir}/playwright-${bodyType}.png`,
      fullPage: true,
    });

    const originLog = await fetch(`${baseUrl}/api/__origin-log`).then((response) => {
      if (!response.ok) throw new Error(`Origin log failed: ${response.status}`);
      return response.json();
    });

    const expectsVulnerability = expectedMode === 'vulnerable';
    const expectedOriginIds = expectsVulnerability
      ? [100, 200, 200]
      : bodyType === 'blob'
        ? [100, 200, 200, 100, 200, 200]
        : [100, 200, 200, 200];
    const expectedWireBytes = expectedOriginIds.map((documentId) =>
      documentId === 100 ? '0864' : '08c801',
    );
    const expectedBrowserPosts =
      expectsVulnerability || bodyType === 'arraybuffer' ? 1 : 3;

    const assertions = {
      bodyTypeRendered: browserState.bodyType === bodyType,
      ssrResultMatchesMode:
        ssrHtml.includes(`data-vulnerable="${expectsVulnerability}"`),
      hydratedResultMatchesMode:
        browserState.status === (expectsVulnerability ? 'VULNERABLE' : 'CORRECT') &&
        browserState.vulnerable === String(expectsVulnerability),
      firstResponseCorrect: browserState.firstId === 'documentId=100',
      secondResponseMatchesMode:
        browserState.secondId ===
          (expectsVulnerability ? 'documentId=100' : 'documentId=200') &&
        (expectsVulnerability
          ? browserState.secondCapability === browserState.firstCapability
          : browserState.secondCapability !== browserState.firstCapability),
      bypassControlCorrect:
        browserState.bypassId === 'documentId=200' &&
        browserState.bypassCapability !== browserState.firstCapability,
      browserPostCountCorrect: browserPosts.length === expectedBrowserPosts,
      originCallsCorrect: sameValues(
        originLog.calls.map(({documentId}) => documentId),
        expectedOriginIds,
      ),
      originWireBytesCorrect: sameValues(
        originLog.calls.map(({bodyHex}) => bodyHex),
        expectedWireBytes,
      ),
      noPageErrors: pageErrors.length === 0,
    };

    return {
      path: `/${bodyType}`,
      browser: browserState,
      browserPosts,
      originLog: originLog.calls,
      pageErrors,
      assertions,
      passed: Object.values(assertions).every(Boolean),
    };
  } finally {
    await page.close();
  }
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });

  const blob = await runCase(browser, 'blob');
  const arraybuffer = await runCase(browser, 'arraybuffer');
  const result = {
    expectedMode,
    cases: {blob, arraybuffer},
    passed: blob.passed && arraybuffer.passed,
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
