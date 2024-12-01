import { createId } from "@paralleldrive/cuid2";
import { compact, groupBy, last, sortBy } from "lodash-es";

import type { EventivePlugin } from "./EventivePlugin";
import type {
  BaseDomainEvent,
  BaseMapper,
  BaseReducer,
  Entity,
} from "./util-types";

import type {
  EventiveStorage,
  EventiveStorageFindEventsArgs,
} from "./EventiveStorage";
import { toEntity } from "./util-types";

function defaultMapper(t: any) {
  return t;
}

export type EventiveFindOneByEntityIdArgs = {
  entityId: string;
};

export type EventiveFindByEntityIdsArgs = {
  entityIds: string[];
};

export type EventiveCreateArgs<
  DomainEvent extends BaseDomainEvent<string, {}>,
  EventName extends DomainEvent["eventName"],
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
  EventName extends DomainEvent["eventName"],
> = {
  entity: Entity<State>;
  eventName: EventName;
  eventBody: Extract<DomainEvent, { eventName: EventName }>["body"];
};

export type EventiveOptions<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {},
> = {
  entityName: string;
  storage: EventiveStorage<BaseDomainEvent<string, {}>, {}>;
  reducer: BaseReducer<DomainEvent, State>;
  mapper?: BaseMapper<DomainEvent>;
  plugins?: EventivePlugin<DomainEvent, State>[];
};

export type Eventive<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {},
> = {
  findByEntityIds(args: EventiveFindByEntityIdsArgs): Promise<Entity<State>[]>;
  findOneByEntityId(
    args: EventiveFindOneByEntityIdArgs,
  ): Promise<Entity<State> | null>;
  findEvents(args: { filter: Partial<Omit<DomainEvent, "body">> }): Promise<
    Array<DomainEvent>
  >;
  create<EventName extends DomainEvent["eventName"]>(
    args: EventiveCreateArgs<DomainEvent, EventName>,
  ): {
    entity: Entity<State>;
    event: DomainEvent;
    commit: () => Promise<void>;
  };
  dispatch<EventName extends DomainEvent["eventName"]>(
    args: EventiveDispatchArgs<DomainEvent, State, EventName>,
  ): {
    entity: Entity<State>;
    event: DomainEvent;
    commit: () => Promise<void>;
  };
};

export function eventive<
  DomainEvent extends BaseDomainEvent<string, {}>,
  State extends {},
>({
  entityName,
  reducer,
  storage,
  mapper = defaultMapper,
  plugins = [],
}: EventiveOptions<DomainEvent, State>): Eventive<DomainEvent, State> {
  type Output = Eventive<DomainEvent, State>;

  const findOneByEntityId: Output["findOneByEntityId"] = async ({
    entityId,
  }) => {
    const filter = {
      entityId,
    } as EventiveStorageFindEventsArgs["filter"];

    const events = await storage.findEvents({
      entityName,
      filter,
    });

    if (events.length === 0) {
      return null;
    }

    const state = sortBy(events, (e) => e.eventCreatedAt)
      .map(mapper)
      .reduce(reducer, {} as State);

    const firstEvent = events[0];
    const lastEvent = last(events)!;

    const entity = toEntity({
      state,
      createdAt: firstEvent.eventCreatedAt,
      lastEvent: lastEvent,
    });

    return entity;
  };

  const findByEntityIds: Output["findByEntityIds"] = async ({ entityIds }) => {
    const events = await storage.findEventsByEntityIds({
      entityName,
      entityIds,
    });

    const eventMap = groupBy(
      sortBy(events, (e) => e.eventCreatedAt),
      (e) => e.entityId,
    );

    return compact(
      entityIds.map((entityId) => {
        const e = eventMap[entityId];

        if (!e) {
          return null;
        }

        const state = e.map(mapper).reduce(reducer, {} as State);

        const firstEvent = e[0];
        const lastEvent = last(e)!;

        return toEntity({
          state,
          lastEvent,
          createdAt: firstEvent.eventCreatedAt,
        });
      }),
    );
  };

  const commitEvent = async ({
    event,
    entity,
    prevEntity,
  }: {
    event: DomainEvent;
    entity: Entity<State>;
    prevEntity?: Entity<State>;
  }) => {
    for (const plugin of plugins) {
      await plugin.beforeCommit?.({
        event: mapper(event),
        entity,
        prevEntity,
      });
    }

    await storage.commit({
      entityName,
      event,
      entity,
    });

    for (const plugin of plugins) {
      await plugin.onCommitted?.({
        event: mapper(event),
        entity,
        prevEntity,
      });
    }
  };

  const create: Output["create"] = ({ eventName, eventBody, entityId }) => {
    const eventId = createId();

    const event = {
      eventId,
      eventName,
      eventCreatedAt: new Date().toISOString(),
      entityName,
      entityId: entityId ?? createId(),
      body: eventBody,
    } as BaseDomainEvent<string, {}> as DomainEvent;

    const state = reducer({} as State, mapper(event));

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

  const dispatch: Output["dispatch"] = ({
    entity: prevEntity,
    eventName,
    eventBody,
  }) => {
    const eventId = createId();

    const event = {
      eventId,
      eventName,
      eventCreatedAt: new Date().toISOString(),
      entityName,
      entityId: prevEntity.entityId,
      body: eventBody,
    } as BaseDomainEvent<string, {}> as DomainEvent;

    const state = reducer(prevEntity, mapper(event));

    const entity = toEntity({
      state,
      lastEvent: event,
      createdAt: prevEntity.createdAt,
    });

    return {
      event,
      entity,
      commit: () =>
        commitEvent({
          event,
          entity,
          prevEntity,
        }),
    };
  };

  return {
    findOneByEntityId: findOneByEntityId,
    findByEntityIds: findByEntityIds,
    findEvents(args) {
      return storage.findEvents({ entityName, filter: args.filter }) as Promise<
        Array<DomainEvent>
      >;
    },
    create,
    dispatch,
  };
}
