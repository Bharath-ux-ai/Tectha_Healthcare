const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const pythonExe = path.join(rootDir, 'backend', '.venv', 'Scripts', 'python.exe');

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8000/api/health', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const isRunning = await checkHealth();
  if (isRunning) {
    console.log('[Tec Tha] Backend is already running on port 8000.');
    return;
  }

  if (!fs.existsSync(pythonExe)) {
    console.error('[Tec Tha] Python venv not found at ' + pythonExe);
    return;
  }

  console.log('[Tec Tha] Starting FastAPI backend on http://localhost:8000...');
  const child = spawn(pythonExe, ['-m', 'uvicorn', 'app.main:app', '--port', '8000'], {
    cwd: path.join(rootDir, 'backend'),
    detached: true,
    stdio: 'ignore'
  });
  child.unref();

  // Wait up to 10 seconds for backend to be ready
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    if (await checkHealth()) {
      console.log('[Tec Tha] Backend is ready!');
      return;
    }
  }
  console.warn('[Tec Tha] Backend started, waiting for connections...');
}

main().catch(console.error);

