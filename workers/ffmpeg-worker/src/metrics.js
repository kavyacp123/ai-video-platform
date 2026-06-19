"use strict";

const { CloudWatchClient, PutMetricDataCommand } = require("@aws-sdk/client-cloudwatch");

const cw = new CloudWatchClient({ region: process.env.AWS_REGION || "ap-south-1" });
const NAMESPACE = "VideoProcessingPipeline";

/**
 * Emit a single CloudWatch metric (fire-and-forget, never throws).
 * @param {string} metricName
 * @param {number} value
 * @param {string} unit  e.g. "Milliseconds", "Count"
 * @param {Record<string,string>} dimensions
 */
async function emitMetric(metricName, value, unit = "Count", dimensions = {}) {
  const dims = Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value: String(Value) }));
  try {
    await cw.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [{
        MetricName: metricName,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
        Dimensions: dims,
      }],
    }));
  } catch (_) {
    // Metrics are best-effort; never let them crash the worker.
  }
}

/**
 * Initialise an X-Ray sub-segment wrapper.
 * AWS X-Ray SDK instruments the HTTP/SQS/S3 calls automatically when the
 * ECS task has the X-Ray daemon sidecar.  We expose a lightweight helper so
 * the rest of the code stays clean.
 */
let xray;
try {
  xray = require("aws-xray-sdk-core");
  xray.config([require("aws-xray-sdk-core").plugins.ECSPlugin]);
} catch (_) {
  // Fallback no-op when SDK is not installed locally.
  xray = { captureAsyncFunc: (_n, fn) => fn({ addAnnotation() {}, close() {} }), getSegment: () => null };
}

/**
 * Run `fn` inside a named X-Ray sub-segment.
 * @param {string} name
 * @param {Function} fn  async (subsegment) => any
 */
async function withSegment(name, fn) {
  return new Promise((resolve, reject) => {
    xray.captureAsyncFunc(name, (seg) => {
      Promise.resolve(fn(seg))
        .then((v) => { seg.close(); resolve(v); })
        .catch((e) => { seg.close(e); reject(e); });
    });
  });
}

module.exports = { emitMetric, withSegment, xray };
