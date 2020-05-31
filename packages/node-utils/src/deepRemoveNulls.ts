import { DeepNonNullable } from "ts-essentials";

import { StringKeyedObject } from "./StringKeyedObject";

export const deepRemoveNulls = (
  input: StringKeyedObject,
): DeepNonNullable<StringKeyedObject> => {
  let output: StringKeyedObject | undefined;
  Object.keys(input).forEach((key) => {
    if (typeof key !== "string") {
      return;
    }

    const value = input[key];
    if (value === null) {
      output = output || { ...input };
      delete output[key];
    } else if (value && Array.isArray(value)) {
      return;
    } else if (value && value instanceof Object) {
      const newValue = deepRemoveNulls(value);
      if (newValue !== value) {
        output = output || { ...input };
        output[key] = newValue;
      }
    }
  });

  // Above, we copy-on-write: out will be undefined unless a value was changed.
  return (output || input) as any;
};
