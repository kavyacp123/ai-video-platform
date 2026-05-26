function log(level, message, context = {}) {
  console[level](
    JSON.stringify({
      level,
      message,
      service: process.env.AWS_LAMBDA_FUNCTION_NAME,
      timestamp: new Date().toISOString(),
      ...context
    })
  );
}

module.exports = {
  info: (message, context) => log("info", message, context),
  warn: (message, context) => log("warn", message, context),
  error: (message, context) => log("error", message, context)
};

