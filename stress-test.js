import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '3s', target: 30 },
    { duration: '5s', target: 100 },
    { duration: '3s', target: 0 },
  ],
};

export default function () {
  const url = 'http://localhost:3000/dispatch';
  
  const payload = JSON.stringify({
    id: `task-${__ITER}`,
    lat: 10.9639,
    lon: -74.7964,
    packageID: `pkg-${Math.floor(Math.random() * 100000)}`,
    timestamp: Date.now()
  });

  const params = {
    headers: { 'Content-Type': 'application/json' },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'status is 202': (r) => r.status === 202,
    'handled rejection': (r) => r.status === 503 || r.status === 400
  });

  sleep(0.05);
}
