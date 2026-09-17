import type { Answers, Block, Field, Level, Result } from "../core/contract.ts";
import type { Progress } from "../core/session.ts";
import type { Appearance } from "../terminal/appearance.ts";

export interface Writer {
  write(text: string): Promise<void>;
}
export interface View {
  blocks(blocks: readonly Block[]): Promise<void>;
  message(level: Level, text: string): Promise<void>;
  result(result: Result): Promise<void>;
  progress(read: () => Progress): void;
  close(): Promise<void>;
}
export interface Ports {
  readonly output: Writer;
  readonly signal: AbortSignal;
  readDocument(path: string): Promise<string>;
  readEvents(): AsyncIterable<Iterable<string>>;
  openView(appearance: Appearance): Promise<View>;
  ask(
    fields: readonly Field[],
    title: string | undefined,
    appearance: Appearance,
  ): Promise<Answers>;
}
