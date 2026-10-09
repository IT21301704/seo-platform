import "server-only";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

/** apps/wp-plugin, found by walking up from the working directory (no bundler asset import). */
function pluginDir(from: string = process.cwd()): string {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "apps", "wp-plugin");
    if (existsSync(join(candidate, "seo-platform.php"))) return candidate;
    if (dirname(dir) === dir) throw new Error("apps/wp-plugin not found");
  }
}

/** Files shipped to sites: no local test content, no tests. */
const EXCLUDED = /^(dev|tests)(\/|$)|(^|\/)\./;

function files(root: string, dir = root): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const full = join(dir, name);
      const rel = relative(root, full).replace(/\\/g, "/");
      if (EXCLUDED.test(rel)) return [];
      return statSync(full).isDirectory() ? files(root, full) : [rel];
    });
}

/**
 * Builds seo-platform.zip (folder "seo-platform/") for Plugins → Add New → Upload. Minimal ZIP
 * writer: deflate, CRC-32, fixed timestamps so the same plugin gives the same bytes.
 */
export function pluginZip(): Buffer {
  const root = pluginDir();
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  const DOS_TIME = 0;
  const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const rel of files(root)) {
    const data = readFileSync(join(root, rel));
    const packed = deflateRawSync(data);
    const name = Buffer.from(`seo-platform/${rel}`, "utf8");
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6); // UTF-8 names
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(packed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    local.push(header, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += header.length + name.length + packed.length;
  }
  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
