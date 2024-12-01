import type { BaseDomainEvent, Entity } from "./util-types";

export type EventivePlugin<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {},
> = {
  beforeCommit?(args: {
    event: DomainEvent;
    entity: Entity<State>;
    prevEntity?: Entity<State>;
  }): Promise<void> | void;
  onCommitted?(args: {
    event: DomainEvent;
    entity: Entity<State>;
    prevEntity?: Entity<State>;
  }): Promise<void> | void;
};
