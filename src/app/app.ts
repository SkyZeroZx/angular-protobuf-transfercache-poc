import {Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <header>
      <strong>HttpTransferCache binary POST PoC</strong>
      <nav aria-label="Request body examples">
        <a href="/blob">Blob body</a>
        <a href="/arraybuffer">ArrayBuffer body</a>
      </nav>
    </header>

    <router-outlet />
  `,
  styleUrl: './app.css',
})
export class App {}
