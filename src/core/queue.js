import { Queue } from 'bullmq'
import redis from '../redis/redis.js'

// Aynı redis client’ı BullMQ Queue için kullan
export const robotEventQueue = new Queue('robot-events', {
  connection: redis
})
