import type { LogLevel } from "./types";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
  silent: 4,
};

export class Logger {
  private level: number;

  constructor(level: LogLevel = "error") {
    this.level = LEVELS[level];
  }

  debug(msg: string, ...args: unknown[]): void {
    if (this.level <= LEVELS.debug)
      console.debug(`[notiformer] ${msg}`, ...args);
  }

  info(msg: string, ...args: unknown[]): void {
    if (this.level <= LEVELS.info) console.info(`[notiformer] ${msg}`, ...args);
  }

  warn(msg: string, ...args: unknown[]): void {
    if (this.level <= LEVELS.warn) console.warn(`[notiformer] ${msg}`, ...args);
  }

  error(msg: string, ...args: unknown[]): void {
    if (this.level <= LEVELS.error)
      console.error(`[notiformer] ${msg}`, ...args);
  }
}
