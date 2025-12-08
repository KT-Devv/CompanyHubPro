#!/usr/bin/env node
import http from 'http';
import https from 'https';

// Parse command line arguments for Windows compatibility
const args = process.argv.slice(2);
const env = {
  BASE_URL: process.env.BASE_URL || 'http://localhost:5174',
  DURATION: process.env.DURATION || '30',
  CONCURRENCY: process.env.CONCURRENCY || '10',
  RPS: process.env.RPS || '100',
};

// Parse CLI arguments like --duration=30
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.slice(2).split('=');
    const envKey = key.toUpperCase();
    if (value) env[envKey] = value;
  }
});

const baseUrl = env.BASE_URL;
const duration = parseInt(env.DURATION, 10);
const concurrency = parseInt(env.CONCURRENCY, 10);
const requestsPerSecond = parseInt(env.RPS, 10);

let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;
let totalBytes = 0;
const responseTimes = [];
const startTime = Date.now();

const endpoints = [
  { path: '/', method: 'GET', weight: 1 },
  { path: '/api/workers', method: 'GET', weight: 1 },
  { path: '/api/attendance', method: 'GET', weight: 1 },
  { path: '/api/sites', method: 'GET', weight: 1 },
];

function pickEndpoint() {
  const rand = Math.random();
  let cumWeight = 0;
  for (const endpoint of endpoints) {
    cumWeight += endpoint.weight;
    if (rand <= cumWeight / endpoints.reduce((sum, e) => sum + e.weight, 0)) {
      return endpoint;
    }
  }
  return endpoints[0];
}

function makeRequest() {
  const endpoint = pickEndpoint();
  const url = new URL(baseUrl);
  const protocol = url.protocol === 'https:' ? https : http;
  
  return new Promise((resolve) => {
    const requestStart = Date.now();
    const req = protocol.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: endpoint.path,
        method: endpoint.method,
        headers: {
          'User-Agent': 'CompanyHubPro-StressTest/1.0',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
          totalBytes += chunk.length;
        });
        res.on('end', () => {
          const responseTime = Date.now() - requestStart;
          responseTimes.push(responseTime);
          totalRequests++;
          
          if (res.statusCode >= 200 && res.statusCode < 300) {
            successfulRequests++;
          } else {
            failedRequests++;
          }
          
          resolve();
        });
      }
    );

    req.on('error', () => {
      totalRequests++;
      failedRequests++;
      resolve();
    });

    req.setTimeout(5000);
    req.end();
  });
}

async function runStressTest() {
  console.log(`\n🔥 CompanyHubPro Stress Test`);
  console.log(`📍 Target: ${baseUrl}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log(`👥 Concurrency: ${concurrency}`);
  console.log(`📊 Target RPS: ${requestsPerSecond}`);
  console.log(`\n🚀 Starting stress test...\n`);

  const endTime = startTime + duration * 1000;
  const requestInterval = 1000 / requestsPerSecond;
  let lastRequestTime = startTime;
  let lastProgressTime = startTime;

  while (Date.now() < endTime) {
    const activeRequests = [];
    
    for (let i = 0; i < concurrency; i++) {
      const now = Date.now();
      if (now - lastRequestTime >= requestInterval) {
        activeRequests.push(makeRequest());
        lastRequestTime = now;
      }
    }

    if (activeRequests.length > 0) {
      await Promise.all(activeRequests);
    } else {
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Print progress every 5 seconds
    const now = Date.now();
    if (now - lastProgressTime >= 5000) {
      const elapsed = Math.floor((now - startTime) / 1000);
      const rps = totalRequests > 0 ? Math.floor(totalRequests / elapsed) : 0;
      console.log(`⏳ ${elapsed}s | Requests: ${totalRequests} | RPS: ${rps} | Success: ${successfulRequests} | Failed: ${failedRequests}`);
      lastProgressTime = now;
    }
  }

  // Final results
  const totalDuration = (Date.now() - startTime) / 1000;
  const avgResponseTime = responseTimes.length > 0 
    ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
    : 0;
  const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
  const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
  
  // Calculate percentiles
  const sorted = [...responseTimes].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;

  console.log(`\n\n📊 === STRESS TEST RESULTS ===\n`);
  console.log(`⏱️  Test Duration: ${totalDuration.toFixed(2)}s`);
  console.log(`📈 Total Requests: ${totalRequests}`);
  console.log(`✅ Successful: ${successfulRequests} (${((successfulRequests / totalRequests) * 100).toFixed(2)}%)`);
  console.log(`❌ Failed: ${failedRequests} (${((failedRequests / totalRequests) * 100).toFixed(2)}%)`);
  console.log(`\n📊 Request Rate:`);
  console.log(`   Average RPS: ${(totalRequests / totalDuration).toFixed(2)}`);
  console.log(`\n⏳ Response Times:`);
  console.log(`   Min: ${minResponseTime}ms`);
  console.log(`   Avg: ${avgResponseTime.toFixed(2)}ms`);
  console.log(`   Max: ${maxResponseTime}ms`);
  console.log(`   P50: ${p50}ms`);
  console.log(`   P95: ${p95}ms`);
  console.log(`   P99: ${p99}ms`);
  console.log(`\n📦 Data:`);
  console.log(`   Total Bytes: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`   Avg Bytes/Request: ${(totalBytes / totalRequests).toFixed(0)} bytes`);
  console.log(`   Throughput: ${((totalBytes / 1024 / 1024) / totalDuration).toFixed(2)} MB/s`);
  console.log(`\n${'='.repeat(40)}\n`);

  process.exit(failedRequests > 0 ? 1 : 0);
}

runStressTest().catch(err => {
  console.error('Error running stress test:', err);
  process.exit(1);
});
