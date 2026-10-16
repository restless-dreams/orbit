/**
 * "Did you mean …?" for keys and values a document misspells: a known
 * synonym (`colour` for `color`, `dark` for `night`), or the closest known name
 * within a couple of typos, ignoring case.
 */
export const suggest = (input: string, candidates: readonly string[], synonyms: Readonly<Record<string, string>> = {}): string | undefined => {
  const lowered = input.toLowerCase();
  const synonym = Object.entries(synonyms).find(([word]) => word.toLowerCase() === lowered)?.[1];

  if (synonym !== undefined) {
    return synonym;
  }

  const allowed = Math.min(2, Math.max(1, Math.floor(input.length / 3)));
  let best: string | undefined;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const distance = editDistance(lowered, candidate.toLowerCase());

    if (distance <= allowed && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
};

/** " Did you mean "x"?" when there is a suggestion, otherwise nothing. */
export const didYouMean = (input: string, candidates: readonly string[], synonyms?: Readonly<Record<string, string>>): string => {
  const suggestion = suggest(input, candidates, synonyms);
  return suggestion === undefined ? '' : ` Did you mean "${suggestion}"?`;
};

/** Edits (insertions, deletions, substitutions and swaps of neighbors) between two words. */
const editDistance = (first: string, second: string): number => {
  const rows = first.length + 1;
  const columns = second.length + 1;
  const table: number[][] = Array.from({ length: rows }, (_, row) => Array.from({ length: columns }, (_, column) => (row === 0 ? column : column === 0 ? row : 0)));

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const cost = first[row - 1] === second[column - 1] ? 0 : 1;
      table[row][column] = Math.min(table[row - 1][column] + 1, table[row][column - 1] + 1, table[row - 1][column - 1] + cost);

      if (row > 1 && column > 1 && first[row - 1] === second[column - 2] && first[row - 2] === second[column - 1]) {
        table[row][column] = Math.min(table[row][column], table[row - 2][column - 2] + 1);
      }
    }
  }

  return table[first.length][second.length];
};
