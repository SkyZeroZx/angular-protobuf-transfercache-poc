import {Component, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute} from '@angular/router';
import {concatMap, map} from 'rxjs';

import type {DocumentResult} from './proto/generated/document_pb';
import {
  DocumentRpcService,
  type RequestBodyType,
} from './services/document-rpc.service';

interface PocResult {
  cachedFirst: DocumentResult;
  cachedSecond: DocumentResult;
  bypassSecond: DocumentResult;
  vulnerable: boolean;
}

@Component({
  selector: 'app-transfer-cache-demo',
  styleUrl: './transfer-cache-demo.css',
  template: `
    <main [attr.data-body-type]="bodyType">
      <h1>{{ bodyLabel }} request body</h1>
      <p>
        Three sequential Protobuf RPC calls use the same URL. The first two use TransferCache; the
        third disables it as a control.
      </p>

      @if (result(); as r) {
        <section id="result" [attr.data-vulnerable]="r.vulnerable">
          <h2 id="status">{{ r.vulnerable ? 'VULNERABLE' : 'CORRECT' }}</h2>

          <article id="cached-first">
            <h3>1. cached document 100</h3>
            <p class="id">documentId={{ r.cachedFirst.documentId }}</p>
            <p class="title">{{ r.cachedFirst.title }}</p>
            <code class="capability">{{ r.cachedFirst.capability }}</code>
            <p class="origin-call">originCall={{ r.cachedFirst.originCall }}</p>
          </article>

          <article id="cached-second">
            <h3>2. cached document 200</h3>
            <p class="id">documentId={{ r.cachedSecond.documentId }}</p>
            <p class="title">{{ r.cachedSecond.title }}</p>
            <code class="capability">{{ r.cachedSecond.capability }}</code>
            <p class="origin-call">originCall={{ r.cachedSecond.originCall }}</p>
          </article>

          <article id="bypass-second">
            <h3>3. document 200 with transferCache:false</h3>
            <p class="id">documentId={{ r.bypassSecond.documentId }}</p>
            <p class="title">{{ r.bypassSecond.title }}</p>
            <code class="capability">{{ r.bypassSecond.capability }}</code>
            <p class="origin-call">originCall={{ r.bypassSecond.originCall }}</p>
          </article>
        </section>
      } @else {
        <p id="status">loading</p>
      }
    </main>
  `,
})
export class TransferCacheDemo {
  private readonly rpc = inject(DocumentRpcService);
  private readonly route = inject(ActivatedRoute);

  readonly bodyType = this.route.snapshot.data['bodyType'] as RequestBodyType;
  readonly bodyLabel = this.bodyType === 'blob' ? 'Blob' : 'ArrayBuffer';
  readonly result = signal<PocResult | null>(null);

  constructor() {
    this.rpc
      .query(100, this.bodyType)
      .pipe(
        concatMap((cachedFirst) =>
          this.rpc.query(200, this.bodyType).pipe(
            concatMap((cachedSecond) =>
              this.rpc.query(200, this.bodyType, false).pipe(
                map((bypassSecond) => ({
                  cachedFirst,
                  cachedSecond,
                  bypassSecond,
                  vulnerable:
                    cachedFirst.documentId === 100 &&
                    cachedSecond.documentId === 100 &&
                    bypassSecond.documentId === 200 &&
                    cachedSecond.capability === cachedFirst.capability &&
                    bypassSecond.capability !== cachedFirst.capability,
                })),
              ),
            ),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((value) => this.result.set(value));
  }
}
