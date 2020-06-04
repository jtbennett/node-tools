import { Document } from "./Document";

export interface Query {
  match?: {};
  skip?: number;
  limit?: number;
  sort?: { field: string; descending?: boolean }[];
  projection?: { [key: string]: boolean };
}

export interface QueryResult<T extends Document> {
  query: Query;
  total: number;
  results: T[];
}
