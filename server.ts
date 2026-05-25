import { createServer, IncomingMessage, ServerResponse } from 'http';
import { HydraulicTrafficShaper } from './HydraulicShaper';
import { ConnectionPoolManager } from './ConnectionPoolManager';

const shaper = new HydraulicTrafficShaper(1000, 5, 5000);
const pool = new ConnectionPoolManager(5, 3000);

setInterval(async () => {
  if (shaper.getMetrics().currentQueueSize > 0) {
    try {
      const connection = await pool.acquire();
      await shaper.processBatch(50);
      pool.release(connection);
    } catch (poolError) {
      // Background context timeout catch
    }
  }
}, 100);

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.url === '/metrics' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ shaper: shaper.getMetrics(), pool: pool.getPoolStats() }));
    return;
  }

  if (req.url === '/dispatch' && req.method === 'POST') {
    let body = '';
    
    req.on('data', (chunk: Buffer) => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const shaperResult = shaper.ingest(payload);

        if (!shaperResult.success) {
          const errorCode = shaperResult.error === 'CIRCUIT_OPEN' ? 503 : 400;
          res.writeHead(errorCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'REJECTED', reason: shaperResult.error }));
          return;
        }

        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ACCEPTED', message: shaperResult.data }));

      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ERROR', reason: 'INVALID_JSON_BODY' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(3000, () => {
  console.log('AR-TS Engine active on core port 3000');
});
