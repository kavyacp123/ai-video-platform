#!/bin/bash
set -euo pipefail

OUTPUTS=$(aws cloudformation describe-stacks --query 'Stacks[*].Outputs' --output json)
{
  echo "VITE_USER_POOL_ID=$(echo "$OUTPUTS" | jq -r '.. | .UserPoolId? | select(. != null)' | head -1)"
  echo "VITE_USER_POOL_CLIENT_ID=$(echo "$OUTPUTS" | jq -r '.. | .UserPoolClientId? | select(. != null)' | head -1)"
  echo "VITE_IDENTITY_POOL_ID=$(echo "$OUTPUTS" | jq -r '.. | .IdentityPoolId? | select(. != null)' | head -1)"
  echo "VITE_COGNITO_DOMAIN=$(echo "$OUTPUTS" | jq -r '.. | .CognitoDomain? | select(. != null)' | head -1)"
  echo "VITE_API_URL=$(echo "$OUTPUTS" | jq -r '.. | .ApiGatewayUrl? | select(. != null)' | head -1)"
  echo "VITE_WEBSOCKET_URL=$(echo "$OUTPUTS" | jq -r '.. | .WebSocketUrl? | select(. != null)' | head -1)"
  echo "VITE_CF_DOMAIN=$(echo "$OUTPUTS" | jq -r '.. | .CloudFrontDomain? | select(. != null)' | head -1)"
} > frontend/.env.local

echo ".env.local written for frontend"
