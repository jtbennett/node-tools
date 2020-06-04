import { deepRemoveNulls } from "./deepRemoveNulls";

describe("deepRemoveNulls()", () => {
  it("removes all null-valued properties", () => {
    const input = {
      foo: null,
      bar: { baz: null, qux: { blah: null } },
      baz: [1, "2", null, 4],
      qux: "null",
    };

    const output = deepRemoveNulls(input);

    expect(output).toMatchObject({
      bar: { qux: {} },
      baz: [1, "2", null, 4],
      qux: "null",
    });
  });

  it("returns the same object if no null removed", () => {
    const input = {
      foo: "x",
      bar: { baz: "x", qux: { blah: "x" } },
      baz: [1, "2", "x", 4],
    };

    const output = deepRemoveNulls(input);

    expect(output).toBe(input);
  });

  it("ignores Symbol keys", () => {
    const foo = Symbol("foo");
    const input = {
      [foo]: null,
    };

    const output = deepRemoveNulls(input);

    expect(output).toBe(input);
  });
});
