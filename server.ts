import { createServer, IncomingMessage, ServerResponse } from 'http';
import { HydraulicTrafficShaper } from './HydraulicShaper';
import { ConnectionPoolManager } from './ConnectionPoolManager';

const shaper = new HydraulicTrafficShaper(1000, 5, 5000);
const pool = new ConnectionPoolManager(5, 3000);

// Background batch processor loop running every 100ms
setInterval(async () => {
  await shaper.processBatch(50);
}, 100);

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  // Telemetry metric endpoint for load monitoring tools
  if (req.url === '/metrics' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ shaper: shaper.getMetrics(), pool: pool.getPoolStats() }));
    return;
  }

  // Main high-concurrency ingestion pipeline
  if (req.url === '/dispatch' && req.method === 'POST') {
    let body = '';
    
    // Ingest raw data streams directly from the network socket
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        
        // Phase 1: Traffic shaping and quality gate check
        const shaperResult = shaper.ingest(payload);

        if (!shaperResult.success) {
          const errorCode = shaperResult.error === 'CIRCUIT_OPEN' ? 503 : 400;
          res.writeHead(errorCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'REJECTED', reason: shaperResult.error }));
          return;
        }

        // Phase 2: Asynchronous connection acquisition and allocation
        try {
          const connection = await pool.acquire();
          
          await connection.query(payload);
          
          // Instant direct bypass back to the awaiting queue (FIFO)
          pool.release(connection);

          res.writeHead(202, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'PROCESSED', message: shaperResult.data }));
        } catch (poolError: any) {
          res.writeHead(504, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'TIMEOUT', reason: poolError.message }));
        }
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
