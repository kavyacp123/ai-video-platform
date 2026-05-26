const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");

const client = new SecretsManagerClient({});
const cache = new Map();

async function getSecret(secretName) {
  const cached = cache.get(secretName);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const result = await client.send(new GetSecretValueCommand({ SecretId: secretName }));
  const value = result.SecretString || Buffer.from(result.SecretBinary || "").toString("utf8");
  cache.set(secretName, { value, expiresAt: Date.now() + 5 * 60 * 1000 });
  return value;
}

module.exports = {
  getSecret
};

