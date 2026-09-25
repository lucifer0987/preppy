#!/usr/bin/env tsx
/** Prints a random secret, for CRON_SECRET. */
import { randomBytes } from 'node:crypto'
console.log(randomBytes(24).toString('hex'))
