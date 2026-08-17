import {Routes} from '@angular/router';

import {TransferCacheDemo} from './transfer-cache-demo';

export const routes: Routes = [
  {
    path: 'blob',
    component: TransferCacheDemo,
    data: {bodyType: 'blob'},
  },
  {
    path: 'arraybuffer',
    component: TransferCacheDemo,
    data: {bodyType: 'arraybuffer'},
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'blob',
  },
  {
    path: '**',
    redirectTo: 'blob',
  },
];
