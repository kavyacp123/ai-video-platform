"use strict";

/**
 * Structured JSON logger.
 * Every entry includes: processingId, videoId, stage, level, message, durationMs, timestamp.
 */
class Logger {
  constructor(context = {}) {
    this.context = context; // { processingId, videoId, stage }
  }

  /** Return a new logger with additional merged context */
  child(extra) {
    return new Logger({ ...this.context, ...extra });
  }

  _write(level, message, extra = {}) {
    const entry = {
      ...this.context,
      level,
      message,
      timestamp: new Date().toISOString(),
      ...extra,
    };
    // Always use stdout; ECS/CloudWatch picks it up automatically.
    process.stdout.write(JSON.stringify(entry) + "\n");
  }

  info(message, extra)  { this._write("INFO",  message, extra); }
  warn(message, extra)  { this._write("WARN",  message, extra); }
  error(message, extra) { this._write("ERROR", message, extra); }

  /** Convenience: log start, await fn(), log end with elapsed ms */
  async timed(stageName, fn) {
    const t0 = Date.now();
    const log = this.child({ stage: stageName });
    log.info(`${stageName} started`);
    try {
      const result = await fn();
      log.info(`${stageName} completed`, { durationMs: Date.now() - t0 });
      return result;
    } catch (err) {
      log.error(`${stageName} failed`, { durationMs: Date.now() - t0, error: err.message, stack: err.stack });
      throw err;
    }
  }
}

module.exports = { Logger };
