import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import {create, fromBinary, toBinary} from '@bufbuild/protobuf';
import express from 'express';
import {join} from 'node:path';

import {
  DocumentQuerySchema,
  DocumentResultSchema,
} from './app/proto/generated/document_pb';

const browserDistFolder = join(import.meta.dirname, '../browser');
const app = express();
const angularApp = new AngularNodeAppEngine();

interface OriginLogEntry {
  call: number;
  documentId: number;
  bodyHex: string;
  userAgent: string;
}

let originCall = 0;
const originLog: OriginLogEntry[] = [];

app.post(
  '/api/rpc/document-query',
  express.raw({type: 'application/x-protobuf', limit: '64kb'}),
  (req, res) => {
    const bytes = new Uint8Array(req.body as Buffer);
    const query = fromBinary(DocumentQuerySchema, bytes);
    originCall++;

    originLog.push({
      call: originCall,
      documentId: query.documentId,
      bodyHex: Buffer.from(bytes).toString('hex'),
      userAgent: req.get('user-agent') ?? '',
    });

    const result = create(
      DocumentResultSchema,
      query.documentId === 100
        ? {
            documentId: 100,
            title: 'Private payroll report',
            preview: 'Payroll preview selected by protobuf body id=100',
            capability: 'https://files.example.invalid/signed/payroll-100?sig=CAPABILITY_A',
            originCall,
          }
        : {
            documentId: query.documentId,
            title: 'Public onboarding document',
            preview: `Public preview selected by protobuf body id=${query.documentId}`,
            capability: `https://files.example.invalid/signed/public-${query.documentId}?sig=CAPABILITY_B`,
            originCall,
          },
    );

    console.log(
      `[origin] call=${originCall} documentId=${query.documentId} body=${Buffer.from(bytes).toString('hex')}`,
    );

    res
      .status(200)
      .type('application/x-protobuf')
      .send(Buffer.from(toBinary(DocumentResultSchema, result)));
  },
);

app.post('/api/__reset', (_req, res) => {
  originCall = 0;
  originLog.length = 0;
  res.json({ok: true});
});

app.get('/api/__origin-log', (_req, res) => {
  res.json({calls: originLog});
});

app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

app.use((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, (error) => {
    if (error) throw error;
    console.log(`Node Express server listening on http://127.0.0.1:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);
