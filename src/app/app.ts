import {Component, inject, signal} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {concatMap, map} from 'rxjs';

import type {DocumentResult} from './proto/generated/document_pb';
import {DocumentRpcService} from './services/document-rpc.service';

interface PocResult {
  cachedFirst: DocumentResult;
  cachedSecond: DocumentResult;
  bypassSecond: DocumentResult;
  vulnerable: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <main>
      <h1>Angular SSR Protobuf TransferCache collision</h1>
      <p>
        Three sequential read-only RPC calls use the same URL. The first two use TransferCache; the
        third disables it as a control.
      </p>

      @if (result(); as r) {
        <section id="result" [attr.data-vulnerable]="r.vulnerable">
          <h2 id="status">{{ r.vulnerable ? 'VULNERABLE' : 'NOT REPRODUCED' }}</h2>

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
            <h3>3. document 200 with transferCache:false (control)</h3>
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
  styleUrl: './app.css',
})
export class App {
  private readonly rpc = inject(DocumentRpcService);

  readonly result = signal<PocResult | null>(null);

  constructor() {
    this.rpc
      .query(100)
      .pipe(
        concatMap((cachedFirst) =>
          this.rpc.query(200).pipe(
            concatMap((cachedSecond) =>
              this.rpc.query(200, false).pipe(
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
