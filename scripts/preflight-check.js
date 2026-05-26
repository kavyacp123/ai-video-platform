const { execFileSync } = require("child_process");

const checks = [];

function run(name, fn, critical = true) {
  try {
    fn();
    checks.push({ name, ok: true, critical });
  } catch (error) {
    checks.push({ name, ok: false, critical, error: error.message });
  }
}

function aws(args) {
  return execFileSync("aws", args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
}

run("AWS credentials configured", () => aws(["sts", "get-caller-identity"]));
run("GOOGLE_CLIENT_ID set", () => requireEnv("GOOGLE_CLIENT_ID"), false);
run("CF_KEY_GROUP_ID set", () => requireEnv("CF_KEY_GROUP_ID"), false);
run("CF_KEY_PAIR_ID set", () => requireEnv("CF_KEY_PAIR_ID"), false);
run("ALERT_EMAIL set", () => requireEnv("ALERT_EMAIL"), false);
run("cloudfront/signing-key secret exists", () => aws(["secretsmanager", "describe-secret", "--secret-id", "cloudfront/signing-key"]), false);
run("ffmpeg-worker ECR image exists", () => aws(["ecr", "describe-images", "--repository-name", "ffmpeg-worker"]), false);
run("MediaConvert default role exists", () => {
  const account = JSON.parse(aws(["sts", "get-caller-identity"])).Account;
  aws(["iam", "get-role", "--role-name", "MediaConvert_Default_Role", "--query", "Role.Arn", "--output", "text"]);
  if (!account) throw new Error("No account");
}, false);

let failed = false;
for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.name}${check.ok ? "" : ` — ${check.error}`}`);
  if (!check.ok && check.critical) failed = true;
}
process.exit(failed ? 1 : 0);

function requireEnv(name) {
  if (!process.env[name]) throw new Error(`${name} missing`);
}

