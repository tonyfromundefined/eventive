import type { BaseDomainEvent, BaseEntity } from "./util-types";

export type EventivePlugin<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {}
> = {
  beforeCommit?(args: {
    event: DomainEvent;
    entity: BaseEntity<State>;
  }): void | Promise<void>;
  onCommitted?(args: {
    event: DomainEvent;
    entity: BaseEntity<State>;
  }): void | Promise<void>;
};
