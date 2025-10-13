export type LoggerParams = Record<string, unknown>;

export type Logger = {
  debug: (params: LoggerParams, message: string) => void;
  info: (params: LoggerParams, message: string) => void;
  warn: (params: LoggerParams, message: string) => void;
  error: (params: LoggerParams & { error: Error }, message: string) => void;
};

/**
 * Default logger to log to console
 */
export const consoleLogger = (): Logger => ({
  debug: (params, message) => console.debug(message, params), // oxlint-disable-line no-console
  info: (params, message) => console.info(message, params), // oxlint-disable-line no-console
  warn: (params, message) => console.warn(message, params), // oxlint-disable-line no-console
  error: ({ error, ...params }, message) =>
    console.error(message, error, params), // oxlint-disable-line no-console
});

/**
 * To mute internal logs
 */
export const noopLogger = (): Logger => ({
  debug: (_params, _message) => {}, // oxlint-disable-line no-empty-function
  info: (_params, _message) => {}, // oxlint-disable-line no-empty-function
  warn: (_params, _message) => {}, // oxlint-disable-line no-empty-function
  error: (_params, _message) => {}, // oxlint-disable-line no-empty-function
});

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  } else if (typeof error === "string") {
    return new Error(error);
  } else {
    return new Error(JSON.stringify(error));
  }
};

export let logger = consoleLogger();

export const logError: (message: string) => (error: unknown) => void =
  (message: string) => (error: unknown) =>
    logger.error({ error: toError(error) }, message);

export const setLogger = (newLogger: Logger): void => {
  logger = newLogger;
};
