import { getLogSanitizer } from "./getLogSanitizer";

describe("deepRemoveNulls", () => {
  describe("default sanitizer", () => {
    const sanitize = getLogSanitizer();
    it("masks values of keys matching /secret|api_key|token|password|pw|credential/i", () => {
      const input = {
        foo: "foo",
        secret: "secret",
        shortSecret: "a",
        // eslint-disable-next-line @typescript-eslint/camelcase
        an_api_key: "secret",
        nested: {
          foo: "foo",
          atoken: "secret",
          passwordValue: "secret",
          nested: { foo: "foo", fooPw: "secret", credentials: "secret" },
        },
      };

      const expected = {
        foo: "foo",
        secret: "XXXX",
        shortSecret: "XXXX",
        // eslint-disable-next-line @typescript-eslint/camelcase
        an_api_key: "XXXX",
        nested: {
          foo: "foo",
          atoken: "XXXX",
          passwordValue: "XXXX",
          nested: { foo: "foo", fooPw: "XXXX", credentials: "XXXX" },
        },
      };

      expect(sanitize(input)).toMatchObject(expected);
    });

    it("masks credentials in URLs", () => {
      const input = {
        aUrl: "http://foo.com",
        aUri: "https://a:b@foo.com",
        anotherUri: "https://a:b@foo.com",
      };

      const expected = {
        aUrl: "http://foo.com",
        aUri: "https://a:XXXX@foo.com",
        anotherUri: "https://a:XXXX@foo.com",
      };

      expect(sanitize(input)).toMatchObject(expected);
    });

    it("converts Error objects to message and stack", () => {
      const input = { error: new Error("foo") };
      const expected = { error: { message: "foo" } };

      expect(sanitize(input)).toMatchObject(expected);
    });

    it("returns the same object if no secrets masked", () => {
      const input = { foo: "foo", bar: "bar" };
      expect(sanitize(input)).toBe(input);
    });
  });
});
