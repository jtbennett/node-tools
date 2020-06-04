export type LogLevel = "error" | "warn" | "info" | "debug";

export type Logger = {
  error: (message: string, meta?: {}) => void;
  warn: (message: string, meta?: {}) => void;
  info: (message: string, meta?: {}) => void;
  debug: (message: string, meta?: {}) => void;
};

export const consoleLogger: Logger = {
  error: console.error.bind(console),
  warn: console.warn.bind(console),
  info: console.info.bind(console),
  debug: console.debug.bind(console),
};

const noop = () => {
  // Do nothing.
};

export const nullLogger: Logger = {
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
};

export const leveledLogger = (level: LogLevel, logger: Logger) => {
  const newLogger: any = { error: logger.error.bind(logger) };

  newLogger.warn =
    level === "warn" || level === "info" || level === "debug"
      ? logger.warn.bind(logger)
      : noop;

  newLogger.info =
    level === "info" || level === "debug" ? logger.info.bind(logger) : noop;

  newLogger.debug = level === "debug" ? logger.debug.bind(logger) : noop;

  return newLogger as Logger;
};
