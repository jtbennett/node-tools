import {
  createIdGenerator,
  generateId,
  cleanId,
  validIdPattern,
} from "./base32Id";

const base32IdOfLength12 = /^[abcdefghjkmnpqrtuvwxyz0-9]{12}$/;

describe("createIdGenerator()", () => {
  it("returns a generator function that produces base32Ids", () => {
    const gen = createIdGenerator({
      beginningOfTime: new Date(),
      randomDigits: 1,
    });

    Array(100)
      .fill(0)
      .forEach(() => expect(gen()).toMatch(validIdPattern));
  });

  it("throws when beginningOfTime is in the future", () => {
    expect(() =>
      createIdGenerator({
        beginningOfTime: new Date(Date.now().valueOf() + 1),
        randomDigits: 1,
      }),
    ).toThrow("beginningOfTime");
  });

  it("throws when randomDigits is greater than 10", () => {
    expect(() =>
      createIdGenerator({
        beginningOfTime: new Date(Date.now().valueOf() - 1),
        randomDigits: 11,
      }),
    ).toThrow("randomDigits");
  });

  it("throws when randomDigits is zero or negative", () => {
    expect(() =>
      createIdGenerator({
        beginningOfTime: new Date(Date.now().valueOf() - 1),
        randomDigits: 0,
      }),
    ).toThrow("randomDigits");

    expect(() =>
      createIdGenerator({
        beginningOfTime: new Date(Date.now().valueOf() - 1),
        randomDigits: -1,
      }),
    ).toThrow("randomDigits");
  });
});

describe("generateId()", () => {
  it("returns a base32Id of length 12", () => {
    Array(100)
      .fill(0)
      .forEach(() => {
        const id = generateId();
        expect(id).toMatch(base32IdOfLength12);
      });
  });
});

describe("cleanId()", () => {
  it("converts uppercase letters to lowercase", () => {
    expect(cleanId("aBcDe")).toBe("abcde");
  });

  it("converts letters i, l, o, s to numbers 1, 1, 0, 5", () => {
    expect(cleanId("ilos")).toBe("1105");
    expect(cleanId("0i1l2o3s4")).toBe("011120354");
    expect(cleanId("abcdefghijklmnopqrstuvw")).toBe("abcdefgh1jk1mn0pqr5tuvw");
  });

  it("throws if value has a non-alphanumeric character", () => {
    expect(() => cleanId("a b c d e")).toThrow();
  });

  it("throws if value value is shorter than 2 or longer than 23", () => {
    expect(() => cleanId("")).toThrow();
    expect(() => cleanId("1")).toThrow();
    expect(() => cleanId("012345678901234567890123")).toThrow();
  });

  it("throws if value is not a string", () => {
    [123, new Date(), true, {}, [], null, undefined].forEach((value) => {
      const anyValue: any = value;
      expect(() => cleanId(anyValue)).toThrow();
    });
  });
});
