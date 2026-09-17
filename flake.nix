{
  description = "hamio development tools";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs =
    { nixpkgs, ... }:
    let
      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs { inherit system; };
          # Embed the hash-pinned upstream runtime, before Nix-specific loader patches.
          runtime =
            pkgs.runCommand "hamio-bun-runtime-${pkgs.bun.version}"
              {
                nativeBuildInputs = [ pkgs.unzip ];
              }
              ''
                unzip -q ${pkgs.bun.src} -d unpacked
                mkdir -p "$out"
                cp unpacked/*/bun "$out/bun"
                chmod 755 "$out/bun"
              '';
        in
        rec {
          default = pkgs.mkShellNoCC {
            packages = with pkgs; [
              bun
              nodejs_24
              git
              nixfmt
              shellcheck
              shfmt
              actionlint
            ];
            HAMIO_DEV_SHELL = "1";
            HAMIO_BUN_RUNTIME = "${runtime}/bun";
          };
          preview = pkgs.mkShellNoCC {
            inputsFrom = [ default ];
            packages = [
              pkgs.asciinema-agg
              (pkgs.python3.withPackages (python: [ python.pillow ]))
            ];
            HAMIO_PREVIEW_SHELL = "1";
            HAMIO_PREVIEW_FONTS = pkgs.symlinkJoin {
              name = "hamio-preview-fonts";
              paths = [
                pkgs.jetbrains-mono
                pkgs.noto-fonts-cjk-sans
              ];
            };
          };
        }
      );
      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt);
    };
}
