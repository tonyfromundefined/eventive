import type { BaseDomainEvent, BaseEntity } from "./util-types";

export type EventivePlugin<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {}
> = {
  onCommitted?(args: { event: DomainEvent; entity: BaseEntity<State> }): void;
};
