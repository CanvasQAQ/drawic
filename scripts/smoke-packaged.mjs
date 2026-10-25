import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const platform = process.platform;
const macCandidates =
  process.arch === "arm64"
    ? [
        resolve("release/mac-arm64/Drawic.app/Contents/MacOS/Drawic"),
        resolve("release/mac/Drawic.app/Contents/MacOS/Drawic"),
      ]
    : [
        resolve("release/mac/Drawic.app/Contents/MacOS/Drawic"),
        resolve("release/mac-arm64/Drawic.app/Contents/MacOS/Drawic"),
      ];
const macExecutable = macCandidates.find((candidate) => existsSync(candidate));
const executable =
  platform === "win32"
    ? resolve("release/win-unpacked/Drawic.exe")
    : platform === "darwin"
      ? macExecutable
      : resolve("release/linux-unpacked/drawic");
if (!executable) {
  throw new Error(`No packaged executable was found for ${platform}.`);
}
const temporary = await mkdtemp(join(tmpdir(), "drawic-smoke-"));
const reportPath = join(temporary, "report.json");
const userData = join(temporary, "user-data");
const screenshot = join(temporary, "screenshot.png");
const args = [
  "--smoke-test",
  `--smoke-output=${reportPath}`,
  `--smoke-screenshot=${screenshot}`,
  `--smoke-user-data=${userData}`,
];
if (platform === "linux") {
  args.unshift("--no-sandbox");
}
const command = platform === "linux" ? "xvfb-run" : executable;
const commandArgs = platform === "linux" ? ["-a", executable, ...args] : args;

const child = spawn(command, commandArgs, {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
});
let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});
const exitCode = await new Promise((resolvePromise) => {
  const timer = setTimeout(() => {
    child.kill("SIGKILL");
    resolvePromise(124);
  }, 45_000);
  child.on("exit", (code) => {
    clearTimeout(timer);
    resolvePromise(code ?? 1);
  });
});

let report;
try {
  report = JSON.parse(await readFile(reportPath, "utf8"));
} catch {
  console.error(output);
  await rm(temporary, { recursive: true, force: true });
  throw new Error("Packaged app did not produce a smoke-test report.");
}
await rm(temporary, { recursive: true, force: true });

if (
  exitCode !== 0 ||
  report.passed !== true ||
  report.blockedNetworkRequests !== 0 ||
  report.rasterExportBytes < 100
) {
  console.error(output);
  console.error(report);
  process.exit(1);
}
console.log(`Packaged smoke test passed on ${report.platform}/${report.arch}.`);
console.log(report.details);
