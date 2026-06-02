import { seedMaternalyDemoConversations } from "@/lib/hotel/conversations/maternaly-demo-seed";

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const seedBatchId = readArg("seedBatchId");
  const force = process.argv.includes("--force");
  const result = await seedMaternalyDemoConversations({ seedBatchId, force });

  console.log(
    JSON.stringify(
      {
        ok: true,
        seedBatchId: result.seedBatchId,
        force: result.force,
        created: result.created,
        skipped: result.skipped,
        replaced: result.replaced,
        totalSeedConversations: result.totalSeedConversations,
        existingConversationCountBefore: result.existingConversationCountBefore,
        existingConversationCountAfter: result.existingConversationCountAfter,
        conversationIds: result.conversationIds,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Seed failed.");
  process.exitCode = 1;
});
