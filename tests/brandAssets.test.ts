// @vitest-environment node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function pngDimensions(path: string): Promise<{ width: number; height: number }> {
  const data = await readFile(resolve(path));
  expect(data.subarray(0, 8), `${path} is not a PNG`).toEqual(PNG_SIGNATURE);
  expect(data.subarray(12, 16).toString("ascii"), `${path} has no IHDR`).toBe("IHDR");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function icoSizes(data: Buffer): Array<{ width: number; height: number }> {
  expect(data.readUInt16LE(0), "ICO reserved field").toBe(0);
  expect(data.readUInt16LE(2), "ICO type field").toBe(1);
  const count = data.readUInt16LE(4);
  const entries: Array<{ width: number; height: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    entries.push({
      width: data[offset] === 0 ? 256 : data[offset]!,
      height: data[offset + 1] === 0 ? 256 : data[offset + 1]!,
    });
  }
  return entries;
}

describe("Drawic brand assets", () => {
  it("ships a 1024 px master and valid platform icon containers", async () => {
    expect(await pngDimensions("build/icon.png")).toEqual({ width: 1024, height: 1024 });

    const master = await readFile(resolve("build/icon.svg"), "utf8");
    expect(master).toContain('viewBox="0 0 1024 1024"');
    expect(master).not.toContain("<text");
    expect(master).toContain('aria-label="Drawic"');

    const ico = await readFile(resolve("build/icon.ico"));
    const sizes = icoSizes(ico).map((entry) => entry.width);
    for (const required of [16, 24, 32, 48, 64, 128, 256]) {
      expect(sizes, `ICO is missing ${required} px`).toContain(required);
    }

    const icns = await readFile(resolve("build/icon.icns"));
    expect(icns.subarray(0, 4).toString("ascii"), "ICNS magic").toBe("icns");
  });

  it("provides every Linux icon size and the runtime shell assets", async () => {
    const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
    for (const size of sizes) {
      expect(await pngDimensions(`build/icons/${size}x${size}.png`)).toEqual({
        width: size,
        height: size,
      });
    }

    expect(await pngDimensions("src/renderer/public/icon.png")).toEqual({
      width: 512,
      height: 512,
    });
    expect(await pngDimensions("src/renderer/public/favicon-16.png")).toEqual({
      width: 16,
      height: 16,
    });
    expect(await pngDimensions("src/renderer/public/favicon-32.png")).toEqual({
      width: 32,
      height: 32,
    });
  });

  it("wires the icon paths into packaging and the HTML shell", async () => {
    expect(packageJson.build.win.icon).toBe("build/icon.ico");
    expect(packageJson.build.mac.icon).toBe("build/icon.icns");
    expect(packageJson.build.linux.icon).toBe("build/icons");

    const html = await readFile(resolve("src/renderer/index.html"), "utf8");
    expect(html).toContain("<title>Drawic — Schematic Editor</title>");
    expect(html).toContain('rel="icon"');
    expect(html).toContain("./favicon-32.png");
    expect(html).toContain("./favicon-16.png");

    const main = await readFile(resolve("src/main/main.ts"), "utf8");
    expect(main).toContain("function brandIconPath()");
    expect(main).toContain("icon: brandIconPath()");
    expect(main).toContain('title: "Drawic — Schematic Editor"');
  });
});
