const padZero = (v: number): string => String(v).padStart(2, "0")

/**
 * Converts seconds to an object with formatted time components.
 * @param {number} sec - The number of seconds.
 * @returns {object} An object with the time components: hours, minutes, and seconds.
 */
export function secondsToTime(sec: number): {HH: string; mm: string; ss: string} {
  const hours = Math.floor(Math.round(sec) / 3600)
  const minutes = Math.floor((Math.round(sec) % 3600) / 60)
  const seconds = Math.ceil((Math.round(sec) % 3600) % 60)

  return {
    HH: padZero(hours),
    mm: padZero(minutes),
    ss: padZero(seconds),
  }
}
