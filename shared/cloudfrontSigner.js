const { getSignedUrl } = require("@aws-sdk/cloudfront-signer");
const { getSecret } = require("./secrets");

async function createSignedUrl(pathOrUrl, expiresInSeconds = 48 * 60 * 60) {
  const domain = process.env.CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.CF_KEY_PAIR_ID || process.env.CLOUDFRONT_KEY_PAIR_ID;
  const privateKey = await getSecret(process.env.CLOUDFRONT_SIGNING_KEY_SECRET || "cloudfront/signing-key");
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `https://${domain}/${pathOrUrl.replace(/^\/+/, "")}`;

  return getSignedUrl({
    url,
    keyPairId,
    privateKey,
    dateLessThan: new Date(Date.now() + expiresInSeconds * 1000).toISOString()
  });
}

module.exports = {
  createSignedUrl
};
