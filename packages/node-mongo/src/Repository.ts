import { DeepPartial, PickProperties } from "ts-essentials";
import { UpdateQuery, Collection, InsertOneWriteOpResult } from "mongodb";
import { cloneDeep } from "lodash";
import * as moment from "moment";

import { Logger } from "@jtbennett/node-utils";

import { Document, Meta, New } from "./Document";
import { Query, QueryResult } from "./Query";

const MAX_STREAM_LIMIT = Math.pow(2, 31);

export interface InsertOptions<TMeta extends Meta> {
  id?: string;
  meta?: Partial<Omit<TMeta, keyof Meta>>;
}

export interface ReplaceOptions<TMeta> {
  meta?: Partial<Omit<TMeta, keyof Meta>>;
}

type AlternateKey<T extends Document> = Extract<
  keyof PickProperties<New<T>, string>,
  string
>;

export type Normalizer<T extends Document> = (doc: DeepPartial<T>) => void;
export type Validator<T extends Document> = (doc: DeepPartial<T>) => void;

export const deleteUnderscoreId = <T extends Document>(doc: DeepPartial<T>) => {
  delete (doc as any)._id;
};

export interface RepositoryOptions<T extends Document> {
  docType: string;
  collection: Collection<T>;
  nextId: () => string;
  alternateKeys?: AlternateKey<T>[];
  normalizers?: {
    forSave?: Normalizer<T>[];
    forLoad?: Normalizer<T>[];
  };
  validators?: Validator<T>[];
  logger?: Logger;
  userId: string;
}

export class Repository<T extends Document, TMeta extends Meta = Meta>
  implements RepositoryOptions<T> {
  readonly docType!: string;
  readonly collection!: Collection<T>;
  readonly nextId!: () => string;
  readonly alternateKeys!: AlternateKey<T>[];
  readonly normalizers!: {
    readonly forSave: Normalizer<T>[];
    readonly forLoad: Normalizer<T>[];
  };
  readonly validators!: Validator<T>[];
  readonly logger!: Logger;
  readonly userId!: string;

  constructor(options: RepositoryOptions<T>) {
    options.alternateKeys = options.alternateKeys || [];
    options.normalizers = {
      forSave: options.normalizers?.forSave || [],
      forLoad: [deleteUnderscoreId, ...(options.normalizers?.forLoad || [])],
    };
    options.validators = options.validators || [];
    options.logger = options.logger || console;

    Object.assign(this, options);
  }

  async *stream(query: Query, batchSize = 10000) {
    if (!!query.limit && query.limit < 1) {
      throw new Error("query.limit must be at least 1");
    }

    if (batchSize < 1) {
      throw new Error("batchSize must be at least 1");
    }

    const maxToReturn = query.limit ? query.limit : MAX_STREAM_LIMIT;

    const batchQuery = cloneDeep(query);
    batchQuery.skip = Math.max(0, query.skip || 0);
    batchQuery.limit = Math.min(maxToReturn, batchSize);

    let batch: QueryResult<T>;
    let returned = 0;
    do {
      batch = await this.find(batchQuery);

      if (batch.results.length > 0) {
        if (returned + batch.results.length <= maxToReturn) {
          yield* batch.results;
          returned += batch.results.length;
        } else {
          yield* batch.results.slice(0, maxToReturn - returned);
          returned = maxToReturn;
        }
      }

      batchQuery.skip = batchQuery.skip + batchQuery.limit;
    } while (
      batch.results.length === batchQuery.limit &&
      returned < maxToReturn
    );
  }

  async find(query: Query): Promise<QueryResult<T>> {
    const pipeline = this.getFindPipeline(query);

    const agg = await this.collection.aggregate<any>(pipeline).toArray();
    const total = agg[0].total.length === 1 ? agg[0].total[0].total : 0;
    const results = agg[0].data;

    if (!query.projection) {
      const normalize = this.normalizeForLoad.bind(this);
      results.forEach(normalize, this);
    }

    this.logger.debug("Repository.find", {
      docType: this.docType,
      query,
      total,
    });

    return { query, total, results };
  }

  async insert(document: DeepPartial<T>, options: InsertOptions<TMeta> = {}) {
    if (document.id) {
      throw new Error(
        "Supplying a value for document.id is not allowed with Repository.insert(). " +
          "Use the options parameter to insert a new document with a predetermined id.",
      );
    }

    if (document.meta) {
      throw new Error(
        "Supplying a value for document.meta is not allowed with Repository.insert(). " +
          "Use the options parameter to insert a new document with a meta object.",
      );
    }

    const clonedDoc = cloneDeep(document);
    this.normalizeForSave(clonedDoc);
    this.validate(clonedDoc);

    const newDoc = clonedDoc as T;

    const newId = options.id || this.nextId();
    (newDoc as any)._id = newId;
    newDoc.id = newId;

    const now = moment.utc().toDate();
    newDoc.meta = {
      ...options.meta,
      docType: this.docType,
      created: { at: now, by: this.userId },
      updated: { at: now, by: this.userId },
    };

    let result: InsertOneWriteOpResult<any> = undefined as any;

    try {
      result = await this.collection.insertOne(newDoc as any);
    } catch (err) {
      // 11000 = Mongo duplicate _id error.
      if (err.code !== 11000 || options.id) {
        throw err;
      }

      this.logger.warn("Duplicate key error. Retrying insertOne().", {
        message: err.message,
      });
      const retryId = this.nextId();
      if (retryId !== newId) {
        (newDoc as any)._id = retryId;
        newDoc.id = retryId;
        result = await this.collection.insertOne(newDoc as any);
      }
    }

    this.logger.debug("Repository.create", { docType: this.docType, document });

    if (result.insertedCount === 1) {
      this.normalizeForLoad(newDoc as any);
      return newDoc;
    } else {
      throw new Error("An unknown error occurred inserting the document.");
    }
  }

  async load(id: string): Promise<T | null> {
    const result = await this.loadMany([id]);
    return result[0];
  }

  async loadMany(ids: string[]) {
    if (!ids || ids.length === 0) {
      return [];
    }

    if (ids.length > 1024) {
      throw new Error("Cannot load more than 1024 documents at once.");
    }

    let match: any = { _id: { $in: ids } };
    if (this.alternateKeys.length > 0) {
      match = { $or: [match] };
      this.alternateKeys.forEach((key) => {
        match.$or.push({ [key]: { $in: ids } });
      });
    }

    const find = await this.find({ match });

    // An array of same length as ids. Each doc has the same index as its id.
    // Missing docs are included in the array as null values.
    return ids.map(
      (id) =>
        find.results.find((doc) => {
          return (
            doc.id === id ||
            this.alternateKeys.some((key: string) => doc[key] === id)
          );
        }) || null,
    );
  }

  async replace(
    document: DeepPartial<T> & {
      id: string;
      meta: { updated: Pick<TMeta["updated"], "at"> };
    },
    options: ReplaceOptions<TMeta> = {},
  ) {
    const originalUpdatedAt = moment.utc(document.meta.updated.at).toDate();
    const existing = await this.loadCurrentVersionOrThrow(
      "Replace",
      document.id,
      originalUpdatedAt,
    );

    const clonedDoc: any = cloneDeep(document);
    this.normalizeForSave(clonedDoc);
    this.validate(clonedDoc);

    clonedDoc.meta = {
      ...existing.meta,
      ...options.meta,
      docType: existing.meta.docType,
      created: existing.meta.created,
      updated: { at: moment.utc().toDate(), by: this.userId },
    };

    const newDoc: T = clonedDoc;

    const result = await this.collection.replaceOne(
      {
        _id: document.id,
        "meta.docType": this.docType,
        "meta.updated.at": originalUpdatedAt,
      } as any,
      newDoc,
    );

    if (!result || result.modifiedCount !== 1) {
      this.throwError("Replace", newDoc.id, newDoc.meta.updated.at);
    }

    this.normalizeForLoad(newDoc as any);

    this.logger.debug("Repository.replace", { docType: this.docType, newDoc });

    return newDoc;
  }

  async delete(id: string, updatedAt: Date | string) {
    const originalUpdatedAt = moment.utc(updatedAt).toDate();

    const result = await this.collection.findOneAndDelete({
      _id: id,
      "meta.docType": this.docType,
      "meta.updated.at": originalUpdatedAt,
    } as any);

    if (!result || result.ok !== 1 || !result.value) {
      this.throwError("Delete", id, originalUpdatedAt);
    }

    this.logger.debug("Repository.delete", { docType: this.docType, id });
  }

  async update(
    id: string,
    updatedAt: Date | string,
    updateObj: UpdateQuery<T>,
  ) {
    // Don't allow modification of id or meta values.
    Object.keys(updateObj).forEach((op) =>
      Object.keys(updateObj[op]).forEach((fieldName) => {
        if (
          fieldName === "_id" ||
          fieldName === "id" ||
          fieldName.startsWith("meta")
        ) {
          throw new Error(`The value of "${fieldName}" cannot be updated.`);
        }
      }),
    );

    return this.updateInternal(id, updatedAt, updateObj);
  }

  normalizeForSave(document: DeepPartial<T>) {
    this.normalizers.forSave.forEach((fn) => fn(document));
  }

  normalizeForLoad(document: DeepPartial<T>) {
    this.normalizers.forLoad.forEach((fn) => fn(document));
  }

  private async updateInternal(
    id: string,
    updatedAt: Date | string,
    updateObj: UpdateQuery<T>,
  ) {
    const originalUpdatedAt = moment.utc(updatedAt).toDate();

    updateObj.$set = {
      ...updateObj.$set,
      "meta.updated": { at: moment.utc().toDate(), by: this.userId },
    } as any;

    const result = await this.collection.findOneAndUpdate(
      {
        _id: id,
        "meta.docType": this.docType,
        "meta.updated.at": originalUpdatedAt,
      } as any,
      updateObj,
      { returnOriginal: false }, // Causes result.value to be the updated doc.
    );

    if (!result || result.ok !== 1 || !result.value) {
      this.throwError("Patch", id, originalUpdatedAt);
    }

    this.normalizeForLoad(result.value as any);

    this.logger.debug("Repository.patchInternal", {
      docType: this.docType,
      document: result.value!,
    });

    return result.value as T;
  }

  private getFindPipeline(query: Query) {
    const projection = query.projection
      ? { ...query.projection, id: true, meta: true, _id: false }
      : { _id: false };

    const pipeline = [];

    pipeline.push({ $match: { ...query.match, "meta.docType": this.docType } });

    const filter = {
      $facet: {
        data: [
          { $skip: Math.max(0, query.skip || 0) },
          { $limit: Math.min(10000, query.limit || 1024) },
        ],
        total: [{ $count: "total" }],
      },
    };

    if (query.sort && query.sort.length > 0) {
      const $sort: { [key: string]: -1 | 1 } = {};
      query.sort.forEach((obj) => {
        $sort[obj.field] = obj.descending ? -1 : 1;
      });
      filter.$facet.data.push({ $sort } as any);
    }

    filter.$facet.data.push({ $project: projection } as any);

    pipeline.push(filter);

    return pipeline;
  }

  private validate(document: DeepPartial<T>) {
    this.validators.forEach((fn) => fn(document));
  }

  private async loadCurrentVersionOrThrow(
    operation: string,
    id: string,
    updatedAt: Date,
  ) {
    const existing = await this.load(id);
    if (
      !existing ||
      moment.utc(existing.meta.updated.at).toDate().getTime() !==
        updatedAt.getTime()
    ) {
      this.throwError(operation, id, updatedAt);
    }

    return existing!;
  }

  private throwError = (
    operation: string,
    id: string,
    updatedAt: Date | string,
  ) => {
    throw new Error(
      `${operation} failed for object with id="${id}", updated.at="${moment
        .utc(updatedAt)
        .toISOString()}".` +
        " Check that you are submitting the latest version.",
    );
  };
}
