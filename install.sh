#!/bin/sh
# Joins the download parts into the app and opens it.
set -e
cd "$(dirname "$0")"
cat SpaceMiner.zip.part-* > SpaceMiner.zip
unzip -oq SpaceMiner.zip
rm SpaceMiner.zip
xattr -dr com.apple.quarantine "Space Miner- Beyond the Silence.app" 2>/dev/null || true
echo "Ready: Space Miner- Beyond the Silence.app"
open "Space Miner- Beyond the Silence.app"
