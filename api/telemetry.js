// Vercel のサーバーレス関数：プレイログの受け取り（中身は api/_telemetry.js）
import { createTelemetryHandler, telemetryStoreFromEnv } from './_telemetry.js';

let store;
export default createTelemetryHandler(() => (store ??= telemetryStoreFromEnv()));
