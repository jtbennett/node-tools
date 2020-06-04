import { hostname } from "os";
import { eachSeries } from "async";
import { MongoClient, IndexOptions, MongoClientOptions } from "mongodb";
import { isMatch, isEqual } from "lodash";
import * as moment from "moment";

import { Logger } from "@jtbennett/node-utils";

const defaultClientOptions: MongoClientOptions = {
  useUnifiedTopology: true,
  useNewUrlParser: true,
  serverSelectionTimeoutMS: 5000,
  readConcern: "majority",
  readPreference: "primary",
  w: "majority",
};

const defaultIndexOptions: IndexOptions = {
  collation: { locale: "en_US", strength: 1 },
};

export interface MongoWrapperOptions {
  logger?: Logger;
  connectionString: string;
  clientOptions?: MongoClientOptions;
  defaultIndexOptions?: IndexOptions;
}

export interface IndexDefinition {
  dbName: string;
  collection: string;
  key: {};
  options: IndexOptions;
}

export class MongoWrapper {
  client!: MongoClient;
  readonly logger: Logger;
  private readonly clientOptions: MongoClientOptions;
  private readonly defaultIndexOptions: IndexOptions;
  private readonly connectionString: string;
  private readonly appName!: string;
  private indexes: IndexDefinition[] = [];
  private initializeCalled = false;
  private indexesCreated = false;
  private nextRetryDelay = moment.duration(1, "second");
  private maxRetryDelay = moment.duration(60, "seconds");

  constructor(readonly options: MongoWrapperOptions) {
    this.logger = options.logger || console;
    this.clientOptions = { ...defaultClientOptions, ...options.clientOptions };
    this.defaultIndexOptions = {
      ...defaultIndexOptions,
      ...options.defaultIndexOptions,
    };
    this.connectionString = options.connectionString;
    this.appName =
      this.clientOptions.appname || `${hostname()} (pid: ${process.pid})`;
  }

  addIndexes(...indexes: IndexDefinition[]) {
    if (this.initializeCalled) {
      throw new Error(
        "MongoWrapper.addIndexes() must be called before calling initialize().",
      );
    }

    this.indexes.push(...indexes);
    return this;
  }

  async initialize(onConnected?: () => Promise<void>) {
    if (this.initializeCalled) {
      throw new Error("MongoWrapper.initialize() has already been called.");
    }
    this.initializeCalled = true;

    await this._initialize(onConnected);
    return this;
  }

  private async _initialize(onConnected?: () => Promise<void>) {
    if (!this.client) {
      try {
        const { client } = await this._connect();
        this.client = client;
      } catch (err) {
        this.logger.error(
          `Could not connect to Mongo. Waiting ${this.nextRetryDelay.asSeconds()} seconds to try again`,
          { app: this.appName, uri: this.connectionString, err },
        );
        setTimeout(() => {
          this._initialize(onConnected);
        }, this.nextRetryDelay.asMilliseconds());

        this._updateNextRetryDelay();
      }
    }

    if (this.client) {
      await this._ensureIndexesExist();
      if (onConnected) {
        await onConnected();
      }
    }
  }

  private _updateNextRetryDelay() {
    const doubled = this.nextRetryDelay.clone().add(this.nextRetryDelay);
    this.nextRetryDelay =
      doubled.asMilliseconds() < this.maxRetryDelay.asMilliseconds()
        ? doubled
        : this.maxRetryDelay;
    const jitter = Math.floor(Math.random() * 2000) - 800;
    this.nextRetryDelay.add(jitter, "milliseconds");
  }

  private async _connect() {
    const client = await MongoClient.connect(
      this.connectionString,
      defaultClientOptions,
    );
    this.logger.info(`Mongo connected.`, {
      app: this.appName,
      uri: this.connectionString,
    });

    client.on("close", () => {
      this.logger.error(`Mongo connection closed.`, {
        app: this.appName,
        uri: this.connectionString,
      });
    });

    client.on("error", (err: Error) => {
      this.logger.error(`Mongo error.`, {
        app: this.appName,
        uri: this.connectionString,
        message: err.message,
      });
    });

    return { client };
  }

  private async _ensureIndexesExist() {
    if (this.indexesCreated || !this.indexes || this.indexes.length === 0) {
      return;
    }

    const unchangedIndexes: string[] = [];

    // eslint-disable-next-line @typescript-eslint/await-thenable, @typescript-eslint/no-misused-promises
    await eachSeries(this.indexes, async (index) => {
      try {
        const db = this.client.db(index.dbName);
        await db.createCollection(index.collection);
        const existing = await this._getExistingIndexStatus(index);
        if (existing.unchanged) {
          unchangedIndexes.push(index.options.name!);
          return;
        }
        if (existing.exists) {
          await db.collection(index.collection).dropIndex(index.options.name!);
        }
        await db
          .collection(index.collection)
          .createIndex(index.key, index.options);
        this.logger.info("Mongo index recreated", { app: this.appName, index });
      } catch (err) {
        this.logger.error("Error creating mongo index", {
          app: this.appName,
          err,
        });
      }
    }),
      this.logger.info("Mongo indexes unchanged.", {
        app: this.appName,
        unchangedIndexes: unchangedIndexes.join(", "),
      });
  }

  private async _getExistingIndexStatus(index: IndexDefinition) {
    const db = this.client.db(index.dbName);
    const result = await db.collection(index.collection).indexes();
    const existing = result.find((idx: any) => idx.name === index.options.name);
    const unchanged =
      existing &&
      isEqual(existing.key, index.key) &&
      isMatch(existing, index.options);

    return { exists: existing ? true : false, unchanged };
  }
}
