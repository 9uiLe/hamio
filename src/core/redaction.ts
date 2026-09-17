import type { Block } from "./contract.ts";

export function redacted(block: Block): Block {
  if (block.kind === "key-value")
    return {
      ...block,
      items: block.items.map((item) => ({
        ...item,
        value: item.secret ? "[redacted]" : item.value,
      })),
    };
  if (block.kind === "table") {
    const secrets = block.columns.filter((column) => column.secret);
    if (!secrets.length) return block;
    return {
      ...block,
      rows: block.rows.map((row) => {
        const result = { ...row };
        for (const column of secrets) result[column.id] = "[redacted]";
        return result;
      }),
    };
  }
  return block;
}
