import type { BaseDomainEvent } from "./BaseDomainEvent";

export type BaseReducer<
  CurrentRevisionDomainEvent extends BaseDomainEvent<string, string, {}>,
  State
> = (prevState: State, event: CurrentRevisionDomainEvent) => State;
