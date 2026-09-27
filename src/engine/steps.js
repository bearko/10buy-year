// エンジンが UI に渡す「演出ステップ」の組み立てヘルパー。
// UI は steps 配列を先頭から順に再生する。choice の run() は選ばれたときに呼ばれ、続きの steps を返す。
export const talk = (who, text, pose) => ({ t: 'talk', who, text, pose });
export const narr = (text) => ({ t: 'talk', who: 'narr', text });
export const choice = (options, prompt) => ({ t: 'choice', options, prompt });
export const sfx = (name) => ({ t: 'sfx', name });
export const bg = (name) => ({ t: 'bg', name });
export const bgm = (name) => ({ t: 'bgm', name });
export const gain = (exp, extras = []) => ({ t: 'gain', exp, extras });
export const info = (title, lines, tone = 'normal') => ({ t: 'info', title, lines, tone });
export const offers = (list, title, note) => ({ t: 'offers', offers: list, title, note });
