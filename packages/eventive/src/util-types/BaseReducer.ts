import type { BaseDomainEvent } from "./BaseDomainEvent";

export type BaseReducer<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State,
> = (prevState: State, event: DomainEvent) => State;
