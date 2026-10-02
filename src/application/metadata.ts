import { version } from "../../package.json";

export const VERSION = version;
export const help = `hamio ${VERSION} — semantic presentation for scripts and applications

Presentation Protocol v2:
  hamio presentation static [--input FILE|-] [--no-color]
  hamio presentation live [--record FILE] [--no-color] [--no-motion]
  hamio presentation report --input RECORDING --output HTML
  hamio presentation capabilities

Interaction:
  hamio form --definition FILE [--values FILE|-] [--interactive auto|always|never]

  hamio --version

Form also accepts --color auto|always|never.
Human UI uses stderr; responses use stdout.
See docs/presentation-api.md and docs/migration-v1-to-presentation-v2.md.
`;
