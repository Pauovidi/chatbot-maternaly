import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  assertNoSecretLikeValues,
  buildConversationSeed,
  redactConversationText,
} from "@/lib/hotel/conversations/demo-seed";
import { resolveJsonStorePath } from "@/lib/hotel/persistence/runtime";

export {
  assertNoSecretLikeValues,
  buildConversationSeed,
  redactConversationText,
};

function getStoreDirectory(): string {
  if (process.env.HOTEL_CONVERSATIONS_STORE_DIR?.trim()) {
    return process.env.HOTEL_CONVERSATIONS_STORE_DIR.trim();
  }

  if (process.env.HOTEL_CONVERSATIONS_STORE_PATH?.trim()) {
    return path.dirname(process.env.HOTEL_CONVERSATIONS_STORE_PATH.trim());
  }

  if (process.env.NODE_ENV === "production") {
    return path.dirname(resolveJsonStorePath({ fileName: "hotel-conversations.json" }));
  }

  return os.tmpdir();
}

function getStoreFile(storeDir = getStoreDirectory()): string {
  return path.join(storeDir, "hotel-conversations.json");
}

export async function writeConversationSeed(
  target = getStoreFile(),
): Promise<string> {
  const seed = buildConversationSeed();
  const targetFile = target.endsWith(".json") ? target : getStoreFile(target);
  const tempFile = `${targetFile}.tmp`;

  await mkdir(path.dirname(targetFile), { recursive: true });
  await writeFile(tempFile, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
  await rm(targetFile, { force: true });
  await rename(tempFile, targetFile);

  return targetFile;
}

async function main(): Promise<void> {
  const targetFile = await writeConversationSeed();
  const seed = buildConversationSeed();

  console.log(
    `Seeded ${seed.conversations.length} demo conversations at ${targetFile}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
