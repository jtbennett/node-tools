// WARNING: ONCE USED TO GENERATE IDS, THE VALUES OF beginningOfTime AND randomDigits
//          MUST NEVER BE CHANGED. USING A LATER DATE OR FEWER RANDOM DIGITS
//          COULD RESULT IN DUPLICATE IDS.

// A base32Id is an alphanumeric string.
// Id values do not include the letters ilos, because they are easily mistaken
// for the numbers 0, 1, and 5). The letters wxyz are used instead.

// Each value is composed of two numbers, each converted to base32 as described below:
// - The number of milliseconds since beginningOfTime.
// - A random value to reduce conflicts for IDs generated in the same millisecond.

// num.toString(32) produces base32-encoded values using 0-9 and a-v (first 22 letters).
// To get monotonically increasing values, we can't just replace those 4 letters.
// We have to replace all letters after i.
// 0123456789abcdefghijklmnopqrstuv in the original are mapped to:
// 0123456789abcdefghjkmnpqrtuvwxyz in the id.

// The default generator - nextId() - returns 12-character id values.
// - 8-characters for milliseconds. To get a value of that length, we set the
//   beginning of time to a value a little more than 32^7 milliseconds (~398 days)
//   before we are generating the first id).
//   This will produce 8-character values until we hit 32^8ms, or ~35 years
//   from beginningOfTime, when it will increase to 9-character values.
// - 4-characters of randomness. 32^4 gives us a random number from 0 to ~1 million.

// WARNING: THESE VALUES MUST NEVER BE CHANGED. USING A LATER DATE OR
//          FEWER RANDOM DIGITS COULD RESULT IN DUPLICATE IDS.
// These options will produce a 12-digit id until the year 3131.
const defaultOptions = {
  beginningOfTime: new Date("2016-12-02T18:00:00Z"),
  randomDigits: 4,
};

const replaceOnGenerate: { [key: string]: string } = {
  i: "j",
  j: "k",
  k: "m",
  l: "n",
  m: "p",
  n: "q",
  o: "r",
  p: "t",
  q: "u",
  r: "v",
  s: "w",
  t: "x",
  u: "y",
  v: "z",
};

// In the opposite direction, humans may see a 1, 0 or 5 as I, l, O or S.
const replaceOnClean: { [key: string]: string } = {
  i: "1",
  l: "1",
  o: "0",
  s: "5",
};

export const createIdGenerator = (options: {
  beginningOfTime?: Date;
  randomDigits?: number;
}) => {
  const { beginningOfTime, randomDigits } = { ...defaultOptions, ...options };

  if (beginningOfTime.valueOf() > Date.now()) {
    throw new Error('Value of "beginningOfTime" must be in the past.');
  }

  if (
    beginningOfTime.valueOf() < new Date("1970-01-01T00:00:00.000Z").valueOf()
  ) {
    throw new Error(
      'Value of "beginningOfTime" must be on or after 1970-01-01.',
    );
  }

  if (randomDigits < 1 || 10 < randomDigits) {
    throw new Error(
      'Value of "randomDigits" must be between 1 and 10 (inclusive).',
    );
  }
  const beginningOfTimeValue = beginningOfTime.valueOf();
  const maxRandomValue = Math.pow(2, 5 * randomDigits);

  return () => {
    const milliseconds = Date.now().valueOf() - beginningOfTimeValue;
    const timestamp = milliseconds.toString(32);
    const randomSuffix =
      randomDigits > 0
        ? Math.floor(Math.random() * maxRandomValue)
            .toString(32)
            .padStart(randomDigits, "0")
        : "";

    const id = (timestamp + randomSuffix).replace(
      /[ijklmnopqrstuv]/g,
      (match) => replaceOnGenerate[match],
    );

    return id;
  };
};

export const generateId = createIdGenerator(defaultOptions);

// Max randomDigits is 10.
// Timestamp portion will be <=13 characters until roughly the year 2985.
export const validIdPattern = /^[abcdefghjkmnpqrtuvwxyz0-9]{2,23}$/i;

export const isValidId = (id: string) => {
  return validIdPattern.exec(id);
};

// In a human-entered id, we replace the confusing letters
// with the values they were probably intended to be.
export const cleanId = (id: string) => {
  if (id.length < 2 || 23 < id.length) {
    throw new Error("Id must be between 2 and 23 alphanumeric characters.");
  }

  const cleanedId = id
    .toLowerCase()
    .replace(/[ilos]/g, (match) => replaceOnClean[match]);

  if (!isValidId(cleanedId)) {
    throw new Error("Invalid id.");
  }

  return cleanedId;
};
