import {
  RESET_CONVERSATIONS_CONFIRMATION,
  resetConversations,
} from "@/lib/hotel/conversations/service";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function getOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const confirm = getOption("--confirm");

  if (!dryRun && confirm !== RESET_CONVERSATIONS_CONFIRMATION) {
    console.error("Reset aborted: pass --confirm RESET_CONVERSATIONS.");
    process.exit(1);
  }

  const result = await resetConversations({ dryRun, confirm });
  console.table([
    {
      dryRun: result.dryRun,
      deleted: result.deleted,
      conversations: result.conversations,
      messages: result.messages,
      events: result.events,
      suppressDemoSeed: result.suppressDemoSeed,
    },
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Reset failed.");
  process.exit(1);
});
