import { Document } from "./Document";
import { MongoWrapper } from "./MongoWrapper";
import { RepositoryOptions, Repository } from "./Repository";
import { RepositoryWithLoader } from "./RepositoryWithLoader";

export const getRepository = <T extends Document>(
  options: Omit<RepositoryOptions<T>, "collection"> & {
    mongo: MongoWrapper;
    dbName: string;
    collectionName: string;
    withLoader?: boolean;
  },
): Repository<T> => {
  const { mongo, dbName, collectionName, withLoader, ...rest } = options;

  const repoOptions = {
    collection: mongo.client.db(dbName).collection<T>(collectionName),
    loaderOptions: { maxBatchSize: 1024 },
    ...rest,
  };

  const repo = withLoader
    ? new RepositoryWithLoader<T>(repoOptions)
    : new Repository<T>(repoOptions);

  return repo;
};
