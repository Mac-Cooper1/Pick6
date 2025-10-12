/**
 * Calculate which user should pick for a given pick number in a snake draft
 * @param pickNumber - The current pick number (1-indexed)
 * @param memberCount - Total number of members in the league
 * @returns The index of the user who should pick (0-indexed)
 */
export function getSnakeDraftUserIndex(pickNumber: number, memberCount: number): number {
  const round = Math.ceil(pickNumber / memberCount);
  const positionInRound = ((pickNumber - 1) % memberCount);

  if (round % 2 === 1) {
    // Odd rounds: 1 → N (normal order)
    return positionInRound;
  } else {
    // Even rounds: N → 1 (reverse order)
    return memberCount - 1 - positionInRound;
  }
}

/**
 * Calculate the round number for a given pick
 */
export function getRoundNumber(pickNumber: number, memberCount: number): number {
  return Math.ceil(pickNumber / memberCount);
}
