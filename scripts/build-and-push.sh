#!/bin/bash
set -euo pipefail

ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-ap-south-1}
REPO="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/ffmpeg-worker"

aws ecr describe-repositories --repository-names ffmpeg-worker --region "$REGION" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name ffmpeg-worker --region "$REGION" >/dev/null

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

docker build -t ffmpeg-worker workers/ffmpeg-worker/
docker tag ffmpeg-worker:latest "$REPO:latest"
docker push "$REPO:latest"

grep -q '^IMAGE_TAG=' .env 2>/dev/null && sed -i.bak 's/^IMAGE_TAG=.*/IMAGE_TAG=latest/' .env || echo "IMAGE_TAG=latest" >> .env
echo "Pushed $REPO:latest"

