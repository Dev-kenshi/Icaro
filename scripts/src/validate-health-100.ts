import { runHealth100 } from "./health-100";

const result = runHealth100();
console.log(
  `Validações: Ícaro ${result.icaroPassed}/50 · Git/sync ${result.syncPassed}/50 · total ${result.total}/100.`,
);

for (const failure of result.failures) {
  console.error(`✗ ${failure.id} [${failure.area}] ${failure.name}: ${failure.error}`);
}

if (result.total !== 100 || result.failures.length > 0) {
  process.exitCode = 1;
}
