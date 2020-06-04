import { generateId, consoleLogger } from "@jtbennett/node-utils/src";

import { MongoWrapper } from "../MongoWrapper";

export const mockAllFunctions = <T extends { [key: string]: any }>(
  obj: T,
  deep = false,
) => {
  const mocked = { ...obj };

  for (const key in mocked) {
    if (Object.prototype.hasOwnProperty.call(mocked, key)) {
      if (typeof mocked[key] === "function") {
        mocked[key] = jest.fn() as any;
      } else if (typeof mocked[key] === "object" && deep) {
        mockAllFunctions(mocked[key], deep);
      }
    }
  }

  return mocked;
};

export const mockLogger = mockAllFunctions(consoleLogger);

export const generateTestDbName = (name: string) =>
  `jest-run-${name}-${generateId()}`;

export const createMongoWrapper = async () =>
  new MongoWrapper({
    connectionString: "mongodb://localhost:27027/",
    clientOptions: { appname: "jest-run" },
    logger: mockLogger,
  }).initialize();

export const deleteTestDb = async (mongo: MongoWrapper, dbName: string) => {
  if (!dbName.startsWith("jest-run-")) {
    throw new Error(
      `Cannot delete database because dbName does not start with "jest-run-". dbName: ${dbName}`,
    );
  }
  await mongo.client.db(dbName).dropDatabase();
  await mongo.client.close();
};
