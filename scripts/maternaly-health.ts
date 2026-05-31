import { getMaternalyHealth } from "../src/lib/maternaly/health";

async function main() {
  console.log(JSON.stringify(await getMaternalyHealth(), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
