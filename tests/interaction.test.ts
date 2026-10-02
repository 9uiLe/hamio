import { productCommand } from "./support/command.ts";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveForm } from "../src/interaction/form.ts";
import { decodeForm, parseJson } from "../src/interaction/validate.ts";

const formDefinition = (value: unknown) => decodeForm(JSON.stringify(value));

const definition = {
  apiVersion: 1,
  id: "test",
  fields: [
    { id: "name", kind: "text", label: "名前", minLength: 1, maxLength: 5 },
    { id: "ok", kind: "confirm", label: "確認" },
    { id: "choice", kind: "select", label: "選択", options: [{ value: "a", label: "A" }] },
    {
      id: "many",
      kind: "multiselect",
      label: "複数",
      options: [{ value: "a", label: "A" }],
      default: ["a"],
    },
    { id: "secret", kind: "secret", label: "秘密", required: false },
  ],
};
async function cli(args: string[], input = "") {
  const child = Bun.spawn(productCommand(args), {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  child.stdin.write(input);
  child.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr, json: () => JSON.parse(stdout) };
}
async function withForm(action: (path: string) => Promise<void>, value: unknown = definition) {
  const directory = await mkdtemp(join(tmpdir(), "hamio-api-"));
  const path = join(directory, "form.json");
  try {
    await Bun.write(path, JSON.stringify(value));
    await action(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const valid = { name: "日本語", ok: false, choice: "a" };

test("form returns equal values, defaults and false without interactive input", async () => {
  await withForm(async (path) => {
    const result = await cli(
      ["form", "--definition", path, "--values", "-", "--interactive", "never"],
      JSON.stringify(valid),
    );
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.json()).toEqual({
      apiVersion: 1,
      status: "ok",
      id: "test",
      values: { ...valid, many: ["a"] },
    });
  });
});
test("missing, invalid and secret answers never leak partial values", async () => {
  await withForm(async (path) => {
    const missing = await cli(["form", "--definition", path, "--interactive", "never"]);
    expect(missing.code).toBe(3);
    expect(missing.json().missing).toEqual(["name", "ok", "choice"]);
    const invalid = await cli(
      ["form", "--definition", path, "--values", "-"],
      JSON.stringify({ ...valid, secret: "do-not-echo", name: "too long" }),
    );
    expect(invalid.code).toBe(4);
    expect(invalid.json().issues[0].code).toBe("LENGTH");
    expect(invalid.stdout + invalid.stderr).not.toContain("do-not-echo");
    const duplicate = resolveForm(formDefinition(definition), { ...valid, many: ["a", "a"] });
    expect(duplicate.status).toBe("invalid_values");
  });
});
test("closed definitions reject unsupported versions, constraints, IDs and defaults", () => {
  expect(() => formDefinition({ ...definition, apiVersion: 2 })).toThrow("apiVersion");
  expect(() =>
    formDefinition({
      ...definition,
      fields: [{ id: "a", kind: "text", label: "a", pattern: ".*" }],
    }),
  ).toThrow("unknown property");
  expect(() =>
    formDefinition({ ...definition, fields: [{ id: "constructor", kind: "text", label: "a" }] }),
  ).toThrow("identifier");
  expect(() =>
    formDefinition({
      ...definition,
      fields: [{ id: "s", kind: "secret", label: "s", default: "hidden" }],
    }),
  ).toThrow("secret default");
  expect(() =>
    formDefinition({ ...definition, fields: [definition.fields[0], definition.fields[0]] }),
  ).toThrow("unique");
  expect(() => parseJson('{"__proto__":{"polluted":true}}')).toThrow("reserved");
  expect(() => parseJson('{"x":9007199254740992}')).toThrow("safe");
  expect(() => parseJson('"\\ud800"')).toThrow("Unicode");
});
interface Step {
  wait: string;
  send?: string;
  signal?: "SIGTERM";
  resize?: number;
}
async function pty(path: string, steps: Step[]) {
  const directory = await mkdtemp(join(tmpdir(), "hamio-pty-"));
  const reply = join(directory, "reply.json");
  let text = "";
  let remaining = "";
  let index = 0;
  let child: ReturnType<typeof Bun.spawn> | undefined;
  try {
    child = Bun.spawn(
      [
        "sh",
        "-c",
        'reply=$1; shift; exec "$@" > "$reply"',
        "hamio-test",
        reply,
        ...productCommand([
          "form",
          "--definition",
          path,
          "--interactive",
          "always",
          "--color",
          "never",
        ]),
      ],
      {
        env: { PATH: process.env.PATH ?? "", TERM: "xterm-256color", HOME: directory },
        timeout: 5000,
        terminal: {
          cols: 80,
          rows: 24,
          data(terminal, data) {
            const chunk = new TextDecoder().decode(data);
            text += chunk;
            remaining += chunk;
            const step = steps[index];
            if (step && remaining.includes(step.wait)) {
              remaining = "";
              index++;
              if (step.resize) terminal.resize(step.resize, 24);
              if (step.send) terminal.write(step.send);
              if (step.signal) child?.kill(step.signal);
            }
          },
        },
      },
    );
    const code = await child.exited;
    return { code, text, response: await Bun.file(reply).json(), steps: index };
  } finally {
    child?.terminal?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
test("real TTY routes UI to stderr, returns answers to stdout and masks secrets", async () => {
  await withForm(
    async (path) => {
      const result = await pty(path, [
        { wait: "名前", send: "demo\r" },
        { wait: "確認", send: "\r" },
        { wait: "選択", send: "\r" },
        { wait: "秘密", send: "super-secret\r" },
      ]);
      expect(result.code).toBe(0);
      expect(result.steps).toBe(4);
      expect(result.response.values).toEqual({
        name: "demo",
        ok: false,
        choice: "a",
        many: ["a"],
        secret: "super-secret",
      });
      expect(result.text).not.toContain("super-secret");
      expect(result.text).toContain("\u001b[?25h");
      expect(result.text).not.toContain("\u001b[32m");
    },
    { ...definition, fields: definition.fields.map((field) => ({ ...field, required: true })) },
  );
});
test("TTY Ctrl-C, EOF and SIGTERM cancel without returning partial answers", async () => {
  await withForm(async (path) => {
    for (const step of [
      { wait: "名前", send: "\u0003" },
      { wait: "名前", send: "\u0004" },
      { wait: "名前", signal: "SIGTERM" as const },
    ]) {
      const result = await pty(path, [step]);
      expect(result.code).toBe(130);
      expect(result.response).toEqual({ apiVersion: 1, status: "cancelled" });
      expect(result.text).toContain("\u001b[?25h");
    }
  });
});

test("TTY supports Japanese text and multiple selection, and bounds pasted input", async () => {
  await withForm(
    async (path) => {
      const result = await pty(path, [
        { wait: "名前", send: "日本語\r" },
        { wait: "複数", send: " \r" },
      ]);
      expect(result.code).toBe(0);
      expect(result.response.values).toEqual({ name: "日本語", many: ["a"] });
      const oversized = await pty(path, [{ wait: "名前", send: "a".repeat(17 * 1024) }]);
      expect(oversized.code).toBe(6);
      expect(oversized.response.error.code).toBe("LIMIT_EXCEEDED");
    },
    {
      apiVersion: 1,
      id: "input",
      fields: [
        definition.fields[0],
        {
          id: "many",
          kind: "multiselect",
          label: "複数",
          options: [
            { value: "a", label: "A" },
            { value: "b", label: "B" },
          ],
        },
      ],
    },
  );
});

test("UTF-8 limits preserve multibyte boundaries and reject lone surrogates", () => {
  for (const text of ["a".repeat(4096), "界".repeat(1365), "😀".repeat(1024)])
    expect(parseJson(JSON.stringify(text))).toBe(text);
  for (const text of ["a".repeat(4097), "界".repeat(1366), "😀".repeat(1025)])
    expect(() => parseJson(JSON.stringify(text))).toThrow("byte limit");
  for (const text of ["\ud800", `${"a".repeat(1400)}\udfff`])
    expect(() => parseJson(JSON.stringify(text))).toThrow("valid Unicode");
});

test("Form redraw handles a narrower PTY without losing the answer", async () => {
  await withForm(
    async (path) => {
      const result = await pty(path, [{ wait: "名前", resize: 40, send: "demo\r" }]);
      expect(result.code).toBe(0);
      expect(result.response.values.name).toBe("demo");
      expect(result.text).not.toContain("\u001b[2J");
    },
    { apiVersion: 1, id: "resize", fields: [definition.fields[0]] },
  );
});

test("root help exposes current commands and rejects unknown commands", async () => {
  const result = await cli(["unknown"]);
  expect(result.code).toBe(2);
  expect(result.json().error.code).toBe("INVALID_ARGUMENT");
  const help = await cli(["--help"]);
  expect(help.stdout).toContain("presentation live");
  expect(help.stdout).toContain("hamio form");
});
