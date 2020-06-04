import { DeepPartial } from "ts-essentials";
import { UpdateQuery } from "mongodb";
import * as DataLoader from "dataloader";

import { Document, Meta } from "./Document";
import { Query, QueryResult } from "./Query";
import {
  Repository,
  RepositoryOptions,
  InsertOptions,
  ReplaceOptions,
} from "./Repository";

export interface RepositoryWithLoaderOptions<T extends Document>
  extends RepositoryOptions<T> {
  loaderOptions?: DataLoader.Options<string, T | null>;
}

export class RepositoryWithLoader<
  T extends Document,
  TMeta extends Meta = Meta
> extends Repository<T, TMeta> {
  readonly loader: DataLoader<string, T | null>;

  constructor(options: RepositoryWithLoaderOptions<T>) {
    super(options);
    this.loader = new DataLoader<string, T | null>(
      async (keys: ReadonlyArray<string>) => super.loadMany(keys as any),
      options.loaderOptions,
    );
  }

  async find(query: Query): Promise<QueryResult<T>> {
    const result = await super.find(query);

    if (!query.projection) {
      result.results.forEach((doc) => this.updateLoaderCache(doc.id, doc));
    }

    return result;
  }

  async insert(document: DeepPartial<T>, options: InsertOptions<TMeta> = {}) {
    const doc = await super.insert(document, options);
    this.updateLoaderCache(doc.id, doc);
    return doc;
  }

  async load(id: string): Promise<T | null> {
    return this.loader.load(id);
  }

  async loadMany(ids: string[]): Promise<(T | null)[]> {
    const result = await this.loader.loadMany(ids);

    const error = result.find((doc) => doc instanceof Error);
    if (error) {
      throw error;
    }

    return result as any;
  }

  async replace(
    document: DeepPartial<T> & {
      id: string;
      meta: { updated: Pick<TMeta["updated"], "at"> };
    },
    options: ReplaceOptions<TMeta> = {},
  ) {
    const doc = await super.replace(document, options);
    this.updateLoaderCache(doc.id, doc);
    return doc;
  }

  async delete(id: string, updatedAt: Date | string) {
    await super.delete(id, updatedAt);
    this.updateLoaderCache(id, null);
  }

  async update(id: string, updatedAt: Date | string, patchObj: UpdateQuery<T>) {
    const doc = await super.update(id, updatedAt, patchObj);
    this.updateLoaderCache(doc.id, doc);
    return doc;
  }

  private updateLoaderCache(id: string, doc: T | null) {
    this.loader.clear(id).prime(id, doc);

    if (doc) {
      this.alternateKeys.forEach((key: string | number | symbol) => {
        this.loader.clear(doc[key]).prime(doc[key], doc);
      });
    }
  }
}
