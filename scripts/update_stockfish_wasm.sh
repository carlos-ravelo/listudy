#!/bin/sh
# Engine assets are copied from the pinned npm package by webpack.
set -eu
cd "$(dirname "$0")/../assets"
exec npm run deploy
