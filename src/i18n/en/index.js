// 英語の辞書をまとめる（キー：日本語の元の文、値：英語）
import names from './names.js';
import ui from './ui.js';
import game from './game.js';
import story from './story.js';

export const EN = { ...names, ...ui, ...game, ...story };
