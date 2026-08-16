# Angular `HttpTransferCache` binary POST collision

This project reproduces an Angular SSR `HttpTransferCache` bug involving binary POST bodies.

The app sends two different Protobuf requests to the same endpoint. Angular receives different `Blob` bodies, but treats them as the same cache entry. The second request gets the response from the first request and never reaches the origin.

Angular `22.1.2` builds part of the transfer-cache key like this:

```ts
let serializedBody = request.serializeBody();

if (serializedBody instanceof URLSearchParams) {
  serializedBody = sortAndConcatParams(serializedBody);
} else if (typeof serializedBody !== 'string') {
  serializedBody = '';
}
```

`serializeBody()` returns a `Blob` unchanged. Since a `Blob` is not a string, its contents are replaced with `''` before Angular hashes the key. This is not a hash collision: both requests are given the same input before hashing.

## What the reproduction does

The app makes three sequential, read-only RPC calls:

| Request        | TransferCache | Response       | Sent to origin |
| -------------- | ------------- | -------------- | -------------- |
| document `100` | enabled       | document `100` | yes            |
| document `200` | enabled       | document `100` | no             |
| document `200` | disabled      | document `200` | yes            |

The Protobuf request bodies are different:

```text
document 100: 08 64
document 200: 08 c8 01
```

The final request uses `transferCache:false` as a control. It returns document `200`, which confirms that the Protobuf codec, HTTP endpoint, and backend all distinguish the two bodies correctly.

## Run it

Requirements: Node.js 22+, npm, and Playwright Chromium.

```bash
npm ci
npx playwright install chromium
npm run build
npm run validate
```

`npm run build` generates TypeScript schemas from [`document.proto`](src/app/proto/document.proto) with Buf, then creates a production Angular SSR build.

`npm run validate` starts the compiled server, opens it in Chromium, checks the raw SSR response and hydrated DOM, records browser requests, and reads the origin log. A successful run ends with:

```json
{
  "passed": true
}
```

The important checks are:

```text
SSR HTML already contains the wrong second response     true
hydrated DOM contains the same result                   true
browser sends only the transferCache:false control     true
origin receives bytes 0864, 08c801, 08c801              true
page errors                                             0
```

The browser is not required to trigger the bug; the incorrect result is already present in the SSR HTML. Playwright is included to verify the full hydration path and confirm that no hidden browser request explains the result.

Evidence from the latest run is available in [`evidence/`](evidence/).

This demonstrates response confusion within one SSR/hydration TransferCache lifetime. It can be a cross-user leak or shared-CDN cache poisoning.

The current project passes its reproduction on Angular framework `22.1.2`, Angular SSR/build `22.1.4`, `@bufbuild/protobuf` `2.14.0`, Node.js `24.16.0`, and Playwright `1.62.1` with Chromium `151.0.7922.34`.
