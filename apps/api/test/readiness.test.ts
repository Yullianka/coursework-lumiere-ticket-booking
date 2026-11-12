import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

for (const [name, probe, database] of [
  ['missing configuration', undefined, 'not-configured'],
  ['failed connection', async () => { throw new Error('private connection details'); }, 'unavailable'],
] as const) {
  test(`Readiness: ${name} returns 503 without leaking connection details`, async () => {
    const server = createApp(probe).listen(0,'127.0.0.1');
    await new Promise<void>(resolve => server.once('listening',resolve));
    try {
      const address=server.address(); assert.ok(address && typeof address!=='string');
      const base=`http://127.0.0.1:${address.port}`;
      const response=await fetch(base+'/api/ready');
      assert.equal(response.status,503);
      assert.deepEqual(await response.json(),{status:'not-ready',database});
      assert.equal((await fetch(base+'/api/health')).status,200);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
  });
}
