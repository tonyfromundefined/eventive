import type { BaseDomainEvent, Entity } from "./util-types";

export type EventiveStorageFindEventsByEntityIdsArgs = {
  entityName: string;
  entityIds: string[];
};

export type EventiveStorageCommitArgs<State extends {}> = {
  entityName: string;
  event: BaseDomainEvent<string, {}>;
  entity: Entity<State>;
};

export type EventiveStorageSaveSnapshotArgs<State extends {}> = {
  entityName: string;
  entity: Entity<State>;
};

export type EventiveStorage<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {},
> = {
  findEventsByEntityIds(
    args: EventiveStorageFindEventsByEntityIdsArgs,
  ): Promise<Array<DomainEvent>>;
  commit(args: EventiveStorageCommitArgs<State>): Promise<void>;
};
