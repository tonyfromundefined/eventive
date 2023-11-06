import { createId } from "@paralleldrive/cuid2";
import { groupBy, last, sortBy } from "lodash-es";
import type { Db, Filter, OptionalUnlessRequiredId } from "mongodb";

import type { EventivePlugin } from "./EventivePlugin";
import type {
  BaseDomainEvent,
  BaseEntity,
  BaseMapper,
  BaseReducer,
} from "./util-types";
import { toEntity } from "./util-types";

function bypass<T>(t: T) {
  return t;
}

export type EventiveQueryEventsArgs<
  DomainEvent extends BaseDomainEvent<string, {}>
> = {
  filter: Filter<DomainEvent>;
  limit?: number;
};

export type EventiveAllArgs<DomainEvent extends BaseDomainEvent<string, {}>> = {
  filter?: Filter<DomainEvent>;
};

export type EventiveFindOneArgs = { entityId: string };
export type EventiveBatchArgs = { entityIds: string[] };
export type EventiveCreateArgs<
  DomainEvent extends BaseDomainEvent<string, {}>,
  EventName extends DomainEvent["eventName"]
> = {
  eventName: EventName;
  eventBody: Extract<
    DomainEvent,
    {
      eventName: EventName;
    }
  >["body"];
  entityId?: string;
};
export type EventiveDispatchArgs<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {},
  EventName extends DomainEvent["eventName"]
> = {
  entity: BaseEntity<State>;
  eventName: EventName;
  eventBody: Extract<DomainEvent, { eventName: EventName }>["body"];
};

export type EventiveOptions<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {}
> = {
  db: Db;
  dbCollectionName?: string;
  entityName: string;
  reducer: BaseReducer<DomainEvent, State>;
  mapper?: BaseMapper<DomainEvent>;
  plugins?: EventivePlugin<DomainEvent, State>[];
};

export type Eventive<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {}
> = {
  queryEvents(
    args: EventiveQueryEventsArgs<DomainEvent>
  ): Promise<DomainEvent[]>;
  all(args?: EventiveAllArgs<DomainEvent>): Promise<BaseEntity<State>[]>;
  findOne(args: EventiveFindOneArgs): Promise<BaseEntity<State> | null>;
  batchGet(args: EventiveBatchArgs): Promise<BaseEntity<State>[]>;
  create<EventName extends DomainEvent["eventName"]>(
    args: EventiveCreateArgs<DomainEvent, EventName>
  ): {
    entity: BaseEntity<State>;
    event: DomainEvent;
    commit: () => Promise<void>;
  };
  dispatch<EventName extends DomainEvent["eventName"]>(
    args: EventiveDispatchArgs<DomainEvent, State, EventName>
  ): {
    entity: BaseEntity<State>;
    event: DomainEvent;
    commit: () => Promise<void>;
  };
};

export function eventive<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {}
>(options: EventiveOptions<DomainEvent, State>): Eventive<DomainEvent, State> {
  type Output = Eventive<DomainEvent, State>;

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
        event: options.mapper?.(event) ?? event,
        entity,
      });
    }
  };

  const queryEvents: Output["queryEvents"] = async ({ filter, limit }) => {
    const cursor = eventsCollection.find({
      entityName: options.entityName,
      ...filter,
    });

    if (typeof limit === "number") {
      cursor.limit(limit);
    }

    const events = await cursor.toArray();
    return events as DomainEvent[];
  };

  const all: Output["all"] = async (args) => {
    const events = await queryEvents({
      filter: args?.filter ?? {},
    });

    const eventMap = groupBy(
      sortBy(events, (e) => e.eventCreatedAt),
      (e) => e.entityId
    );

    const entities = Object.entries(eventMap).map(([, e]) => {
      const state = e
        .map(options.mapper ?? bypass)
        .reduce(options.reducer, {} as State);

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
    });

    if (events.length === 0) {
      return null;
    }

    const state = sortBy(events, (e) => e.eventCreatedAt)
      .map(options.mapper ?? bypass)
      .reduce(options.reducer, {} as State);

    const firstEvent = events[0];
    const lastEvent = last(events)!;

    const entity = {
      entityId: lastEvent.entityId,
      entityName: lastEvent.entityName,
      createdAt: firstEvent.eventCreatedAt,
      updatedAt: lastEvent.eventCreatedAt,
      state: state,
    };

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
    });

    const eventMap = groupBy(
      sortBy(events, (e) => e.eventCreatedAt),
      (e) => e.entityId
    );

    const entities = Object.entries(eventMap).map(([, e]) => {
      const state = e
        .map(options.mapper ?? bypass)
        .reduce(options.reducer, {} as State);

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

  const create: Output["create"] = ({ eventName, eventBody, entityId }) => {
    const eventId = createId();

    const event = {
      eventId,
      eventName,
      eventCreatedAt: new Date().toISOString(),
      entityName: options.entityName,
      entityId: entityId ?? createId(),
      body: eventBody,
    } as BaseDomainEvent<string, {}> as DomainEvent;

    const state = options.reducer(
      {} as State,
      options.mapper?.(event) ?? event
    );

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
      eventId,
      eventName,
      eventCreatedAt: new Date().toISOString(),
      entityName: options.entityName,
      entityId: entity.entityId,
      body: eventBody,
    } as BaseDomainEvent<string, {}> as DomainEvent;

    const nextState = options.reducer(
      entity.state,
      options.mapper?.(event) ?? event
    );

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
