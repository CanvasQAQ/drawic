import { rm } from "node:fs/promises";
import { resolve } from "node:path";

for (const directory of ["dist", "coverage"]) {
  await rm(resolve(directory), { recursive: true, force: true });
}
