'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repository = path.join(__dirname, '..', '..', '..');
const shell = fs.readFileSync(path.join(repository, 'port', 'web', 'shell.html'), 'utf8');
const buildRules = fs.readFileSync(path.join(repository, 'tools', 'web_build.py'), 'utf8');
const stage = fs.readFileSync(path.join(repository, 'tools', 'web_stage_cloudflare.py'), 'utf8');
const worker = fs.readFileSync(path.join(repository, 'services', 'web', 'src', 'index.js'), 'utf8');
const wrangler = fs.readFileSync(path.join(repository, 'services', 'web', 'pages', 'wrangler.jsonc'), 'utf8');

assert.match(shell, /id="xiso-dialog"[\s\S]*comply with copyright law[\s\S]*does not provide Halo game data[\s\S]*discord\.gg\/DQRgPUq6B8/,
  'the first-run gate must explain the lawful local-disc requirement');
assert.match(shell, /Independent website[\s\S]*not part of, operated by, or supported by[\s\S]*halocombatevolved\.com/,
  'the XISO gate must clearly distinguish this website from OpenCE');
assert.doesNotMatch(shell, /Your game · your device|The XISO never leaves this device/,
  'the first-run gate must stay compact');
assert.doesNotMatch(shell, /i am mitch|activateLegacyBrowserFlow|halo-legacy-map-url/,
  'the public XISO gate must not contain a hidden legacy-flow bypass');
assert.match(buildRules, /--pre-js \{WEB_DIR\}\/xiso\.js/,
  'the XISO reader must run in the window and FetchFS workers');
assert.doesNotMatch(stage, /checked_copy\(maps|MULTIPLAYER_MAPS/,
  'the deployable browser tree must not copy Halo maps');
assert.doesNotMatch(worker, /serveCampaignMap|CAMPAIGN_MAP_NAMES/,
  'the hosting Worker must not serve Halo maps');
assert.doesNotMatch(wrangler, /CAMPAIGN_MAPS|halo-web-campaign-maps/,
  'the hosting Worker must not bind the old game-data bucket');

class MemoryFileHandle {
  constructor() { this.value = new Blob([]); }
  async getFile() { return this.value; }
  async createWritable() {
    const chunks = [];
    return {
      write: async value => { chunks.push(value); },
      close: async () => { this.value = new Blob(chunks); },
      abort: async () => { chunks.length = 0; },
    };
  }
}

class MemoryDirectoryHandle {
  constructor() {
    this.directories = new Map();
    this.files = new Map();
  }
  async getDirectoryHandle(name, options = {}) {
    if (!this.directories.has(name)) {
      if (!options.create) throw new Error('NotFoundError');
      this.directories.set(name, new MemoryDirectoryHandle());
    }
    return this.directories.get(name);
  }
  async getFileHandle(name, options = {}) {
    if (!this.files.has(name)) {
      if (!options.create) throw new Error('NotFoundError');
      this.files.set(name, new MemoryFileHandle());
    }
    return this.files.get(name);
  }
  async removeEntry(name) {
    if (!this.directories.delete(name) && !this.files.delete(name)) {
      throw new Error('NotFoundError');
    }
  }
}

const storageRoot = new MemoryDirectoryHandle();
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    storage: {
      async estimate() { return { quota: 2 ** 40, usage: 0 }; },
      async getDirectory() { return storageRoot; },
      async persist() { return true; },
    },
  },
});

const HaloXiso = require('../xiso.js');

function align4(value) { return (value + 3) & ~3; }

function directoryTable(entries) {
  const offsets = [];
  let size = 0;
  for (const entry of entries) {
    offsets.push(size);
    size = align4(size + 14 + Buffer.byteLength(entry.name, 'ascii'));
  }
  const table = Buffer.alloc(size);
  entries.forEach((entry, index) => {
    const offset = offsets[index];
    table.writeUInt16LE(0, offset);
    table.writeUInt16LE(index + 1 < entries.length ? offsets[index + 1] / 4 : 0, offset + 2);
    table.writeUInt32LE(entry.sector, offset + 4);
    table.writeUInt32LE(entry.size, offset + 8);
    table[offset + 12] = entry.directory ? 0x10 : 0;
    table[offset + 13] = Buffer.byteLength(entry.name, 'ascii');
    table.write(entry.name, offset + 14, 'ascii');
  });
  return table;
}

function haloXiso() {
  const descriptorSector = 32;
  const rootSector = 40;
  const mapsSector = 41;
  const dataSector = 48;
  const maps = directoryTable(HaloXiso.REQUIRED_MAPS.map(name => ({
    name,
    sector: dataSector,
    size: 1,
    directory: false,
  })));
  const root = directoryTable([{
    name: 'maps',
    sector: mapsSector,
    size: maps.length,
    directory: true,
  }]);
  const image = Buffer.alloc((dataSector + 1) * 2048);
  const magic = Buffer.from('MICROSOFT*XBOX*MEDIA', 'ascii');
  const descriptorOffset = descriptorSector * 2048;
  magic.copy(image, descriptorOffset);
  magic.copy(image, descriptorOffset + 0x7ec);
  image.writeUInt32LE(rootSector, descriptorOffset + 20);
  image.writeUInt32LE(root.length, descriptorOffset + 24);
  root.copy(image, rootSector * 2048);
  maps.copy(image, mapsSector * 2048);
  image[dataSector * 2048] = 0x7b;
  return new Blob([image]);
}

async function main() {
  const image = haloXiso();
  const catalog = await HaloXiso.readCatalog(image);
  assert.equal(catalog.partition, 0);
  assert.equal(catalog.byName.size, HaloXiso.REQUIRED_MAPS.length);
  assert.equal(catalog.byName.get('ui.map').size, 1);

  const progress = [];
  const result = await HaloXiso.install(image, event => progress.push(event));
  assert.equal(result.mapCount, HaloXiso.REQUIRED_MAPS.length);
  assert.equal(await HaloXiso.isInstalled(), true);
  assert(progress.some(event => event.phase === 'copy'));

  const response = await HaloXiso.responseForMapRequest(
    new Request('https://halo.example/assets/maps//ui.map', {
      headers: { Range: 'bytes=0-0' },
    }),
  );
  assert(response);
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(response.headers.get('Content-Range'), 'bytes 0-0/1');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0x7b]));

  assert.deepEqual(HaloXiso.parseRange('bytes=3-6', 10), { offset: 3, length: 4 });
  assert.deepEqual(HaloXiso.parseRange('bytes=-3', 10), { offset: 7, length: 3 });
  assert.equal(HaloXiso.parseRange('bytes=20-', 10), false);

  const invalid = new Blob([new Uint8Array(0x12000)]);
  await assert.rejects(HaloXiso.readCatalog(invalid), /not an Xbox XDVDFS disc image/i);

  // A private https:// link is read with range requests only.
  const remoteBytes = new Uint8Array(await haloXiso().arrayBuffer());
  const requests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const range = options.headers.Range;
    requests.push({ url, range, credentials: options.credentials });
    const [start, end] = range.replace('bytes=', '').split('-').map(Number);
    return new Response(remoteBytes.slice(start, end + 1), {
      status: 206,
      headers: { 'Content-Range': `bytes ${start}-${end}/${remoteBytes.length}` },
    });
  };
  try {
    const remote = await HaloXiso.openRemoteImage('https://files.example/private/halo.iso?token=x');
    assert.equal(remote.size, remoteBytes.length);
    assert.equal(remote.name, 'halo.iso');
    const remoteResult = await HaloXiso.install(remote, () => {});
    assert.equal(remoteResult.mapCount, HaloXiso.REQUIRED_MAPS.length);
    assert(requests.every(request => /^bytes=\d+-\d+$/.test(request.range)),
      'every remote read must be a bounded range request');
    assert(requests.every(request => request.credentials === 'omit'));
    assert(requests.every(request => request.url === 'https://files.example/private/halo.iso?token=x'));

    await assert.rejects(HaloXiso.openRemoteImage('http://files.example/halo.iso'), /https:\/\//);
    await assert.rejects(HaloXiso.openRemoteImage('not a link'), /not a valid link/);
    globalThis.fetch = async () => new Response('whole file', { status: 200 });
    await assert.rejects(HaloXiso.openRemoteImage('https://files.example/halo.iso'),
      /answered 200[\s\S]*range requests/);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().then(() => console.log('browser XISO tests passed'));
