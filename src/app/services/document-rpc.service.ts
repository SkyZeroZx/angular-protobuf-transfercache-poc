import {HttpClient, HttpHeaders} from '@angular/common/http';
import {create, fromBinary, toBinary} from '@bufbuild/protobuf';
import {inject, Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';

import {
  type DocumentResult,
  DocumentQuerySchema,
  DocumentResultSchema,
} from '../proto/generated/document_pb';

export type RequestBodyType = 'blob' | 'arraybuffer';

@Injectable({providedIn: 'root'})
export class DocumentRpcService {
  private readonly http = inject(HttpClient);
  private readonly headers = new HttpHeaders({
    'Content-Type': 'application/x-protobuf',
    Accept: 'application/x-protobuf',
  });

  query(
    documentId: number,
    bodyType: RequestBodyType,
    useTransferCache = true,
  ): Observable<DocumentResult> {
    const request = create(DocumentQuerySchema, {documentId});
    const requestBytes = toBinary(DocumentQuerySchema, request);

    const requestBuffer = new ArrayBuffer(requestBytes.byteLength);
    new Uint8Array(requestBuffer).set(requestBytes);
    const body =
      bodyType === 'blob'
        ? new Blob([requestBuffer], {type: 'application/x-protobuf'})
        : requestBuffer;

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
