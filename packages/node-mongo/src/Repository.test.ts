import * as moment from "moment";

import {
  createMongoWrapper,
  deleteTestDb,
  mockAllFunctions,
  generateTestDbName,
} from "./jest/testHelpers";
import { generateId, nullLogger } from "@jtbennett/node-utils";

import { Document } from "./Document";
import { getRepository } from "./getRepository";
import { MongoWrapper } from "./MongoWrapper";
import { RepositoryOptions } from "./Repository";

interface Foo extends Document {
  aString: string;
  aDate: Date | string;
}

const idsFromSequence = (ids: string[]) => {
  let index = 0;
  return () => ids[index++];
};

const dbName = generateTestDbName("repository");

const getFoosRepo = async (
  mongo: MongoWrapper,
  options?: Partial<RepositoryOptions<Foo>>,
) => {
  const repo = getRepository<Foo>({
    mongo,
    logger: mockAllFunctions(nullLogger),
    dbName,
    collectionName: "foos",
    docType: "foo",
    userId: "aUser",
    nextId: generateId,
    ...options,
  });
  await repo.collection.deleteMany({});
  return repo;
};

describe("Repository", () => {
  let mongo: MongoWrapper;

  beforeAll(async () => {
    mongo = await createMongoWrapper();
  });

  afterAll(async () => {
    await deleteTestDb(mongo, dbName);
  });

  describe("insert()", () => {
    it("Adds id and meta", async () => {
      const repo = await getFoosRepo(mongo);
      const foo = await repo.insert({ aString: "foo", aDate: "bar" });

      expect(foo.id).toBeDefined();

      expect(foo.meta.created.at).toBeInstanceOf(Date);
      expect(moment.utc(foo.meta.created.at).isValid()).toBe(true);
      expect(foo.meta.created.by).toBe("aUser");

      expect(foo.meta.updated.at).toBeInstanceOf(Date);
      expect(moment.utc(foo.meta.updated.at).isValid()).toBe(true);
      expect(foo.meta.updated.by).toBe("aUser");
    });

    describe("When specifying an id that already exists", () => {
      it("Throws an error", async () => {
        const repo = await getFoosRepo(mongo);
        await repo.insert({ aString: "foo", aDate: "bar" }, { id: "foo" });

        expect(
          repo.insert({ aString: "foo", aDate: "bar" }, { id: "foo" }),
        ).rejects.toThrow();
      });
    });

    describe("When a duplicate id is returned from nextId()", () => {
      it("Retries with a new id", async () => {
        const repo = await getFoosRepo(mongo, {
          nextId: idsFromSequence(["xxx", "yyy"]),
        });

        await repo.insert({ aString: "foo", aDate: "bar" }, { id: "xxx" });
        const yyy = await repo.insert({ aString: "foo", aDate: "bar" });

        expect(yyy.id).toBe("yyy");
      });

      describe("And retry id is also a duplicate", () => {
        it("Throws an error", async () => {
          const repo = await getFoosRepo(mongo, {
            nextId: idsFromSequence(["xxx", "xxx"]),
          });

          await repo.insert({ aString: "foo", aDate: "bar" }, { id: "xxx" });
          expect(
            repo.insert({ aString: "foo", aDate: "bar" }),
          ).rejects.toThrow();
        });
      });
    });

    // normalizes for save
    // normalizes for load
    // validates
    // allows setting id and meta through options
  });

  describe("stream()", () => {
    // iterates through the end
    // respects batchSize
    // batchSize <1 throws
    // makes one db request per batch
  });

  describe("find()", () => {
    // skip/limit/total
    // sort
    // match
    // projection
    // normalizes for load
  });

  describe("load()", () => {
    // returns one
    // returns null
  });

  describe("loadMany()", () => {
    // returns array
    // returns nulls in array
    // throws if >1024 ids
  });

  describe("replace()", () => {
    // replaces whole doc
    // sets updated.at
    // concurrency error
    // validates
    // normalizes for save
    // normalizes for load
    // set meta values in options
    // options can't override docType, created, updated
  });

  describe("delete()", () => {
    // deletes one
    // throws if concurrency
    // throws if not found
  });

  describe("update()", () => {
    // updates specified properties
    // sets updated.at
    // leaves other properties alone
    // doesn't allow patching id or meta
    // throws if concurrency
    // throws if not found
  });
});
