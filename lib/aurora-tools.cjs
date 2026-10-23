/**
 * AURORA Universal Tool Engine (server-side, provider- and UI-independent).
 *
 * Tools are registered capabilities, not model claims. The engine validates
 * requests, runs deterministic built-ins, and delegates external/device work
 * only to explicitly supplied adapters. It never executes model-generated code.
 */
const MAX_ARGUMENT_CHARS = 4000;
const TOOL_DEFINITIONS = Object.freeze({
  calculator: { sideEffect: false, description: "Evaluate basic arithmetic." },
  web_search: { sideEffect: false, description: "Search the web through a registered adapter." },
  weather: { sideEffect: false, description: "Get weather through a registered adapter." },
  device_action: { sideEffect: true, description: "Perform an authorized action through a device adapter." }
});

function fail(message, code = "INVALID_TOOL_REQUEST") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function parseArithmetic(expression) {
  if (typeof expression !== "string" || !expression.trim() || expression.length > 240) {
    fail("Calculator needs an arithmetic expression up to 240 characters.");
  }
  const source = expression.replace(/\s+/g, "");
  const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/%^]/g);
  if (!tokens || tokens.join("") !== source) fail("Only basic arithmetic is supported.");

  const output = [];
  const operators = [];
  const precedence = { "u+": 4, "u-": 4, "^": 3, "*": 2, "/": 2, "%": 2, "+": 1, "-": 1 };
  const rightAssociative = new Set(["^", "u+", "u-"]);
  let expectValue = true;

  for (const token of tokens) {
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token)) {
      if (!expectValue) fail("Missing operator in arithmetic expression.");
      output.push(Number(token));
      expectValue = false;
      continue;
    }
    if (token === "(") {
      if (!expectValue) fail("Missing operator before parenthesis.");
      operators.push(token);
      expectValue = true;
      continue;
    }
    if (token === ")") {
      if (expectValue) fail("Incomplete expression inside parentheses.");
      while (operators.length && operators[operators.length - 1] !== "(") output.push(operators.pop());
      if (operators.pop() !== "(") fail("Mismatched parentheses.");
      expectValue = false;
      continue;
    }
    let op = token;
    if (expectValue && (op === "+" || op === "-")) op = "u" + op;
    else if (expectValue) fail("Unexpected arithmetic operator.");
    while (operators.length) {
      const top = operators[operators.length - 1];
      if (top === "(") break;
      const shouldPop = rightAssociative.has(op) ? precedence[op] < precedence[top] : precedence[op] <= precedence[top];
      if (!shouldPop) break;
      output.push(operators.pop());
    }
    operators.push(op);
    expectValue = true;
  }
  if (expectValue) fail("Expression cannot end with an operator.");
  while (operators.length) {
    const op = operators.pop();
    if (op === "(") fail("Mismatched parentheses.");
    output.push(op);
  }

  const stack = [];
  for (const token of output) {
    if (typeof token === "number") { stack.push(token); continue; }
    if (token === "u+" || token === "u-") {
      if (stack.length < 1) fail("Invalid unary operator.");
      const a = stack.pop();
      stack.push(token === "u-" ? -a : a);
      continue;
    }
    if (stack.length < 2) fail("Invalid arithmetic expression.");
    const b = stack.pop();
    const a = stack.pop();
    let result;
    switch (token) {
      case "+": result = a + b; break;
      case "-": result = a - b; break;
      case "*": result = a * b; break;
      case "/": if (b === 0) fail("Cannot divide by zero.", "CALCULATION_ERROR"); result = a / b; break;
      case "%": if (b === 0) fail("Cannot take remainder by zero.", "CALCULATION_ERROR"); result = a % b; break;
      case "^": result = a ** b; break;
      default: fail("Unsupported operator.");
    }
    if (!Number.isFinite(result)) fail("Result is outside the supported numeric range.", "CALCULATION_ERROR");
    stack.push(result);
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) fail("Invalid arithmetic expression.");
  return stack[0];
}

function normalizeToolRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) fail("A tool request object is required.");
  const name = typeof request.name === "string" ? request.name : "";
  if (!Object.prototype.hasOwnProperty.call(TOOL_DEFINITIONS, name)) fail("Unknown tool: " + name);
  const args = request.arguments === undefined ? {} : request.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args)) fail("Tool arguments must be an object.");
  if (JSON.stringify(args).length > MAX_ARGUMENT_CHARS) fail("Tool arguments are too large.");
  return { name, arguments: args };
}

async function executeTool(request, options = {}) {
  const normalized = normalizeToolRequest(request);
  const { name, arguments: args } = normalized;
  const definition = TOOL_DEFINITIONS[name];

  if (definition.sideEffect) {
    if (options.confirmed !== true) fail("This action requires explicit user confirmation.", "CONFIRMATION_REQUIRED");
    if (options.authorized !== true) fail("This action requires an authorized device capability.", "PERMISSION_DENIED");
  }

  if (name === "calculator") {
    const expression = args.expression;
    const result = parseArithmetic(expression);
    return { ok: true, tool: name, result, expression: expression.trim() };
  }

  const adapter = options.adapters && options.adapters[name];
  if (typeof adapter !== "function") fail("Tool adapter is not configured: " + name, "TOOL_UNAVAILABLE");
  const result = await adapter(args, { requestId: options.requestId || null });
  if (result === undefined) fail("Tool adapter returned no result.", "EMPTY_TOOL_RESULT");
  return { ok: true, tool: name, result };
}

module.exports = { TOOL_DEFINITIONS, normalizeToolRequest, parseArithmetic, executeTool };
