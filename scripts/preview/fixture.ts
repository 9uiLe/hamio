// A recording fixture, not hamio's product UI or public API.
export {};
if (!process.stdin.isTTY || !process.stderr.isTTY) {
  throw new Error("Run the preview fixture in a terminal.");
}

const color = (code: number, value: string) => `\u001b[${code}m${value}\u001b[0m`;
const line = (value = "") => process.stderr.write(`${value}\r\n`);
const clear = () => process.stderr.write("\u001b[2J\u001b[H\u001b[?25l");
const title = () => {
  line(color(36, "  hamio / terminal preview"));
  line(color(90, "  録画基盤のサンプル · 製品 UI は未実装"));
  line();
};

process.stdin.setRawMode(true);
try {
  clear();
  title();
  line(color(36, "  ◆ 確認する環境を選択"));
  line("    ● 開発環境 (local)");
  line("    ○ ステージング (staging)");
  line();
  line(color(90, "    Enter でサンプルを進める"));
  await new Promise<void>((resolve, reject) => {
    process.stdin.once("data", (data: Buffer) => {
      if (data.includes(13)) resolve();
      else reject(new Error("Expected Enter in the preview fixture."));
    });
    process.stdin.resume();
  });
  clear();
  title();
  line(color(32, "  ✓ 開発環境を選択しました"));
  line();
  process.stderr.write("  ◐ サンプル処理を表示中...  1 / 2");
  await Bun.sleep(350);
  process.stderr.write("\r\u001b[2K");
  line(color(32, "  ✓ サンプル処理の表示完了  2 / 2"));
  line();
  line("    項目                状態        結果");
  line("    ────────────────────────────────────────────────────");
  line(`    日本語表示          ${color(32, "成功")}        文字幅と罫線を確認`);
  line(`    カーソル更新        ${color(32, "成功")}        進捗行を置換`);
  line();
  line(color(33, "  ! 外部接続・業務処理は実行していません"));
  line();
  line(color(90, "  プレビュー完了"));
} finally {
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.stderr.write("\u001b[?25h");
}
