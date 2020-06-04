export interface AuditEvent {
  at: Date | string;
  by: string;
}

export interface Meta {
  docType: string;
  created: AuditEvent;
  updated: AuditEvent;
}

export interface Document {
  id: string;
  meta: Meta;
}

// New<T> is type T without Document properties (id, meta),
// which are only added to an object when it is first saved.
export type New<T extends Document> = Omit<T, keyof Document>;
