const crypto = require("crypto");
const https = require("https");

let cachedJwks = null;
let cachedAt = 0;
const CACHE_MS = 10 * 60 * 1000;

exports.handler = async (event) => {
  console.log("Authorizer Event:", JSON.stringify(event));
  try {
    const token = extractToken(event);
    const payload = await verifyJwt(token);
    
    // Create a wildcard ARN so the cached policy applies to all endpoints
    const methodArn = event.methodArn || event.routeArn;
    const apiArnPrefix = methodArn.split("/").slice(0, 2).join("/");
    const wildcardResource = `${apiArnPrefix}/*`;

    return {
      principalId: payload.sub,
      policyDocument: {
        Version: "2012-10-17",
        Statement: [{ Action: "execute-api:Invoke", Effect: "Allow", Resource: wildcardResource }]
      },
      context: { userId: payload.sub, email: payload.email || "" }
    };
  } catch (error) {
    console.warn("JWT authorizer rejected request", error.message);
    throw new Error("Unauthorized");
  }
};

async function verifyJwt(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("MalformedToken");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(base64urlDecode(encodedHeader).toString("utf8"));
  const payload = JSON.parse(base64urlDecode(encodedPayload).toString("utf8"));
  const region = process.env.AWS_REGION || process.env.REGION;
  const userPoolId = process.env.USER_POOL_ID;
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error("TokenExpired");
  if (payload.iss !== issuer) throw new Error("InvalidIssuer");
  if (payload.token_use !== "access" && payload.token_use !== "id") throw new Error("InvalidTokenUse");

  const jwks = await getJwks();
  const key = jwks.keys.find((item) => item.kid === header.kid);
  if (!key) throw new Error("UnknownKid");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();

  const valid = verifier.verify(jwkToPem(key), encodedSignature, "base64url");
  if (!valid) throw new Error("InvalidSignature");
  return payload;
}

function extractToken(event) {
  const value = event.headers?.authorization || event.headers?.Authorization || event.identitySource?.[0];
  if (!value?.startsWith("Bearer ")) throw new Error("MissingBearerToken");
  return value.slice("Bearer ".length);
}

async function getJwks() {
  if (cachedJwks && Date.now() - cachedAt < CACHE_MS) return cachedJwks;
  const region = process.env.AWS_REGION || process.env.REGION;
  const userPoolId = process.env.USER_POOL_ID;
  const uri = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  cachedJwks = await getJson(uri);
  cachedAt = Date.now();
  return cachedJwks;
}

function getJson(uri) {
  return new Promise((resolve, reject) => {
    https
      .get(uri, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function jwkToPem(jwk) {
  const modulus = ensurePositiveInteger(base64urlDecode(jwk.n));
  const exponent = ensurePositiveInteger(base64urlDecode(jwk.e));
  const rsaPublicKey = derSequence(Buffer.concat([derInteger(modulus), derInteger(exponent)]));
  const algorithm = derSequence(
    Buffer.concat([
      derObjectIdentifier(Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01])),
      derNull()
    ])
  );
  const publicKey = derSequence(Buffer.concat([algorithm, derBitString(rsaPublicKey)]));
  const body = publicKey.toString("base64").match(/.{1,64}/g).join("\n");
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

function base64urlDecode(value) {
  return Buffer.from(value, "base64url");
}

function ensurePositiveInteger(buffer) {
  return buffer[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), buffer]) : buffer;
}

function derLength(length) {
  if (length < 128) return Buffer.from([length]);
  const bytes = [];
  while (length > 0) {
    bytes.unshift(length & 0xff);
    length >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function der(tag, body) {
  return Buffer.concat([Buffer.from([tag]), derLength(body.length), body]);
}

function derSequence(body) {
  return der(0x30, body);
}

function derInteger(body) {
  return der(0x02, body);
}

function derObjectIdentifier(body) {
  return der(0x06, body);
}

function derNull() {
  return Buffer.from([0x05, 0x00]);
}

function derBitString(body) {
  return der(0x03, Buffer.concat([Buffer.from([0x00]), body]));
}

