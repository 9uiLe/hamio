export const htmlStyle = `
:root {
  color-scheme: light;
  --surface-base: #fff;
  --surface-subtle: #f5f7f8;
  --surface-emphasis: #e9eef2;
  --fg-primary: #17212b;
  --fg-secondary: #455463;
  --fg-subtle: #5d6a75;
  --border-normal: #d3dce4;
  --border-strong: #7d8994;
  --tone-info: #155b91;
  --tone-success: #17643b;
  --tone-warning: #805600;
  --tone-danger: #a72824;
  --focus: #155b91;
  --motion-ongoing: 1000ms;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --surface-base: #11161b;
    --surface-subtle: #1b232a;
    --surface-emphasis: #26323b;
    --fg-primary: #f2f5f7;
    --fg-secondary: #c2cbd3;
    --fg-subtle: #aebac3;
    --border-normal: #40515e;
    --border-strong: #8b9eab;
    --tone-info: #8fcbfa;
    --tone-success: #8bd7ab;
    --tone-warning: #f1c478;
    --tone-danger: #ffa5a0;
    --focus: #a5d4ff;
    }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --surface-base: #11161b;
  --surface-subtle: #1b232a;
  --surface-emphasis: #26323b;
  --fg-primary: #f2f5f7;
  --fg-secondary: #c2cbd3;
  --fg-subtle: #aebac3;
  --border-normal: #40515e;
  --border-strong: #8b9eab;
  --tone-info: #8fcbfa;
  --tone-success: #8bd7ab;
  --tone-warning: #f1c478;
  --tone-danger: #ffa5a0;
  --focus: #a5d4ff;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
* {
  box-sizing: border-box;
}
html {
  background: var(--surface-base);
  color: var(--fg-primary);
}
body {
  margin: 0;
  font:
    400 15px/1.5 system-ui,
    sans-serif;
  overflow-wrap: anywhere;
}
main {
  width: min(100%, 76rem);
  margin-inline: auto;
  padding: 24px max(16px, 3vw) 48px;
}
.recording-meta {
  border-inline-start: 3px solid var(--border-strong);
  background: var(--surface-subtle);
  padding: 8px 12px;
  margin-block-end: 16px;
}
.recording-meta h2 { font-size: 0.875rem; }
.recording-meta p { color: var(--fg-secondary); }
h1,
h2,
h3,
p,
ul,
dl {
  margin-block: 0;
}
h1,
h2,
h3 {
  line-height: 1.35;
}
h1 {
  font-size: 18px;
  font-weight: 600;
}
h2 {
  font-size: 18px;
  font-weight: 600;
}
h3 {
  font-size: 14px;
  font-weight: 500;
}
.meta {
  font-size: 13px;
  line-height: 1.4;
  color: var(--fg-subtle);
}
.number {
  font-size: 13px;
  line-height: 1.4;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.mono,
code,
pre {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
.run-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding-block-end: 16px;
  border-bottom: 1px solid var(--border-strong);
}
.run-head .meta {
  flex-basis: 100%;
}
.run-result {
  margin-block: 24px 0;
  padding-block: 8px;
  border-top: 1px solid var(--border-strong);
}
.items {
  display: grid;
  gap: 16px;
  margin-block-start: 16px;
}
.items:empty {
  display: none;
}
.item {
  min-width: 0;
}
.item > h2 {
  margin-block-end: 8px;
}
.group {
  padding-block: 4px;
}
.group-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  margin-block-end: 8px;
}
.tasks {
  list-style: none;
  margin: 0;
  padding: 0;
}
.group .tasks {
  padding-inline-start: 12px;
  border-inline-start: 1px solid var(--border-normal);
}
.task {
  min-height: 32px;
  padding: 4px 8px;
  min-width: 0;
}
.task-main {
  display: flex;
  align-items: baseline;
  gap: 4px 8px;
  flex-wrap: wrap;
}
.task h2,
.task h3 {
  order: 1;
  font-size: 14px;
  font-weight: 500;
}
.task .status {
  order: 0;
}
.task .meta {
  order: 2;
}
.task-progress {
  margin-inline-start: 24px;
}
.task[data-state="running"] h2,
.task[data-state="running"] h3 {
  font-weight: 600;
}
.task[data-state="pending"],
.task[data-state="succeeded"] {
  color: var(--fg-secondary);
}
.task-failure {
  margin-inline-start: 24px;
}
.status {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  color: var(--fg-primary);
}
.status[data-tone="info"],
.message[data-tone="info"] .level {
  color: var(--tone-info);
}
.status[data-tone="success"],
.message[data-tone="success"] .level {
  color: var(--tone-success);
}
.status[data-tone="warning"],
.message[data-tone="warning"] .level {
  color: var(--tone-warning);
}
.status[data-tone="danger"],
.message[data-tone="danger"] .level {
  color: var(--tone-danger);
}
.status[data-tone="neutral"] {
  color: var(--fg-secondary);
}
.cue {
  display: inline-block;
  width: 1ch;
  text-align: center;
}
.activity {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  vertical-align: middle;
  animation: activity var(--motion-ongoing) linear infinite;
}
.progress-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.progress-line progress {
  width: min(15rem, 100%);
  height: 0.5rem;
  accent-color: var(--tone-info);
}
.progress-line .number {
  white-space: nowrap;
}
.progress-line .progress-note {
  color: var(--fg-secondary);
}
.message {
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.message .level {
  font-size: 14px;
  font-weight: 500;
  min-width: 4.5em;
}
.failure {
  border-inline-start: 2px solid var(--tone-danger);
  padding-inline-start: 8px;
  min-width: 0;
}
.failure .failure-code {
  color: var(--tone-danger);
  font:
    500 13px/1.5 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.failure .failure-message {
  font-weight: 500;
}
.failure details {
  margin-block-start: 8px;
}
.result > h2,
.summary > h2 {
  margin-block-end: 8px;
}
.result-data,
.failure pre {
  margin-block-start: 8px;
}
.scroll-hint {
  font-size: 13px;
  color: var(--fg-secondary);
  margin-block: 4px;
}
.scroll {
  overflow-x: auto;
  max-width: 100%;
  scrollbar-gutter: stable;
  border: 1px solid var(--border-normal);
  border-radius: 4px;
}
.scroll:focus-visible,
summary:focus-visible,
input:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.scroll:focus-visible {
  outline-offset: -2px;
}
table {
  border-collapse: collapse;
  width: 100%;
  min-width: max-content;
  font-size: 14px;
}
caption {
  text-align: start;
  font-size: 13px;
  color: var(--fg-secondary);
  padding: 4px 8px;
}
th,
td {
  padding: 6px 8px;
  text-align: start;
  vertical-align: top;
  border-bottom: 1px solid var(--border-normal);
  overflow-wrap: normal;
}
th {
  font-weight: 500;
  border-bottom-color: var(--border-strong);
}
td.number {
  text-align: end;
}
tr:last-child td {
  border-bottom: 0;
}
.empty {
  color: var(--fg-secondary);
}
.source-truncated {
  font-size: 13px;
  color: var(--tone-warning);
  margin-block: 8px 0;
}
.key-values {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 4px 16px;
}
.key-values dt {
  color: var(--fg-secondary);
}
.key-values dd {
  margin: 0;
  min-width: 0;
}
.code-surface,
.diff-surface {
  background: var(--surface-subtle);
}
pre {
  margin: 0;
  padding: 8px;
  white-space: pre;
  overflow-wrap: normal;
  font-size: 13px;
  line-height: 1.5;
  tab-size: 2;
}
code {
  font: inherit;
}
.diff-lines {
  list-style: none;
  margin: 0;
  padding: 8px;
  min-width: max-content;
  font:
    400 13px/1.5 ui-monospace,
    SFMono-Regular,
    Consolas,
    monospace;
}
.diff-lines li {
  white-space: pre;
}
.diff-lines .kind {
  display: inline-block;
  min-width: 8ch;
}
.diff-lines .added {
  color: var(--tone-success);
}
.diff-lines .removed {
  color: var(--tone-danger);
}
.tree-list {
  padding-inline-start: 20px;
}
.tree-list .tree-list {
  margin-block: 4px;
}
.summary {
  padding-block-start: 8px;
  border-top: 1px solid var(--border-strong);
}
.summary ul {
  padding-inline-start: 20px;
}
.redacted {
  color: var(--fg-secondary);
}
details > summary {
  cursor: pointer;
  min-height: 24px;
}
details > summary:hover {
  text-decoration: underline;
}
.motion-control {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--fg-secondary);
  margin-block-end: 16px;
}
.motion-control input {
  width: 16px;
  height: 16px;
}
.motion-control:has(input:checked) ~ main .activity {
  animation-play-state: paused;
}
@keyframes activity {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.35;
    transform: scale(0.75);
  }
}
@container (max-width:36rem) {
  .run-head {
    display: block;
  }
  .task-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
  }
  .task h2,
  .task h3 {
    order: 1;
    font-size: 14px;
    font-weight: 500;
  }
  .task .meta {
    grid-column: 2;
  }
  .task-progress,
  .task-failure {
    margin-inline-start: 24px;
  }
  .group .tasks {
    padding-inline-start: 8px;
  }
  .key-values {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .key-values dd {
    margin-block-end: 8px;
  }
}
.presentation {
  container-type: inline-size;
}
.presentation main {
  width: 100%;
}
@media (prefers-reduced-motion: reduce) {
  .activity {
    animation: none;
  }
}
:root[data-motion="reduced"] .activity {
  animation: none;
}
@media (forced-colors: active) {
  .failure {
    border-color: CanvasText;
  }
  .scroll {
    border-color: CanvasText;
  }
  .activity {
    background: CanvasText;
  }
  .progress-line progress {
    accent-color: Highlight;
  }
}
.progress-static {
  display: inline-block;
  width: min(15rem, 100%);
  height: 0.5rem;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: repeating-linear-gradient(
    90deg,
    var(--surface-emphasis) 0 8px,
    var(--surface-base) 8px 16px
  );
}
.progress-static.motion-fallback {
  display: none;
}
.motion-control:has(input:checked) ~ main .progress-ongoing {
  display: none;
}
.motion-control:has(input:checked) ~ main .progress-static.motion-fallback {
  display: inline-block;
}
:root[data-motion="reduced"] .progress-ongoing {
  display: none;
}
:root[data-motion="reduced"] .progress-static.motion-fallback {
  display: inline-block;
}
:root[data-motion="reduced"] .motion-control {
  display: none;
}
@media (prefers-reduced-motion: reduce) {
  .progress-ongoing {
    display: none;
  }
  .progress-static.motion-fallback {
    display: inline-block;
  }
  .motion-control {
    display: none;
  }
}
.task h2,
.task h3,
.message p,
.failure-message,
.failure-code,
td,
dd,
code,
.diff-lines li,
.tree-list li,
.summary p {
  unicode-bidi: isolate;
}
@media print {
  :root,
  :root[data-theme="dark"] {
    color-scheme: light;
    --surface-base: #fff;
    --surface-subtle: #f5f7f8;
    --surface-emphasis: #e9eef2;
    --fg-primary: #17212b;
    --fg-secondary: #455463;
    --fg-subtle: #5d6a75;
    --border-normal: #d3dce4;
    --border-strong: #7d8994;
    --tone-info: #155b91;
    --tone-success: #17643b;
    --tone-warning: #805600;
    --tone-danger: #a72824;
  }
  body {
    background: #fff;
    color: #17212b;
  }
  .activity,
  .motion-control,
  .progress-ongoing {
    display: none;
  }
  .progress-static.motion-fallback {
    display: inline-block;
  }
  .scroll {
    overflow: visible;
    border: 0;
  }
  table {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  th,
  td {
    overflow-wrap: anywhere;
  }
  pre,
  .diff-lines {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  details > summary {
    display: none;
  }
  details:not([open]) > *:not(summary) {
    display: block;
  }
  .item,
  .task,
  tr {
    break-inside: avoid;
  }
  main {
    width: 100%;
    padding: 0;
  }
}
`;
