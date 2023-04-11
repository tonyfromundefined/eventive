import type { BaseDomainEvent } from "./BaseDomainEvent";

export type BaseReducer<
  CurrentRevision extends string,
  DomainEvent extends BaseDomainEvent<string, string, {}>,
  State
> = (
  prevState: State,
  event: Extract<DomainEvent, { revision: CurrentRevision }>
) => State;
