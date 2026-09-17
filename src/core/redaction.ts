import type { Block, Scalar } from "./contract.ts";

export function visibleValue(value: Scalar, secret: boolean): Scalar {
  return secret ? "[redacted]" : value;
}

/** JSON output keeps all rows; human formatters apply the same policy to visible cells. */
export function redacted(block: Block): Block {
  if (block.kind === "key-value") {
    if (!block.items.some((item) => item.secret)) return block;
    return {
      ...block,
      items: block.items.map((item) =>
        item.secret ? { ...item, value: visibleValue(item.value, true) } : item,
      ),
    };
  }
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
