import type { BaseDomainEvent } from "./BaseDomainEvent";

export type BaseMapper<DomainEvent extends BaseDomainEvent<string, {}>> = (
  event: BaseDomainEvent<DomainEvent["eventName"], unknown>,
) => DomainEvent;
