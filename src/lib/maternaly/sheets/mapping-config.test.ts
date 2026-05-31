import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Maternaly Sheets functional mapping config", () => {
  it("keeps live writes disabled and defines one mapping per audited Sheet", () => {
    const config = JSON.parse(
      readFileSync(path.join(process.cwd(), "config/maternaly-sheets.mapping.json"), "utf8"),
    ) as {
      live_writes_enabled: boolean;
      sheets: Array<{ id: string; tabs: Array<{ write_strategy: string }> }>;
      safe_write_target: { tab: string; operation: string };
    };

    expect(config.live_writes_enabled).toBe(false);
    expect(config.sheets.map((sheet) => sheet.id)).toEqual([
      "163BD-mjKeYGx7bjjUzW_FUYhwMUniLfHlhPnByZWOfI",
      "1p74UI3SUFgtHCc5mSdW0RnmV2pnGECBTBudJz8YF5Do",
    ]);
    expect(config.sheets[0]?.tabs[0]?.write_strategy).toBe("blocked");
    expect(config.sheets[1]?.tabs[0]?.write_strategy).toContain("dry_run");
    expect(config.safe_write_target).toMatchObject({
      tab: "TEST_BOT_WRITES",
      operation: "append",
    });
  });
});
