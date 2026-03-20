#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/dist/lambda"
PACKAGE_DIR="${BUILD_DIR}/package"
ZIP_PATH="${BUILD_DIR}/data-streams.zip"

rm -rf "${PACKAGE_DIR}" "${ZIP_PATH}"
mkdir -p "${PACKAGE_DIR}"

docker run --rm \
  --platform linux/amd64 \
  -v "${ROOT_DIR}:/workspace" \
  public.ecr.aws/lambda/python:3.12 \
  bash -lc "
    set -euo pipefail
    pip install --upgrade pip
    pip install /workspace -t /workspace/dist/lambda/package
  "

cp -R "${ROOT_DIR}/src" "${PACKAGE_DIR}/src"
cp -R "${ROOT_DIR}/schemas" "${PACKAGE_DIR}/schemas"

(
  cd "${PACKAGE_DIR}"
  zip -qr "${ZIP_PATH}" .
)

echo "Built Lambda package: ${ZIP_PATH}"
