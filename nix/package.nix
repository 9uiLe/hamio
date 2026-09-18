{
  lib,
  stdenv,
  stdenvNoCC,
  fetchurl,
  autoPatchelfHook,
  gzip,
  gitMinimal,
}:
let
  release = lib.importJSON ./release.json;
  source =
    release.sources.${stdenvNoCC.hostPlatform.system}
      or (throw "Unsupported hamio system: ${stdenvNoCC.hostPlatform.system}");
  asset = "hamio-v${release.version}-${source.target}";
  fetchAsset =
    suffix: hash:
    fetchurl {
      url = "https://github.com/9uiLe/hamio/releases/download/v${release.version}/${asset}.${suffix}";
      sha256 = hash;
    };
in
stdenvNoCC.mkDerivation {
  pname = "hamio";
  inherit (release) version;
  src = fetchAsset "gz" source.archive;

  strictDeps = true;
  dontUnpack = true;
  dontBuild = true;
  # Bun embeds the program in the executable. Stripping can destroy that payload.
  dontStrip = true;
  nativeBuildInputs = [ gzip ] ++ lib.optionals stdenvNoCC.hostPlatform.isLinux [ autoPatchelfHook ];
  buildInputs = lib.optionals stdenvNoCC.hostPlatform.isLinux [ stdenv.cc.cc.lib ];

  installPhase = ''
    runHook preInstall
    mkdir -p "$out/bin" "$out/share/hamio"
    gzip -dc "$src" > "$out/bin/hamio"
    printf '%s  %s\n' '${source.binary}' "$out/bin/hamio" | sha256sum -c -
    chmod 755 "$out/bin/hamio"
    cp ${fetchAsset "sha256" source.checksum} "$out/share/hamio/upstream.sha256"
    cp ${fetchAsset "spdx.json" source.sbom} "$out/share/hamio/upstream.spdx.json"
    cp ${fetchAsset "notices.txt" source.notices} "$out/share/hamio/notices.txt"
    cp ${./release.json} "$out/share/hamio/release.json"
    runHook postInstall
  '';

  doInstallCheck = true;
  nativeInstallCheckInputs = [ gitMinimal ];
  installCheckPhase = ''
    runHook preInstallCheck
    sh ${../scripts/smoke-consumer.sh} "$out/bin/hamio" '${release.version}'
    runHook postInstallCheck
  '';

  meta = {
    description = "Shared terminal forms and output for development scripts";
    homepage = "https://github.com/9uiLe/hamio";
    changelog = "https://github.com/9uiLe/hamio/releases/tag/v${release.version}";
    mainProgram = "hamio";
    platforms = builtins.attrNames release.sources;
    sourceProvenance = [ lib.sourceTypes.binaryNativeCode ];
    license = with lib.licenses; [
      mit
      lgpl21Only
    ];
  };
}
