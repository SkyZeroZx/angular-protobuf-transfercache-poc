# Real-world protobuf request-shape evidence

## PlikShare

Public repository:

`https://github.com/damian-krychowski/plikshare`

Relevant Angular service:

`Frontend/src/app/services/protobuf-http.service.ts`

The service uses `protobufjs`, encodes request objects to binary, wraps those bytes in an `application/x-protobuf` Blob, sends that Blob through Angular `HttpClient.post`, receives `arraybuffer`, and decodes the protobuf response.

That is the same Angular request-body type used by this PoC.

The application's file APIs also define protobuf request/response DTOs for selections of files/folders and response models containing pre-signed download URLs, providing a realistic example of why a body-dependent binary RPC response can carry materially different data/capabilities.

Relevant file:

`Frontend/src/app/services/folders-and-files.api.ts`

Boundary: I did not find Angular SSR/hydration configuration in this repository, so it is cited only as real-world evidence of the Protobuf-over-Angular-HttpClient architecture, not as a confirmed affected deployment.

## Secondary public example

`https://github.com/GinMitch/better-than-json/blob/main/frontend/src/app/services/protobuf-request.service.ts`

This Angular example performs a POST whose body comes from `serializeBinary()` and requests an `arraybuffer` protobuf response. It is useful supporting evidence that same-URL POST RPC + binary request/response is a normal Angular integration shape.
