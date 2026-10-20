/**
 * Other apps' icons and markers, as Orbit says the same thing: an emoji for
 * the idea's icon, a priority, or a status. An icon with no meaning here
 * returns null, and the reader warns that it was left out.
 */

export type IconMeaning = { icon: string } | { priority: number } | { status: string };

/** FreeMind's and Freeplane's built-in icons, by name. */
const FREEMIND_ICONS = new Map<string, string>(Object.entries({
  idea: '💡', help: '❓', yes: '❗', messagebox_warning: '⚠️', info: 'ℹ️', 'stop-sign': '🛑', closed: '⛔',
  button_ok: '✅', button_cancel: '❌', stop: '🔴', prepare: '🟡', go: '🟢',
  back: '⬅️', forward: '➡️', up: '⬆️', down: '⬇️', attach: '📎', ksmiletris: '🙂', 'smiley-neutral': '😐', 'smiley-oh': '😮',
  'smiley-angry': '😠', smily_bad: '😞', clanbomber: '💣', desktop_new: '📌', flag: '🚩', 'flag-black': '🏴', 'flag-blue': '🚩',
  'flag-green': '🚩', 'flag-orange': '🚩', 'flag-pink': '🚩', 'flag-yellow': '🚩', gohome: '🏠', folder: '📁', korn: '📫', Mail: '✉️',
  kmail: '📧', list: '📋', edit: '✏️', pencil: '✏️', kaddressbook: '☎️', knotify: '🎵', password: '🔑', encrypted: '🔒', decrypted: '🔓',
  wizard: '🪄', xmag: '🔍', bell: '🔔', bookmark: '🔖', penguin: '🐧', licq: '🌸', freemind_butterfly: '🦋', 'broken-line': '💔',
  calendar: '📅', clock: '⏰', hourglass: '⏳', launch: '🚀', family: '👪', female1: '👩', female2: '👩', male1: '👨', male2: '👨',
  fema: '👫', group: '👥', bee: '🐝', mindmap: '🗺️', unchecked: '⬜', checked: '✅',
}));

/** Freeplane's progress icons, as statuses. */
const FREEMIND_PROGRESS = new Map<string, string>(Object.entries({ '0%': 'todo', '25%': 'active', '50%': 'active', '75%': 'active', '100%': 'done', checked: 'done', unchecked: 'todo' }));

/** A FreeMind or Freeplane icon's meaning: `full-3` is priority 3, `100%` done, `emoji-1F680` 🚀. */
export const freeMindIcon = (name: string): IconMeaning | null => {
  const priority = /^full-(\d)$/.exec(name);

  if (priority) {
    return { priority: Number(priority[1]) };
  }

  const progress = FREEMIND_PROGRESS.get(name);

  if (progress) {
    return { status: progress };
  }

  const emoji = /^emoji-([0-9A-Fa-f]{2,6}(?:-[0-9A-Fa-f]{2,6})*)$/.exec(name);

  if (emoji) {
    const codes = emoji[1].split('-').map((code) => parseInt(code, 16));

    if (codes.every((code) => code > 0 && code <= 0x10ffff)) {
      return { icon: String.fromCodePoint(...codes) };
    }
  }

  const icon = FREEMIND_ICONS.get(name);
  return icon ? { icon } : null;
};

/** XMind's markers, by the name after their family: `smiley-laugh`, `arrow-up`. */
const XMIND_MARKERS = new Map<string, string>(Object.entries({
  'smiley-smile': '🙂', 'smiley-laugh': '😄', 'smiley-angry': '😠', 'smiley-cry': '😢', 'smiley-surprise': '😮', 'smiley-boring': '😐',
  'arrow-up': '⬆️', 'arrow-down': '⬇️', 'arrow-left': '⬅️', 'arrow-right': '➡️', 'arrow-up-right': '↗️', 'arrow-down-right': '↘️',
  'arrow-down-left': '↙️', 'arrow-up-left': '↖️', 'arrow-refresh': '🔄',
  'symbol-plus': '➕', 'symbol-minus': '➖', 'symbol-question': '❓', 'symbol-exclam': '❗', 'symbol-info': 'ℹ️', 'symbol-wrong': '❌',
  'symbol-right': '✅', 'symbol-attention': '⚠️', 'symbol-code': '💻', 'symbol-pin': '📌', 'symbol-heart': '❤️', 'symbol-star': '⭐',
  'other-calendar': '📅', 'other-email': '✉️', 'other-phone': '☎️', 'other-question': '❓', 'other-exclam': '❗', 'other-lightbulb': '💡',
  'other-clock': '⏰', 'other-people': '👥', 'other-money': '💰', 'other-books': '📚', 'other-music': '🎵', 'other-yes': '👍', 'other-no': '👎',
  'other-hourglass': '⏳', 'other-flag': '🚩', 'other-star': '⭐', 'other-coffee-cup': '☕', 'other-bomb': '💣', 'other-mic': '🎤',
  'other-phone-call': '📞', 'other-map': '🗺️', 'other-code': '💻', 'other-search': '🔍', 'other-dollar': '💵', 'other-heart': '❤️',
  c_symbol_like: '👍', c_symbol_dislike: '👎', c_symbol_heart: '❤️', c_symbol_star: '⭐', c_symbol_question: '❓', c_symbol_exclam: '❗',
  c_symbol_pin: '📌', c_symbol_idea: '💡', c_symbol_check: '✅', c_symbol_cross: '❌', c_symbol_fire: '🔥', c_symbol_trophy: '🏆',
}));

/** Marker families whose every color shows the same emoji. */
const XMIND_FAMILIES = new Map<string, string>(Object.entries({
  flag: '🚩', star: '⭐', people: '👤', tag: '🏷️', month: '📅', week: '📅', 'half-star': '⭐',
}));

const XMIND_TASKS = new Map<string, string>(Object.entries({
  'task-start': 'todo', 'task-oct': 'active', 'task-quarter': 'active', 'task-3oct': 'active', 'task-half': 'active', 'task-5oct': 'active',
  'task-3quar': 'active', 'task-7oct': 'active', 'task-done': 'done', 'task-pause': 'paused',
}));

/** An XMind marker's meaning: `priority-2` is priority 2, `task-done` done, `flag-red` 🚩. */
export const xmindMarker = (markerId: string): IconMeaning | null => {
  const priority = /^priority-(\d)$/.exec(markerId);

  if (priority) {
    return { priority: Number(priority[1]) };
  }

  const status = XMIND_TASKS.get(markerId);

  if (status) {
    return { status };
  }

  const icon = XMIND_MARKERS.get(markerId);

  if (icon) {
    return { icon };
  }

  const family = [...XMIND_FAMILIES.keys()].sort((first, second) => second.length - first.length).find((name) => markerId.startsWith(`${name}-`));
  return family ? { icon: XMIND_FAMILIES.get(family) as string } : null;
};
