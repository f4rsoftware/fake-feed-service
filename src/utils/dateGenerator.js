import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { loadRules } from "../config/rules.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let holidays = []

function loadHolidays() {
  if (holidays.length === 0) {
    const filePath = path.join(__dirname, "../config/holidays.json")
    const data = fs.readFileSync(filePath, "utf-8")
    holidays = JSON.parse(data)
  }
  return holidays
}

/**
 * Rastgele görev tarihi üretir.
 * - Min: TaskRules.dateRangeDays.min
 * - Max: TaskRules.dateRangeDays.max
 * - Hafta sonu / tatil kontrolü TaskRules’a göre yapılır
 * Format: YYYY-MM-DD
 */
export function getRandomTaskDate() {
  const rules = loadRules()
  const taskRules = rules.TaskRules
  const now = new Date()
  const holidayList = loadHolidays()

  while (true) {
    const dayOffset =
      taskRules.dateRangeDays.min +
      Math.floor(
        Math.random() *
          (taskRules.dateRangeDays.max - taskRules.dateRangeDays.min + 1)
      )

    const taskDate = new Date(now)
    taskDate.setDate(now.getDate() + dayOffset)

    const isoDate = taskDate.toISOString().split("T")[0]

    const dayOfWeek = taskDate.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isHoliday = holidayList.includes(isoDate)

    if (taskRules.excludeWeekends && isWeekend) continue
    if (taskRules.excludeHolidays && isHoliday) continue

    return isoDate
  }
}

/**
 * Rastgele görev saati üretir.
 * - TaskRules.workingHours.start ~ TaskRules.workingHours.end
 * Format: HH:mm:ssZ
 */
export function getRandomTaskTime() {
  const rules = loadRules()
  const taskRules = rules.TaskRules
  const startHour = taskRules.workingHours.start
  const endHour = taskRules.workingHours.end

  // endHour dahil edilmesin diye (örn: 9–17 → 09:00–16:59 arası)
  const hour =
    startHour + Math.floor(Math.random() * (endHour - startHour))
  const minute = Math.floor(Math.random() * 60)
  const second = Math.floor(Math.random() * 60)

  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}:${second.toString().padStart(2, "0")}Z`
}

/**
 * Rastgele mesai günü + saat döndürür
 * @returns {{date: string, time: string}}
 */
export function getRandomWorkingDateTime() {
  const date = getRandomTaskDate()
  const time = getRandomTaskTime()
  return { date, time }
}
