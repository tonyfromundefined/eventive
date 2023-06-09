import { createId } from "@paralleldrive/cuid2";
import { groupBy, last } from "lodash-es";
import type { Db, Filter, OptionalUnlessRequiredId, Sort } from "mongodb";

import type { EventivePlugin } from "./EventivePlugin";
import type {
  BaseDomainEvent,
  BaseEntity,
  BaseMapper,
  BaseReducer,
} from "./util-types";
import { toEntity } from "./util-types";

export type EventiveQueryEventsArgs<
  DomainEvent extends BaseDomainEvent<string, string, {}>
> = {
  filter: Filter<DomainEvent>;
  sort?: Sort;
  limit?: number;
};

export type EventiveAllArgs<
  DomainEvent extends BaseDomainEvent<string, string, {}>
> = {
  filter?: Filter<DomainEvent>;
};

export type EventiveFindOneArgs = { entityId: string };
export type EventiveBatchArgs = { entityIds: string[] };
export type EventiveCreateArgs<
  CurrentRevision extends string,
  DomainEvent extends BaseDomainEvent<string, string, {}>,
  EventName extends DomainEvent["eventName"]
> = {
  eventName: EventName;
  eventBody: Extract<
    DomainEvent,
    {
      revision: CurrentRevision;
      eventName: EventName;
    }
  >["body"];
};
export type EventiveDispatchArgs<
  CurrentRevision extends string,
  DomainEvent extends BaseDomainEvent<string, string, {}>,
  State extends {},
  EventName extends DomainEvent["eventName"]
> = {
  entity: BaseEntity<State>;
  eventName: EventName;
  eventBody: Extract<
    DomainEvent,
    {
      revision: CurrentRevision;
      eventName: EventName;
    }
  >["body"];
};

export type EventiveOptions<
  CurrentRevision extends string,
  DomainEvent extends BaseDomainEvent<string, string, {}>,
  State extends {}
> = {
  db: Db;
  dbCollectionName?: string;
  entityName: string;
  currentRevision: CurrentRevision;
  reducer: BaseReducer<
    Extract<DomainEvent, { revision: CurrentRevision }>,
    State
  >;
  mapper: BaseMapper<CurrentRevision, DomainEvent>;
  plugins?: EventivePlugin<CurrentRevision, DomainEvent, State>[];
};

export type Eventive<
  CurrentRevision extends string,
  DomainEvent extends BaseDomainEvent<string, string, {}>,
  State extends {}
> = {
  queryEvents(
    args: EventiveQueryEventsArgs<DomainEvent>
  ): Promise<DomainEvent[]>;
  all(args?: EventiveAllArgs<DomainEvent>): Promise<BaseEntity<State>[]>;
  findOne(args: EventiveFindOneArgs): Promise<BaseEntity<State> | null>;
  batchGet(args: EventiveBatchArgs): Promise<BaseEntity<State>[]>;
  create<EventName extends DomainEvent["eventName"]>(
    args: EventiveCreateArgs<CurrentRevision, DomainEvent, EventName>
  ): {
    entity: BaseEntity<State>;
    event: DomainEvent;
    commit: () => Promise<void>;
  };
  dispatch<EventName extends DomainEvent["eventName"]>(
    args: EventiveDispatchArgs<CurrentRevision, DomainEvent, State, EventName>
  ): {
    entity: BaseEntity<State>;
    event: DomainEvent;
    commit: () => Promise<void>;
  };
};

export function eventive<
  CurrentRevision extends string,
  DomainEvent extends BaseDomainEvent<string, string, {}>,
  State extends {}
>(
  options: EventiveOptions<CurrentRevision, DomainEvent, State>
): Eventive<CurrentRevision, DomainEvent, State> {
  type Output = Eventive<CurrentRevision, DomainEvent, State>;

  const eventsCollection = options.db.collection<DomainEvent>(
    options.dbCollectionName ?? "events"
  );

  const plugins = options.plugins ?? [];

  const commitEvent = async ({
    event,
    entity,
  }: {
    event: DomainEvent;
    entity: BaseEntity<State>;
  }) => {
    const eventDocument = event as OptionalUnlessRequiredId<DomainEvent>;

    await eventsCollection.insertOne(eventDocument);

    for (const plugin of plugins) {
      plugin.onCommitted?.({
        event: options.mapper(event),
        entity,
      });
    }
  };

  const queryEvents: Output["queryEvents"] = async ({
    filter,
    sort,
    limit,
  }) => {
    const cursor = eventsCollection.find({
      entityName: options.entityName,
      ...filter,
    });

    if (sort) {
      cursor.sort(sort);
    }
    if (typeof limit === "number") {
      cursor.limit(limit);
    }

    const events = await cursor.toArray();
    return events as DomainEvent[];
  };

  const all: Output["all"] = async (args) => {
    const events = await queryEvents({
      filter: args?.filter ?? {},
      sort: {
        eventDate: -1,
      },
    });

    const eventMap = groupBy(events, (e) => e.entityId);

    const entities = Object.entries(eventMap).map(([, e]) => {
      const state = e.map(options.mapper).reduce(options.reducer, {} as State);

      const firstEvent = e[0];
      const lastEvent = last(e)!;

      return toEntity({
        state,
        createdAt: firstEvent.eventCreatedAt,
        lastEvent,
      });
    });

    return entities;
  };

  const findOne: Output["findOne"] = async ({ entityId }) => {
    const eventsFilter = {
      entityId,
    } as Filter<DomainEvent>;

    const events = await queryEvents({
      filter: eventsFilter,
      sort: {
        eventDate: -1,
      },
    });

    if (events.length === 0) {
      return null;
    }

    const state = events
      .map(options.mapper)
      .reduce(options.reducer, {} as State);

    const firstEvent = events[0];
    const lastEvent = last(events)!;

    const entity = toEntity({
      state,
      lastEvent,
      createdAt: firstEvent.eventCreatedAt,
    });

    return entity;
  };

  const batchGet: Output["batchGet"] = async ({ entityIds }) => {
    const filter = {
      entityId: {
        $in: entityIds,
      },
    } as Filter<DomainEvent>;

    const events = await queryEvents({
      filter,
      sort: {
        eventDate: -1,
      },
    });

    const eventMap = groupBy(events, (e) => e.entityId);

    const entities = Object.entries(eventMap).map(([, e]) => {
      const state = e.map(options.mapper).reduce(options.reducer, {} as State);

      const firstEvent = e[0];
      const lastEvent = last(e)!;

      return toEntity({
        state,
        lastEvent,
        createdAt: firstEvent.eventCreatedAt,
      });
    });

    return entities;
  };

  const create: Output["create"] = ({ eventName, eventBody }) => {
    const eventId = createId();
    const entityId = createId();

    const event = {
      revision: options.currentRevision,
      eventId,
      eventName,
      eventCreatedAt: new Date().toISOString(),
      entityName: options.entityName,
      entityId,
      body: eventBody,
    } as BaseDomainEvent<string, string, {}> as DomainEvent;

    const state = options.reducer({} as State, options.mapper(event));

    const entity = toEntity({
      state,
      createdAt: event.eventCreatedAt,
      lastEvent: event,
    });

    return {
      event,
      entity,
      commit: () =>
        commitEvent({
          event,
          entity,
        }),
    };
  };

  const dispatch: Output["dispatch"] = ({ entity, eventName, eventBody }) => {
    const eventId = createId();

    const event = {
      revision: options.currentRevision,
      eventId,
      eventName,
      eventCreatedAt: new Date().toISOString(),
      entityName: options.entityName,
      entityId: entity.entityId,
      body: eventBody,
    } as BaseDomainEvent<string, string, {}> as DomainEvent;

    const nextState = options.reducer(entity.state, options.mapper(event));

    const updatedEntity = toEntity({
      state: nextState,
      lastEvent: event,
      createdAt: entity.createdAt,
    });

    return {
      event,
      entity: updatedEntity,
      commit: () =>
        commitEvent({
          event,
          entity,
        }),
    };
  };

  return {
    queryEvents,
    all,
    findOne,
    batchGet,
    create,
    dispatch,
  };
}
