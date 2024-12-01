import type { BaseDomainEvent } from "./BaseDomainEvent";

export type Entity<State extends {}> = {
  entityId: string;
  entityName: string;
  createdAt: string;
  updatedAt: string;
  state: State;
};

export type ToEntityArgs<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {}
> = {
  state: State;
  createdAt: string;
  lastEvent: DomainEvent;
};
export function toEntity<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {}
>(args: ToEntityArgs<DomainEvent, State>): Entity<State> {
  return {
    entityId: args.lastEvent.entityId,
    entityName: args.lastEvent.entityName,
    createdAt: args.createdAt,
    updatedAt: args.lastEvent.eventCreatedAt,
    state: args.state,
  };
}
