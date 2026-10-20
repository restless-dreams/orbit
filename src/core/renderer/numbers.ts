/** Numbers as the renderer writes them into the DOM: rounded, so unchanged values compare equal and attributes stay short. */

export const round = (value: number, decimals = 2): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};
