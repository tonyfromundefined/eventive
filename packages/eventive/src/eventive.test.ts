import { last } from "lodash-es";
import type { Db } from "mongodb";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

import { eventive } from "./eventive";
import type { BaseDomainEvent, BaseReducer } from "./util-types";

type MyDomainEvent =
  | BaseDomainEvent<"init", { datetime: string }>
  | BaseDomainEvent<"update", { datetime: string }>;

type MyState = {
  createdDatetime: string;
  updatedDatetime: string;
};

type MyReducer = BaseReducer<MyDomainEvent, MyState>;

const reducer: MyReducer = (prevState, event) => {
  switch (event.eventName) {
    case "init":
      return {
        createdDatetime: event.body.datetime,
        updatedDatetime: event.body.datetime,
      };
    case "update":
      return {
        ...prevState,
        updatedDatetime: event.body.datetime,
      };
  }
};

function delay(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

describe("eventive()", () => {
  let mongod: MongoMemoryServer;
  let db: Db;

  beforeAll(async () => {
    // This will create an new instance of "MongoMemoryServer" and automatically start it
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();

    const client = new MongoClient(uri);
    db = client.db("test");
  });

  test("create entity", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity1",
      reducer,
    });

    const currentDatetime = new Date().toISOString();

    const { entity: e0, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    expect(e0.state.createdDatetime).toEqual(currentDatetime);
    expect(e0.state.updatedDatetime).toEqual(currentDatetime);

    const e1 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e1).toBeNull();

    await commitCreate();

    const e2 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e2?.state.createdDatetime).toEqual(currentDatetime);
    expect(e2?.state.updatedDatetime).toEqual(currentDatetime);

    const allEntities = await myRepository.all();

    expect(allEntities.length).toEqual(1);
    expect(allEntities[0].state.createdDatetime).toEqual(currentDatetime);
    expect(allEntities[0].state.updatedDatetime).toEqual(currentDatetime);

    const batchedEntities = await myRepository.batchGet({
      entityIds: [e0.entityId],
    });

    expect(batchedEntities.length).toEqual(1);
    expect(batchedEntities[0].state.createdDatetime).toEqual(currentDatetime);
    expect(batchedEntities[0].state.updatedDatetime).toEqual(currentDatetime);
  });

  test("create entity with entityId", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity1",
      reducer,
    });

    const currentDatetime = new Date().toISOString();

    const { entity: e0, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
      entityId: "<entity-id>",
    });

    expect(e0.entityId).toEqual("<entity-id>");

    await commitCreate();

    const e1 = await myRepository.findOne({
      entityId: "<entity-id>",
    });

    expect(e1?.entityId).toEqual("<entity-id>");

    const allEntities = await myRepository.all();

    expect(last(allEntities)?.entityId).toEqual("<entity-id>");

    const batchedEntities = await myRepository.batchGet({
      entityIds: ["<entity-id>"],
    });

    expect(batchedEntities.length).toEqual(1);
    expect(batchedEntities[0].entityId).toEqual("<entity-id>");
  });

  test("update entity", async () => {
    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
    });

    const currentDatetime = new Date().toISOString();

    const {
      entity: e0,
      commit: commitCreate,
      event: createEvent,
    } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    expect(e0.state.createdDatetime).toEqual(currentDatetime);
    expect(e0.state.updatedDatetime).toEqual(currentDatetime);

    const e1 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e1).toBeNull();

    await commitCreate();

    const e2 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e2?.state.createdDatetime).toEqual(currentDatetime);
    expect(e2?.state.updatedDatetime).toEqual(currentDatetime);

    await delay(100);

    const updatedDatetime = new Date().toISOString();

    const { entity: e3, commit: commitUpdate } = myRepository.dispatch({
      entity: e2!,
      eventName: "update",
      eventBody: {
        datetime: updatedDatetime,
      },
    });

    expect(e3?.state.createdDatetime).toEqual(currentDatetime);
    expect(e3?.state.updatedDatetime).toEqual(updatedDatetime);

    const e4 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e4?.state.createdDatetime).toEqual(currentDatetime);
    expect(e4?.state.updatedDatetime).toEqual(currentDatetime);

    await commitUpdate();

    const e5 = await myRepository.findOne({
      entityId: e0.entityId,
    });

    expect(e5?.state.createdDatetime).toEqual(currentDatetime);
    expect(e5?.state.updatedDatetime).toEqual(updatedDatetime);

    const limitedEvents = await myRepository.queryEvents({
      filter: {},
      limit: 1,
    });

    expect(limitedEvents.length).toEqual(1);
    expect(limitedEvents[0]).toStrictEqual(createEvent);
  });

  test("plugin interface: onCommitted", async () => {
    const onCommit = vi.fn(() => {});

    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
      plugins: [
        {
          onCommitted() {
            onCommit();
          },
        },
      ],
    });

    const currentDatetime = new Date().toISOString();

    const { entity, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    expect(onCommit).toHaveBeenCalledTimes(0);

    await commitCreate();

    expect(onCommit).toHaveBeenCalledTimes(1);

    const { commit: commitUpdate } = myRepository.dispatch({
      entity,
      eventName: "update",
      eventBody: {
        datetime: new Date().toISOString(),
      },
    });

    expect(onCommit).toHaveBeenCalledTimes(1);

    await commitUpdate();

    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  test("plugin interface: beforeCommit", async () => {
    const beforeCommitHook = vi.fn(() => {});

    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
      plugins: [
        {
          beforeCommit() {
            beforeCommitHook();
          },
        },
      ],
    });

    const currentDatetime = new Date().toISOString();

    const { entity, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: currentDatetime,
      },
    });

    expect(beforeCommitHook).toHaveBeenCalledTimes(0);

    await commitCreate();

    expect(beforeCommitHook).toHaveBeenCalledTimes(1);

    const { commit: commitUpdate } = myRepository.dispatch({
      entity,
      eventName: "update",
      eventBody: {
        datetime: new Date().toISOString(),
      },
    });

    expect(beforeCommitHook).toHaveBeenCalledTimes(1);

    await commitUpdate();

    expect(beforeCommitHook).toHaveBeenCalledTimes(2);
  });

  test("beforeCommit plugin works as expect", async () => {
    const blockCommitPlugin = ({
      event,
      abortCommit,
    }: {
      event: MyDomainEvent;
      abortCommit: () => void;
    }) => {
      if (event.eventName === "update") {
        abortCommit();
      }
    };

    const myRepository = eventive({
      db,
      entityName: "MyEntity2",
      reducer,
      plugins: [
        {
          beforeCommit: blockCommitPlugin,
        },
      ],
    });

    const initDatetime = new Date().toISOString();

    const { entity, commit: commitCreate } = myRepository.create({
      eventName: "init",
      eventBody: {
        datetime: initDatetime,
      },
    });

    await commitCreate();

    await delay(100);

    const updatedDatetime = new Date().toISOString();

    const { commit: commitUpdate } = myRepository.dispatch({
      entity,
      eventName: "update",
      eventBody: {
        datetime: updatedDatetime,
      },
    });

    await commitUpdate();

    const targetEntity = await myRepository.findOne({
      entityId: entity.entityId,
    });

    if (!targetEntity) {
      throw new Error("targetEntity not found");
    }

    expect(targetEntity.updatedAt).toBe(initDatetime);
    expect(targetEntity.updatedAt).not.toBe(updatedDatetime);
  });

  afterAll(async () => {
    await mongod.stop();
  });
});
