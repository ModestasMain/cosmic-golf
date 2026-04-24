import http from 'node:http';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(TOOL_DIR, 'image-upscaler.html');
const TMP_DIR = path.join(TOOL_DIR, '.tmp');
const VENDOR_DIR = path.join(TOOL_DIR, 'vendor');
const REALESRGAN_BIN = path.join(VENDOR_DIR, 'realesrgan-ncnn-vulkan');
const MODELS_DIR = path.join(VENDOR_DIR, 'models');
const HOST = '127.0.0.1';
const START_PORT = Number(process.env.UPSCALER_PORT || 3320);

const TARGETS = {
  skybox4k: { kind: 'image', label: '4096 x 2048', width: 4096, height: 2048 },
  skybox8k: { kind: 'image', label: '8192 x 4096', width: 8192, height: 4096 },
  long4k: { kind: 'image', label: 'long edge 4096', longEdge: 4096 },
  long8k: { kind: 'image', label: 'long edge 8192', longEdge: 8192 },
  cubemap4k: {
    kind: 'cubemap',
    label: 'Cubemap 1024 faces',
    width: 4096,
    height: 2048,
    faceSize: 1024,
  },
  cubemap8k: {
    kind: 'cubemap',
    label: 'Cubemap 2048 faces',
    width: 8192,
    height: 4096,
    faceSize: 2048,
  },
};

const CUBEMAP_FACES = [
  { key: 'px', file: 'px.png', index: 0 },
  { key: 'nx', file: 'nx.png', index: 1 },
  { key: 'py', file: 'py.png', index: 2 },
  { key: 'ny', file: 'ny.png', index: 3 },
  { key: 'pz', file: 'pz.png', index: 4 },
  { key: 'nz', file: 'nz.png', index: 5 },
];

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function sanitizeName(name) {
  return String(name || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'image';
}

function extensionFor(file) {
  const ext = path.extname(file.name || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return ext;
  if (file.type === 'image/jpeg') return '.jpg';
  if (file.type === 'image/webp') return '.webp';
  return '.png';
}

function run(command, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...opts, windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${path.basename(command)} exited ${code}\n${stderr || stdout}`));
    });
  });
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function probeDimensions(filePath) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'json',
    filePath,
  ]);
  const data = JSON.parse(stdout);
  const stream = data.streams?.[0];
  return {
    width: Number(stream?.width || 0),
    height: Number(stream?.height || 0),
  };
}

function chooseAiScale(source, target) {
  const targetLong = target.longEdge || Math.max(target.width, target.height);
  const sourceLong = Math.max(source.width, source.height) || targetLong;
  const ratio = targetLong / sourceLong;
  return ratio <= 2.05 ? 2 : 4;
}

function finalScaleFilter(target) {
  const sharpen = 'unsharp=3:3:0.28:3:3:0.0';
  if (target.width && target.height) {
    return `scale=${target.width}:${target.height}:flags=lanczos,${sharpen}`;
  }
  const edge = target.longEdge;
  return `scale='if(gte(iw,ih),${edge},-2)':'if(gte(iw,ih),-2,${edge})':flags=lanczos,${sharpen}`;
}

async function zipFiles(zipPath, files, cwd) {
  await run('zip', ['-q', '-j', zipPath, ...files], { cwd });
}

async function convertToCubemapFaces(inputPath, outputDir, faceSize) {
  const stripPath = path.join(outputDir, 'cubemap-strip.png');
  const stripWidth = faceSize * 6;
  await run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', inputPath,
    '-vf', `v360=input=equirect:output=c6x1:interp=lanczos:w=${stripWidth}:h=${faceSize}:out_forder=rludfb`,
    stripPath,
  ]);

  const faceFiles = [];
  for (const face of CUBEMAP_FACES) {
    const facePath = path.join(outputDir, face.file);
    await run('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', stripPath,
      '-vf', `crop=${faceSize}:${faceSize}:${face.index * faceSize}:0`,
      facePath,
    ]);
    faceFiles.push(facePath);
  }

  const manifestPath = path.join(outputDir, 'cubemap.json');
  await fs.writeFile(manifestPath, JSON.stringify({
    type: 'cubemap',
    faceSize,
    faces: Object.fromEntries(CUBEMAP_FACES.map((face) => [face.key, face.file])),
  }, null, 2));

  return {
    manifestPath,
    faceFiles,
    stripPath,
  };
}

async function readMultipart(req) {
  const request = new Request(`http://${HOST}/api/upscale`, {
    method: 'POST',
    headers: req.headers,
    body: req,
    duplex: 'half',
  });
  return request.formData();
}

async function handleUpscale(req, res) {
  const hasBinary = await pathExists(REALESRGAN_BIN);
  const hasModels = await pathExists(MODELS_DIR);
  if (!hasBinary || !hasModels) {
    sendJson(res, 500, {
      error: 'Real-ESRGAN is not installed in tools/vendor.',
    });
    return;
  }

  const form = await readMultipart(req);
  const file = form.get('image');
  const targetKey = String(form.get('target') || 'skybox4k');
  const target = TARGETS[targetKey] || TARGETS.skybox4k;

  if (!file || typeof file.arrayBuffer !== 'function') {
    sendJson(res, 400, { error: 'Upload an image first.' });
    return;
  }
  if (!String(file.type || '').startsWith('image/')) {
    sendJson(res, 400, { error: 'Only image files are supported.' });
    return;
  }

  await fs.mkdir(TMP_DIR, { recursive: true });

  const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const base = sanitizeName(file.name);
  const inputPath = path.join(TMP_DIR, `${jobId}-input${extensionFor(file)}`);
  const aiPath = path.join(TMP_DIR, `${jobId}-ai.png`);
  const outputPath = path.join(TMP_DIR, `${jobId}-output.png`);
  const cubemapDir = path.join(TMP_DIR, `${jobId}-cubemap`);
  const zipPath = path.join(TMP_DIR, `${jobId}-cubemap.zip`);

  try {
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    const source = await probeDimensions(inputPath);
    const aiScale = chooseAiScale(source, target);

    await run(REALESRGAN_BIN, [
      '-i', inputPath,
      '-o', aiPath,
      '-s', String(aiScale),
      '-n', 'realesrgan-x4plus',
      '-m', MODELS_DIR,
      '-t', '256',
      '-f', 'png',
    ], { cwd: VENDOR_DIR });

    await run('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel', 'error',
      '-i', aiPath,
      '-vf', finalScaleFilter(target),
      outputPath,
    ]);

    if (target.kind === 'cubemap') {
      await fs.mkdir(cubemapDir, { recursive: true });
      const { manifestPath, faceFiles, stripPath } = await convertToCubemapFaces(outputPath, cubemapDir, target.faceSize);
      await zipFiles(zipPath, [manifestPath, ...faceFiles], cubemapDir);
      const output = await fs.readFile(zipPath);
      const filename = `${base}-cubemap-${target.faceSize}.zip`;

      res.writeHead(200, {
        'content-type': 'application/zip',
        'content-length': output.length,
        'cache-control': 'no-store',
        'x-output-kind': 'cubemap',
        'x-output-filename': encodeURIComponent(filename),
        'x-face-size': String(target.faceSize),
        'x-ai-scale': String(aiScale),
      });
      res.end(output);

      await Promise.allSettled([manifestPath, stripPath, ...faceFiles].map((filePath) => fs.rm(filePath, { force: true })));
      return;
    }

    const output = await fs.readFile(outputPath);
    const dims = await probeDimensions(outputPath);
    const filename = `${base}-${dims.width}x${dims.height}-ai.png`;

    res.writeHead(200, {
      'content-type': 'image/png',
      'content-length': output.length,
      'cache-control': 'no-store',
      'x-output-kind': 'image',
      'x-output-filename': encodeURIComponent(filename),
      'x-output-width': String(dims.width),
      'x-output-height': String(dims.height),
      'x-ai-scale': String(aiScale),
    });
    res.end(output);
  } finally {
    await Promise.allSettled([
      inputPath,
      aiPath,
      outputPath,
      zipPath,
    ].map((filePath) => fs.rm(filePath, { force: true })));
    await fs.rm(cubemapDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${HOST}`);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/image-upscaler.html')) {
      const stat = await fs.stat(HTML_PATH);
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': stat.size,
        'cache-control': 'no-store',
      });
      createReadStream(HTML_PATH).pipe(res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      sendJson(res, 200, {
        ai: await pathExists(REALESRGAN_BIN),
        models: await pathExists(MODELS_DIR),
        engine: 'Real-ESRGAN NCNN Vulkan',
        targets: TARGETS,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/upscale') {
      await handleUpscale(req, res);
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      sendJson(res, 500, { error: err.message || 'Upscale failed.' });
    } else {
      res.end();
    }
  }
}

function listen(port) {
  const server = http.createServer(handleRequest);
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < START_PORT + 20) {
      listen(port + 1);
      return;
    }
    throw err;
  });
  server.listen(port, HOST, () => {
    console.log(`AI upscaler running at http://${HOST}:${port}/`);
  });
}

listen(START_PORT);
