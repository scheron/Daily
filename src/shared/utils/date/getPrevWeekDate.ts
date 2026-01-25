import {DateTime} from "luxon"

import type {ISODate} from "../../types/common"

/**
 * Gets the previous week's date from the given date
 * @param {ISODate} currentDate - The current date
 * @returns {ISODate} The date from the previous week
 */
export function getPrevWeekDate(currentDate: ISODate): ISODate {
  return DateTime.fromISO(currentDate).minus({weeks: 1}).toISODate()!
}
