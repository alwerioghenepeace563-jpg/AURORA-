const assert = require("node:assert/strict");
const { parseArithmetic, executeTool } = require("../lib/aurora-tools.cjs");

assert.equal(parseArithmetic("2 + 3 * 4"), 14);
assert.equal(parseArithmetic("(2 + 3) * 4"), 20);
assert.equal(parseArithmetic("-3 + 8 / 2"), 1);
assert.equal(parseArithmetic("2^3"), 8);
assert.throws(() => parseArithmetic("1/0"), /divide by zero/i);
assert.throws(() => parseArithmetic("process.exit()"), /basic arithmetic/i);
assert.throws(() => parseArithmetic("2 +"), /end with an operator/i);

(async () => {
  const answer = await executeTool({ name: "calculator", arguments: { expression: "12 * (4 + 1)" } });
  assert.equal(answer.result, 60);
  await assert.rejects(
    () => executeTool({ name: "web_search", arguments: { query: "test" } }),
    (error) => error.code === "TOOL_UNAVAILABLE"
  );
  await assert.rejects(
    () => executeTool({ name: "device_action", arguments: { action: "open_app" }, options: {} }),
    (error) => error.code === "CONFIRMATION_REQUIRED"
  );
  const searched = await executeTool(
    { name: "web_search", arguments: { query: "AURORA Core" } },
    { adapters: { web_search: async ({ query }) => ({ query, results: [{ title: "Example" }] }) } }
  );
  assert.equal(searched.result.results.length, 1);
  console.log("AURORA Tool Engine tests passed: safe calculator, adapter routing, unavailable tools, and action authorization.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
