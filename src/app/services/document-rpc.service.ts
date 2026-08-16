import {HttpClient, HttpHeaders} from '@angular/common/http';
import {create, fromBinary, toBinary} from '@bufbuild/protobuf';
import {inject, Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';

import {
  type DocumentResult,
  DocumentQuerySchema,
  DocumentResultSchema,
} from '../proto/generated/document_pb';

@Injectable({providedIn: 'root'})
export class DocumentRpcService {
  private readonly http = inject(HttpClient);
  private readonly headers = new HttpHeaders({
    'Content-Type': 'application/x-protobuf',
    Accept: 'application/x-protobuf',
  });

  query(
    documentId: number,
    useTransferCache = true,
  ): Observable<DocumentResult> {
    const request = create(DocumentQuerySchema, {documentId});
    const requestBytes = toBinary(DocumentQuerySchema, request);

    // Mirrors a real protobuf Angular client: protobuf bytes -> Blob -> HttpClient POST.
    const requestBuffer = new ArrayBuffer(requestBytes.byteLength);
    new Uint8Array(requestBuffer).set(requestBytes);
    const body = new Blob([requestBuffer], {type: 'application/x-protobuf'});

    return this.http
      .post('/api/rpc/document-query', body, {
        headers: this.headers,
        responseType: 'arraybuffer',
        // Leave enabled requests on the global includePostRequests policy.
        // Only the negative control needs a request-level override.
        transferCache: useTransferCache ? undefined : false,
      })
      .pipe(
        map((buffer) =>
          fromBinary(DocumentResultSchema, new Uint8Array(buffer)),
        ),
      );
  }
}
