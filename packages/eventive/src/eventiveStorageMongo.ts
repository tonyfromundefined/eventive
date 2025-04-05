import type { Db, Filter, OptionalUnlessRequiredId } from "mongodb";

import type { EventiveStorage } from "./EventiveStorage";
import type { BaseDomainEvent, Entity } from "./util-types";

export function eventiveStorageMongo<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {},
>({
  db,
  eventsCollectionName,
  snapshotsCollectionName,
}: {
  db: Db;
  eventsCollectionName: string;
  snapshotsCollectionName: string;
}): EventiveStorage<DomainEvent, State> {
  const eventsCollection = db.collection<DomainEvent>(eventsCollectionName);
  const snapshotsCollection = db.collection<Entity<State>>(
    snapshotsCollectionName,
  );

  return {
    async findEventsByEntityIds({ entityName, entityIds }) {
      const filter = {
        entityName,
        entityId: {
          $in: entityIds,
        },
      } as Filter<DomainEvent>;

      const cursor = eventsCollection.find(filter);
      const events = (await cursor.toArray()) as DomainEvent[];

      return events;
    },
    async commit({ event, entity }) {
      await eventsCollection.insertOne(
        event as OptionalUnlessRequiredId<DomainEvent>,
      );
      await snapshotsCollection.updateOne(
        { entityId: entity.entityId } as Filter<Entity<State>>,
        { $set: entity },
        { upsert: true },
      );
    },
  };
}
