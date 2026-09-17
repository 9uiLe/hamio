"""Call hamio without Bun or a language-specific SDK."""
import json
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parent.parent
binary = sys.argv[1] if len(sys.argv) > 1 else str(root / "dist/hamio")
result = subprocess.run(
    [binary, "form", "--definition", str(root / "examples/form.json"),
     "--values", "-", "--interactive", "never"],
    input=json.dumps({"environment": "local", "approved": False}),
    text=True, capture_output=True, check=False,
)
response = json.loads(result.stdout)
if result.returncode != 0:
    raise SystemExit(f"hamio: {response['status']}")
# Read response["values"] here to perform your own business operation.
print(json.dumps(response, ensure_ascii=False))
