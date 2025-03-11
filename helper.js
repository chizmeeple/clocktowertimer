// Character amounts mapping for different player counts
export const characterAmounts = {
  5: [3, 0, 1, 1],
  6: [3, 1, 1, 1],
  7: [5, 0, 1, 1],
  8: [5, 1, 1, 1],
  9: [5, 2, 1, 1],
  10: [7, 0, 2, 1],
  11: [7, 1, 2, 1],
  12: [7, 2, 2, 1],
  13: [9, 0, 3, 1],
  14: [9, 1, 3, 1],
  15: [9, 2, 3, 1],
};

/**
 * Updates the character amounts display in the UI
 * @param {number} playerCount - The number of players (5-15)
 */
export function updateCharacterAmounts(playerCount) {
  const numbersArray = characterAmounts[playerCount];
  document.getElementById('townsfolkAmount').textContent = numbersArray[0];
  document.getElementById('outsiderAmount').textContent = numbersArray[1];
  document.getElementById('minionAmount').textContent = numbersArray[2];
  document.getElementById('demonAmount').textContent = numbersArray[3];
}
