// Deterministic, uncompressed ZIP. Only explicitly listed extension sources are packaged.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../', import.meta.url);
const files = ['manifest.json', 'background.js', 'core.js', 'content.js', 'README.md'];
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('extension/neis-helper/manifest.json', root), 'utf8'));
if (manifest.version !== packageJson.version) throw new Error('Extension and app versions must match.');
const table = Array.from({ length: 256 }, (_, number) => { let value = number; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; return value >>> 0; });
const crc32 = bytes => { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
const local = [], central = []; let offset = 0;
for (const name of files) {
  const bytes = await readFile(new URL(`extension/neis-helper/${name}`, root));
  const filename = Buffer.from(name); const crc = crc32(bytes);
  const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(33, 12); header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(bytes.length, 22); header.writeUInt16LE(filename.length, 26);
  const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(33, 14); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(bytes.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
  local.push(header, filename, bytes); central.push(directory, filename); offset += header.length + filename.length + bytes.length;
}
const centralBytes = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(centralBytes.length, 12); end.writeUInt32LE(offset, 16);
const destination = new URL('public/downloads/damim-neis-helper.zip', root);
await mkdir(new URL('public/downloads/', root), { recursive: true });
await writeFile(destination, Buffer.concat([...local, centralBytes, end]));
await mkdir(new URL('public/neis-helper/', root), { recursive: true });
for (const name of ['core.js', 'content.js']) {
  await writeFile(new URL(`public/neis-helper/${name}`, root), await readFile(new URL(`extension/neis-helper/${name}`, root)));
}
console.log(`Packaged ${files.length} extension files: ${fileURLToPath(destination)}`);
