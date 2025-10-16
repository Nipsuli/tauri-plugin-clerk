import { Clerk } from "@clerk/clerk-js";
import { ClerkOptions } from "@clerk/types";

//#region guest-js/logger.d.ts
type LoggerParams = Record<string, unknown>;
type Logger = {
  debug: (params: LoggerParams, message: string) => void;
  info: (params: LoggerParams, message: string) => void;
  warn: (params: LoggerParams, message: string) => void;
  error: (params: LoggerParams & {
    error: Error;
  }, message: string) => void;
};
/**
 * Default logger to log to console
 */
declare const consoleLogger: () => Logger;
/**
 * To mute internal logs
 */
declare const noopLogger: () => Logger;
//#endregion
//#region guest-js/index.d.ts
declare const initClerk: (initArgs?: ClerkOptions, intLogger?: Logger) => Promise<Clerk>;
//#endregion
export { type Logger, type LoggerParams, consoleLogger, initClerk, noopLogger };