import { StringKeyedObject } from "./StringKeyedObject";

export const defaultOptions = {
  keysToMask: /secret|api_key|token|password|pw|credential/i,
  uriKey: /url|uri/i,
  mask: "XXXX",
};

export const getLogSanitizer = (options?: {
  keysToMask?: RegExp;
  uriKey?: RegExp;
  mask?: string;
}) => {
  const { keysToMask, uriKey, mask } = { ...defaultOptions, ...options };

  const sanitizeObject = (obj: StringKeyedObject) => {
    let sanitized: StringKeyedObject | undefined;
    Object.keys(obj).forEach((key) => {
      // Winston uses Symbols for internal property names.
      if (typeof key !== "string") {
        return;
      }

      const value = obj[key];
      if (value && value instanceof Error) {
        sanitized = sanitized || { ...obj };
        sanitized[key] = { message: value.message, stack: value.stack };
      } else if (value && value instanceof Object) {
        const newValue = sanitizeObject(value);
        if (newValue !== value) {
          sanitized = sanitized || { ...obj };
          sanitized[key] = newValue;
        }
      } else if (value && typeof value === "string") {
        if (keysToMask.exec(key)) {
          sanitized = sanitized || { ...obj };
          sanitized[key] = mask;
        } else if (
          uriKey.exec(key) &&
          value.indexOf("://") > 0 &&
          value.indexOf("@") > 0
        ) {
          // Can't use URL class, because don't want to throw on invalid URLs.
          // e.g., Mongo connection strings for replicaSets have multiple
          // comma-separated hostnames, which are invalid URLs.
          const credsStart = value.indexOf("://") + 3;
          const credsEnd = value.indexOf("@");
          const pathStart = value.indexOf("/", credsStart);
          const credsLength = credsEnd - credsStart;
          if (credsLength > 0 && (pathStart === -1 || credsEnd < pathStart)) {
            const creds = value.substr(credsStart, credsLength);
            const [, password] = creds.split(":");
            sanitized = sanitized || { ...obj };
            sanitized[key] = sanitized[key].replace(
              `:${password}@`,
              `:${mask}@`,
            );
          }
        }
      }
    });

    // Above, we copy-on-write: sanitized will be null unless a value was changed.
    return sanitized || obj;
  };

  return sanitizeObject;
};
