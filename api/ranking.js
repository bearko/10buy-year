// Vercel のサーバーレス関数：週替わりチャレンジのオンラインランキング（中身は api/_ranking.js）
import { createHandler, storeFromEnv } from './_ranking.js';

let store;
export default createHandler(() => (store ??= storeFromEnv()));
