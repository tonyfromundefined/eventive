import type { BaseDomainEvent } from "./BaseDomainEvent";

export type BaseMapper<
  CurrentRevision extends string,
  DomainEvent extends BaseDomainEvent<string, string, {}>
> = (event: DomainEvent) => Extract<DomainEvent, { revision: CurrentRevision }>;
